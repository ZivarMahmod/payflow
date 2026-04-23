/**
 * POS update queue worker — drains `pos_update_queue`, calls the POS
 * adapter's `markOrderPaid`, and reports success/failure back to the DB.
 *
 * Why a queue and not "POS-call inside the /confirm route"?
 *   - The guest already paid by the time we reach the confirm code path.
 *     Failing the response because the POS API is slow or unreachable
 *     would (a) make the guest think the payment broke and (b) tempt them
 *     to retry, which would then double-charge once the POS recovers.
 *   - We must guarantee at-least-once delivery without ever calling the
 *     POS twice for the same payment. The DB enforces "at most one queue
 *     row per (payment, action)" via UNIQUE — see migration 007. This
 *     worker provides "at least once" by retrying with backoff until
 *     success or `max_attempts`.
 *
 * Architecture mirror of `SyncScheduler` / `PaymentExpirerScheduler`:
 *   - setInterval-driven tick with jittered start.
 *   - Process-level circuit breaker on consecutive uncaught errors.
 *   - Lease-based dequeue (`claim_pos_update_queue_items` RPC) so two
 *     worker replicas never grab the same row.
 *   - Per-row failures are reported to the DB; only RPC-level failures
 *     propagate up to the scheduler's failure counter.
 *
 * Backoff policy lives HERE, not in the DB:
 *   [5 s, 30 s, 2 min, 10 min, 1 h] — index = current `attempts`.
 *   After the 5th failure the DB flips status='failed' and the row is
 *   surfaced in the admin dashboard.
 *
 * Per-row lease: 60 s. Plenty of head-room for a slow POS call (Onslip's
 * /close endpoint typically returns in <1 s but we allow for 30-s p99 +
 * margin). If we crash mid-call the next claim cycle (≥60 s later)
 * recovers the row — adapter `markOrderPaid` implementations are
 * idempotent on the POS side so a redundant retry is safe.
 */

import type { Database } from '@flowpay/db/types';
import {
  getPOSProvider,
  POSAdapterError,
  type POSMarkPaidInput,
  type POSProvider,
  type PosType,
} from '@flowpay/pos-adapters';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Backoff schedule (ms). Indexed by `attempts` BEFORE this failure.
 * `attempts` is incremented inside the SQL RPC, so we look up the next
 * delay using the pre-failure value (0 → 5 s, 1 → 30 s, …).
 *
 * Brief contract: "5 s, 30 s, 2 min, 10 min, 1 h".
 */
export const POS_UPDATE_BACKOFF_MS = [
  5_000,
  30_000,
  120_000,
  600_000,
  3_600_000,
] as const;

/** After this many failures the DB flips status='failed'. */
export const POS_UPDATE_MAX_ATTEMPTS = 5;

/** Default tick rate. */
export const DEFAULT_POLL_MS = 5_000;
/** Default per-row lease handed to the claim RPC. */
export const DEFAULT_LEASE_SECONDS = 60;
/** Default batch size pulled from the queue per tick. */
export const DEFAULT_BATCH_SIZE = 10;

/** What the claim RPC returns per row. Mirrors the SQL RETURNS TABLE. */
export interface ClaimedQueueRow {
  id: string;
  payment_id: string;
  restaurant_id: string;
  location_id: string;
  integration_id: string;
  external_location_id: string;
  external_order_id: string;
  action: 'mark_paid';
  payload: {
    method: 'swish' | 'card';
    amount: number;
    tipAmount?: number;
    reference: string;
  };
  attempts: number;
}

/**
 * Per-row outcome reported back. Useful for tests + future structured
 * metrics export. Not currently exposed via HTTP.
 */
export type ProcessResult =
  | { id: string; outcome: 'done' }
  | { id: string; outcome: 'retry'; attempts: number; nextAttemptAt: Date; error: string }
  | { id: string; outcome: 'failed'; attempts: number; error: string }
  | { id: string; outcome: 'skipped'; reason: string };

/**
 * Surface for fetching adapter credentials. Same shape as PosSyncService
 * uses — pulled out so the test suite can inject a stub without touching
 * Vault. In production this calls the `get_pos_credentials` RPC.
 */
