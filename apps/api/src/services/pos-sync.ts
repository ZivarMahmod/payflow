/**
 * POS sync service — pull open orders from a POS and mirror them into
 * `orders_cache`. Runs with service-role (bypasses RLS) because it
 * writes across tenants.
 *
 * Per-brief guarantees:
 *   - Upsert keyed on UNIQUE (restaurant_id, pos_order_id, pos_type).
 *   - Orders that disappeared from the POS response are flipped to
 *     status='closed'. We never delete cache rows; downstream payments
 *     reference them.
 *   - Errors per restaurant are isolated — one failing integration must
 *     not take down the scheduler.
 *   - Never writes to the POS. `markOrderPaid` is a separate flow
 *     (API-004) and lives outside this file.
 */

import type { Database, OrderCacheInsert, PosType } from '@flowpay/db/types';
import {
  getPOSProvider,
  POSAdapterError,
  type POSOrder,
  type POSProvider,
} from '@flowpay/pos-adapters';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PosIntegrationRow {
  id: string;
  restaurant_id: string;
  location_id: string;
  type: PosType;
  external_location_id: string;
  status: 'active' | 'paused' | 'error';
  credentials_encrypted: string | null;
}

export interface SyncResult {
  integrationId: string;
  restaurantId: string;
  scanned: number;
  upserted: number;
  closed: number;
  durationMs: number;
}

export interface SyncLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface PosSyncDeps {
  adminClient: SupabaseClient<Database>;
  /** Override for tests / mock mode. Defaults to the real registry. */
  providerFactory?: (type: PosType) => POSProvider;
  /** Whether every adapter should be created in mock mode. */
  mock?: boolean;
  logger?: SyncLogger;
}

export class PosSyncService {
  constructor(private readonly deps: PosSyncDeps) {}

  /** Sync exactly one integration. Swallows no errors — caller decides. */
  async syncIntegration(integration: PosIntegrationRow): Promise<SyncResult> {
    const started = performance.now();

    const provider = this.buildProvider(integration);

    // Authenticate on each run — credentials can rotate. For the mock
    // path this is a no-op apart from a shape check.
    await provider.authenticate(await this.loadCredentials(integration));

    const orders = await provider.fetchOpenOrders(integration.external_location_id);
    const upserted = await this.upsertOrders(integration, orders);
    const closed = await this.closeMissing(integration, orders);

    const durationMs = Math.round(performance.now() - started);
    return {
      integrationId: integration.id,
      restaurantId: integration.restaurant_id,
      scanned: orders.length,
      upserted,
      closed,
      durationMs,
    };
  }

  /** Sync every active integration. Per-integration failures are logged + counted. */
  async syncAll(): Promise<{
    ok: SyncResult[];
    failed: Array<{ integration: PosIntegrationRow; error: string }>;
  }> {
    const integrations = await this.fetchActiveIntegrations();
    const ok: SyncResult[] = [];
    const failed: Array<{ integration: PosIntegrationRow; error: string }> = [];

    for (const integ of integrations) {
      try {
        const result = await this.syncIntegration(integ);
        ok.push(result);
        this.deps.logger?.info('pos sync ok', { ...result });
        // Success — clear any prior error on this row.
        await this.markOk(integ.id);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failed.push({ integration: integ, error: reason });
        this.deps.logger?.error('pos sync failed', {
          integrationId: integ.id,
          restaurantId: integ.restaurant_id,
          error: reason,
          code: err instanceof POSAdapterError ? err.code : undefined,
        });
        await this.markError(integ.id, reason, err instanceof POSAdapterError ? err.code : null);
      }
    }

    return { ok, failed };
  }

  // ─── internals ────────────────────────────────────────────────────────

  private buildProvider(integration: PosIntegrationRow): POSProvider {
    if (this.deps.providerFactory) {
      return this.deps.providerFactory(integration.type);
    }
    return getPOSProvider(integration.type, { mock: this.deps.mock ?? false });
  }