export interface CredentialsLoader {
  load(integrationId: string): Promise<Record<string, string>>;
}

export interface PosUpdateQueueWorkerOptions {
  adminClient: SupabaseClient<Database>;
  logger: FastifyBaseLogger;
  /** Override for tests / mock mode. Defaults to the real registry. */
  providerFactory?: (type: PosType) => POSProvider;
  /** When true, every adapter is built in mock mode. */
  mock?: boolean;
  /** ms between ticks. Default 5_000 — see brief. */
  pollIntervalMs?: number;
  /** Per-row lease handed to the claim RPC (seconds). Default 60. */
  leaseSeconds?: number;
  /** Max rows to drain per tick. Default 10. */
  batchSize?: number;
  /** Override credentials lookup (tests). */
  credentialsLoader?: CredentialsLoader;
  /**
   * Notify-admin hook. Called when a row transitions to 'failed' so a
   * future Resend/email integration can wire in. Default: no-op log line.
   * The interface is deliberately fire-and-forget — admin notification
   * MUST NOT block or fail the worker tick.
   */
  notifyAdminOnFail?: (row: ClaimedQueueRow, error: string) => Promise<void> | void;
}

export class PosUpdateQueueWorker {
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private consecutiveFailures = 0;
  private readonly opts: Required<
    Omit<
      PosUpdateQueueWorkerOptions,
      'providerFactory' | 'credentialsLoader' | 'notifyAdminOnFail'
    >
  > &
    Pick<
      PosUpdateQueueWorkerOptions,
      'providerFactory' | 'credentialsLoader' | 'notifyAdminOnFail'
    >;

  constructor(options: PosUpdateQueueWorkerOptions) {
    this.opts = {
      adminClient: options.adminClient,
      logger: options.logger,
      mock: options.mock ?? false,
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_MS,
      leaseSeconds: options.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
      batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
      providerFactory: options.providerFactory,
      credentialsLoader: options.credentialsLoader,
      notifyAdminOnFail: options.notifyAdminOnFail,
    };
  }

  start(): void {
    if (this.timer) return;
    // Jitter the first tick by up to 1 s so multiple workers don't sync.
    const jitter = Math.floor(Math.random() * 1_000);
    this.opts.logger.info(
      { pollIntervalMs: this.opts.pollIntervalMs, jitterMs: jitter },
      'pos-update-queue worker starting',
    );
    this.timer = setTimeout(() => void this.tick(), jitter);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /**
   * One pass: claim → process → next attempt. Public so tests (and the
   * scheduler) can drive a single iteration without dealing with the
   * timer.
   */
  async processOnce(): Promise<ProcessResult[]> {
    const claimed = await this.claim();
    if (claimed.length === 0) return [];

    const results: ProcessResult[] = [];
    for (const row of claimed) {
      // Sequential per tick. The point of parallelism is between worker
      // *replicas*, not within a single tick — running adapters in
      // parallel would multiply the chance of a transient POS rate-limit.
      results.push(await this.processRow(row));
    }
    return results;
  }

  // ─── internals ────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    if (this.stopped) return;

    try {
      const results = await this.processOnce();
      this.consecutiveFailures = 0;

      // Cheap structured summary so log searches like `outcome=failed`
      // surface easily without parsing per-row lines.
      if (results.length > 0) {
        const summary = results.reduce<Record<string, number>>(
          (acc, r) => {
            acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
            return acc;
          },
          {},
        );
        this.opts.logger.info({ summary, processed: results.length }, 'pos-update-queue tick');
      }
    } catch (err) {
      this.consecutiveFailures += 1;
      this.opts.logger.error(
        { err, failures: this.consecutiveFailures },
        'pos-update-queue: tick failed',
      );
    }

    if (this.stopped) return;

    // Exponential back-off on consecutive uncaught errors. Capped at
    // 2 min — pos updates are user-visible (the staff terminal still
    // shows the bill open) so we want to recover quickly.
    const base = this.opts.pollIntervalMs;
    const multiplier = Math.min(2 ** Math.min(this.consecutiveFailures, 4), 16);
    const next = Math.min(base * multiplier, 2 * 60_000);
    if (next !== base) {
      this.opts.logger.warn(
        { nextMs: next, failures: this.consecutiveFailures },
        'pos-update-queue: backing off',
      );
    }
    this.timer = setTimeout(() => void this.tick(), next);
  }