  private async loadCredentials(integration: PosIntegrationRow): Promise<Record<string, string>> {
    if (this.deps.mock) {
      // Mocks never unlock Vault. Placeholder shape is enough.
      return { apiKey: 'mock-apikey' };
    }

    // Real mode — service-role calls the SECURITY DEFINER helper.
    const { data, error } = await this.deps.adminClient.rpc(
      'get_pos_credentials',
      { p_integration_id: integration.id },
    );
    if (error) {
      throw new POSAdapterError('AUTH_FAILED', `Vault lookup failed: ${error.message}`, {
        retryable: false,
      });
    }
    if (typeof data !== 'string' || data.length === 0) {
      throw new POSAdapterError('AUTH_FAILED', `No credentials stored for integration ${integration.id}`, {
        retryable: false,
      });
    }
    // The ciphertext is expected to be a JSON blob { apiKey: "...", baseUrl?: "..." } post-decrypt.
    try {
      return JSON.parse(data) as Record<string, string>;
    } catch (err) {
      throw new POSAdapterError('AUTH_FAILED', 'Credentials ciphertext is not JSON after decrypt', {
        retryable: false,
        cause: err,
      });
    }
  }

  private async fetchActiveIntegrations(): Promise<PosIntegrationRow[]> {
    const { data, error } = await this.deps.adminClient
      .from('pos_integrations')
      .select('id, restaurant_id, location_id, type, external_location_id, status, credentials_encrypted')
      .eq('status', 'active');

    if (error) {
      throw new Error(`fetchActiveIntegrations: ${error.message}`);
    }
    return (data ?? []) as PosIntegrationRow[];
  }

  private async upsertOrders(
    integration: PosIntegrationRow,
    orders: POSOrder[],
  ): Promise<number> {
    if (orders.length === 0) return 0;

    const rows: OrderCacheInsert[] = orders.map((o) => ({
      restaurant_id: integration.restaurant_id,
      location_id: integration.location_id,
      pos_order_id: o.externalId,
      pos_type: integration.type,
      total: o.total,
      currency: o.currency,
      items: o.items as unknown as OrderCacheInsert['items'],
      status: o.closed ? 'closed' : 'open',
      opened_at: o.openedAt.toISOString(),
      last_synced_at: new Date().toISOString(),
    }));

    const { error } = await this.deps.adminClient
      .from('orders_cache')
      .upsert(rows, {
        onConflict: 'restaurant_id,pos_order_id,pos_type',
        ignoreDuplicates: false,
      });

    if (error) {
      throw new Error(`upsert orders_cache: ${error.message}`);
    }
    return rows.length;
  }

  /**
   * Any order_cache row for this integration that is currently 'open'
   * or 'paying' but is NOT in the latest POS response is considered
   * closed at the POS.
   */
  private async closeMissing(
    integration: PosIntegrationRow,
    orders: POSOrder[],
  ): Promise<number> {
    const seen = new Set(orders.map((o) => o.externalId));

    // Fetch currently-cached rows for this integration.
    const { data: existing, error: fetchErr } = await this.deps.adminClient
      .from('orders_cache')
      .select('id, pos_order_id, status')
      .eq('restaurant_id', integration.restaurant_id)
      .eq('location_id', integration.location_id)
      .eq('pos_type', integration.type)
      .in('status', ['open', 'paying']);

    if (fetchErr) {
      throw new Error(`closeMissing: fetch failed: ${fetchErr.message}`);
    }
    const toClose = (existing ?? []).filter((row) => !seen.has(row.pos_order_id));
    if (toClose.length === 0) return 0;

    const { error: updErr } = await this.deps.adminClient
      .from('orders_cache')
      .update({ status: 'closed' })
      .in(
        'id',
        toClose.map((r) => r.id),
      );

    if (updErr) {
      throw new Error(`closeMissing: update failed: ${updErr.message}`);
    }
    return toClose.length;
  }

  private async markOk(id: string): Promise<void> {
    await this.deps.adminClient
      .from('pos_integrations')
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq('id', id);
  }

  private async markError(id: string, error: string, code: string | null): Promise<void> {
    // AUTH_FAILED / NOT_FOUND → flip to 'error' (needs human). Transient
    // network / 5xx stays 'active' so we retry next cycle.
    const fatal = code === 'AUTH_FAILED' || code === 'NOT_FOUND' || code === 'UNSUPPORTED';
    await this.deps.adminClient
      .from('pos_integrations')
      .update({
        last_error: `${code ?? 'UNKNOWN'}: ${error.slice(0, 500)}`,
        ...(fatal ? { status: 'error' } : {}),
      })
      .eq('id', id);
  }
}