  private async claim(): Promise<ClaimedQueueRow[]> {
    // The .rpc<…>() generic isn't tight enough for our hand-written
    // types, so we widen at the call site and validate the shape.
    const { data, error } = await this.opts.adminClient.rpc(
      'claim_pos_update_queue_items',
      {
        p_limit: this.opts.batchSize,
        p_lease_seconds: this.opts.leaseSeconds,
      } as never,
    );

    if (error) {
      throw new Error(`claim_pos_update_queue_items: ${error.message}`);
    }
    return (data ?? []) as unknown as ClaimedQueueRow[];
  }

  private async processRow(row: ClaimedQueueRow): Promise<ProcessResult> {
    const log = this.opts.logger.child({
      queueId: row.id,
      paymentId: row.payment_id,
      restaurantId: row.restaurant_id,
      attempt: row.attempts + 1,
    });

    // Defensive: trigger should never enqueue without an integration_id,
    // but if it does (admin-misconfig fast-fail path) we surface as
    // failed without trying to contact a non-existent POS.
    if (row.integration_id === '00000000-0000-0000-0000-000000000000') {
      const err = 'Queue row has no integration_id (likely missing pos_integrations row)';
      await this.reportFailure(row, err);
      log.warn({ err }, 'pos-update-queue: row missing integration');
      return {
        id: row.id,
        outcome: row.attempts + 1 >= POS_UPDATE_MAX_ATTEMPTS ? 'failed' : 'retry',
        attempts: row.attempts + 1,
        nextAttemptAt: this.computeNextAttemptAt(row.attempts),
        error: err,
      } as ProcessResult;
    }

    let provider: POSProvider;
    try {
      provider = await this.buildAuthenticatedProvider(row);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.reportFailure(row, `auth: ${reason}`);
      log.error({ err }, 'pos-update-queue: auth failed');
      return this.buildRetryResult(row, `auth: ${reason}`);
    }

    const payment: POSMarkPaidInput = {
      method: row.payload.method,
      amount: row.payload.amount,
      ...(typeof row.payload.tipAmount === 'number'
        ? { tipAmount: row.payload.tipAmount }
        : {}),
      reference: row.payload.reference,
    };

    try {
      await provider.markOrderPaid(
        row.external_location_id,
        row.external_order_id,
        payment,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const code = err instanceof POSAdapterError ? err.code : 'UNKNOWN';
      const errorLine = `${code}: ${reason}`;
      await this.reportFailure(row, errorLine);
      log.error(
        { err, code, retryable: err instanceof POSAdapterError ? err.retryable : undefined },
        'pos-update-queue: markOrderPaid failed',
      );
      return this.buildRetryResult(row, errorLine);
    }

    // Happy path.
    const { error: completeErr } = await this.opts.adminClient.rpc(
      'complete_pos_update_queue_item',
      { p_id: row.id } as never,
    );
    if (completeErr) {
      // The POS already accepted the call — we just couldn't ack the
      // queue row. Surface as failure so it gets retried; markOrderPaid
      // is idempotent on the POS side (Onslip /close returns 200 on a
      // closed bill) so the retry is safe.
      const errorLine = `complete-rpc: ${completeErr.message}`;
      await this.reportFailure(row, errorLine);
      log.warn({ err: completeErr }, 'pos-update-queue: complete RPC failed after success');
      return this.buildRetryResult(row, errorLine);
    }

    log.info('pos-update-queue: marked POS bill paid');
    return { id: row.id, outcome: 'done' };
  }

  private async buildAuthenticatedProvider(row: ClaimedQueueRow): Promise<POSProvider> {
    // We don't currently have row.pos_type — the POS type is implicit in
    // pos_integrations.type. Look it up. (Could be denormalised onto the
    // queue row in a future migration; not worth a column today.)
    const posType = await this.lookupPosType(row.integration_id);

    const provider = this.opts.providerFactory
      ? this.opts.providerFactory(posType)
      : getPOSProvider(posType, { mock: this.opts.mock });

    const creds = await this.loadCredentials(row.integration_id);
    await provider.authenticate(creds);
    return provider;
  }

  private async lookupPosType(integrationId: string): Promise<PosType> {
    const { data, error } = await this.opts.adminClient
      .from('pos_integrations')
      .select('type')
      .eq('id', integrationId)
      .maybeSingle();

    if (error) {
      throw new POSAdapterError('UPSTREAM_ERROR', `lookupPosType: ${error.message}`, {
        retryable: true,
      });
    }
    if (!data) {
      throw new POSAdapterError(
        'NOT_FOUND',
        `pos_integrations row ${integrationId} disappeared`,
        { retryable: false },
      );
    }
    return data.type;
  }

  private async loadCredentials(integrationId: string): Promise<Record<string, string>> {
    if (this.opts.credentialsLoader) {
      return this.opts.credentialsLoader.load(integrationId);
    }
    if (this.opts.mock) {
      return { apiKey: 'mock-apikey' };
    }
    // SECURITY DEFINER RPC; only callable by service-role.
    // @ts-expect-error — rpc signature is loose until we regenerate typed stubs
    const { data, error } = await this.opts.adminClient.rpc('get_pos_credentials', {
      p_integration_id: integrationId,
    });
    if (error) {
      throw new POSAdapterError('AUTH_FAILED', `Vault lookup failed: ${error.message}`, {
        retryable: false,
      });
    }
    if (typeof data !== 'string' || data.length === 0) {
      throw new POSAdapterError('AUTH_FAILED', `No credentials stored for integration ${integrationId}`, {
        retryable: false,
      });
    }
    try {
      return JSON.parse(data) as Record<string, string>;
    } catch (err) {
      throw new POSAdapterError('AUTH_FAILED', 'Credentials ciphertext is not JSON after decrypt', {
        retryable: false,
        cause: err,
      });
    }
  }

  /** Compute when the next retry should fire, using the brief's schedule. */
  private computeNextAttemptAt(currentAttempts: number): Date {
    const idx = Math.min(currentAttempts, POS_UPDATE_BACKOFF_MS.length - 1);
    return new Date(Date.now() + POS_UPDATE_BACKOFF_MS[idx]!);
  }

  private buildRetryResult(row: ClaimedQueueRow, error: string): ProcessResult {
    const nextAttemptAt = this.computeNextAttemptAt(row.attempts);
    const newAttempts = row.attempts + 1;
    if (newAttempts >= POS_UPDATE_MAX_ATTEMPTS) {
      return { id: row.id, outcome: 'failed', attempts: newAttempts, error };
    }
    return { id: row.id, outcome: 'retry', attempts: newAttempts, nextAttemptAt, error };
  }

  private async reportFailure(row: ClaimedQueueRow, error: string): Promise<void> {
    const nextAttemptAt = this.computeNextAttemptAt(row.attempts);

    const { data: status, error: rpcErr } = await this.opts.adminClient.rpc(
      'fail_pos_update_queue_item',
      {
        p_id: row.id,
        p_error: error,
        p_next_attempt_at: nextAttemptAt.toISOString(),
        p_max_attempts: POS_UPDATE_MAX_ATTEMPTS,
      } as never,
    );

    if (rpcErr) {
      // We can't even record the failure. Best-effort log and bail —
      // the row's lease will eventually expire and another worker will
      // re-claim it. Worst case it stays in 'processing' until cleanup.
      this.opts.logger.error(
        { err: rpcErr, queueId: row.id },
        'pos-update-queue: fail RPC errored — row may stay processing until lease expires',
      );
      return;
    }

    if (status === 'failed' && this.opts.notifyAdminOnFail) {
      try {
        await this.opts.notifyAdminOnFail(row, error);
      } catch (notifyErr) {
        this.opts.logger.error(
          { err: notifyErr, queueId: row.id },
          'pos-update-queue: notifyAdminOnFail threw — swallowing',
        );
      }
    }
  }
}
