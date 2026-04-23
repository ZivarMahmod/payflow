/**
 * Caspeco adapter — implements POSProvider.
 *
 * Shape of `credentials` (after decrypt, from `pos_integrations.credentials_encrypted`):
 *   {
 *     access_token: string,
 *     refresh_token: string,
 *     expires_at: number,      // ms epoch
 *     token_type?: 'Bearer',
 *     // OAuth app config below — these are FlowPay-global but stored
 *     // on the integration so we can support multi-tenant dev/prod
 *     // environments without bleeding env vars into the adapter layer.
 *     // Falls back to env via the wrapping factory when missing.
 *     oauth_base_url?: string,
 *     api_base_url?: string,
 *     client_id?: string,
 *     client_secret?: string,
 *     redirect_uri?: string,
 *   }
 *
 * The factory accepts a `mock` flag from USE_MOCK_CASPECO. In mock mode
 * we never read tokens, never hit the network, and succeed on any blob
 * with a `mock` key (or `access_token`, to keep the shape symmetric
 * with real mode for onboarding-smoke-tests).
 */

import {
  POSAdapterError,
  type POSCredentials,
  type POSMarkPaidInput,
  type POSOrder,
  type POSProvider,
  type POSProviderFactory,
  type PosType,
} from '../types.js';
import { CaspecoClient } from './client.js';
import { mapCaspecoOrder } from './mapper.js';
import { type CaspecoMockState, mockCaspecoOrderById, mockCaspecoOrders } from './mock.js';
import { CaspecoTokensSchema, type CaspecoOAuthConfig, type CaspecoTokens } from './oauth.js';

const DEFAULT_API_BASE_URL = 'https://api.caspeco.net/v1';
const DEFAULT_OAUTH_BASE_URL = 'https://oauth.caspeco.net';

/**
 * Extract + validate Caspeco credentials. Throws AUTH_FAILED on any
 * missing field — we'd rather surface a clear error than try to
 * round-trip a half-formed token pair through the client.
 */
function parseCredentials(creds: POSCredentials): {
  tokens: CaspecoTokens;
  oauth: CaspecoOAuthConfig;
  apiBaseUrl: string;
} {
  const clientId = creds['client_id'];
  const clientSecret = creds['client_secret'];
  const redirectUri = creds['redirect_uri'];
  if (!clientId || !clientSecret || !redirectUri) {
    throw new POSAdapterError(
      'AUTH_FAILED',
      'Caspeco credentials missing client_id / client_secret / redirect_uri',
      { retryable: false },
    );
  }

  // Tokens MUST be valid shape — we reject silently-expired pairs
  // (expires_at in the past). The client will try to refresh, but the
  // caller gets a crisp error if tokens were never populated.
  const expiresAtRaw = creds['expires_at'];
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : undefined;

  const tokensParse = CaspecoTokensSchema.safeParse({
    access_token: creds['access_token'],
    refresh_token: creds['refresh_token'],
    expires_at: expiresAt,
    token_type: creds['token_type'] ?? 'Bearer',
    ...(creds['scope'] !== undefined ? { scope: creds['scope'] } : {}),
  });
  if (!tokensParse.success) {
    throw new POSAdapterError(
      'AUTH_FAILED',
      `Caspeco credential blob invalid: ${tokensParse.error.message.slice(0, 200)}`,
      { retryable: false, cause: tokensParse.error },
    );
  }

  const oauthBaseUrl = creds['oauth_base_url'] ?? DEFAULT_OAUTH_BASE_URL;
  const apiBaseUrl = creds['api_base_url'] ?? DEFAULT_API_BASE_URL;

  return {
    tokens: tokensParse.data,
    oauth: {
      clientId,
      clientSecret,
      redirectUri,
      oauthBaseUrl,
    },
    apiBaseUrl,
  };
}

class CaspecoAdapter implements POSProvider {
  public readonly type: PosType = 'caspeco';

  private client?: CaspecoClient;
  private readonly mock: boolean;
  private readonly mockState: CaspecoMockState = { cycle: 0 };

  constructor(opts: { mock: boolean }) {
    this.mock = opts.mock;
  }

  async authenticate(creds: POSCredentials): Promise<void> {
    if (this.mock) {
      // Mock mode still requires *something* to avoid accidentally
      // authenticating with an empty blob during onboarding tests.
      if (!creds['access_token'] && !creds['mock']) {
        throw new POSAdapterError(
          'AUTH_FAILED',
          'Mock Caspeco requires a non-empty access_token or mock=true',
          { retryable: false },
        );
      }
      return;
    }

    const parsed = parseCredentials(creds);
    this.client = new CaspecoClient({
      baseUrl: parsed.apiBaseUrl,
      oauth: parsed.oauth,
      initialTokens: parsed.tokens,
      onTokensRotated: (_next) => {
        // Placeholder hook. In production the sync service will want
        // to persist the rotated pair back into Vault. For PREPARED
        // MVP the caller rebuilds the adapter on each cycle, so
        // next-cycle behavior depends on the previous token still
        // being valid OR the DB having the rotated pair. Since most
        // IdPs keep refresh_token stable across calls, this works for
        // the common case. Tracked as a follow-up.
      },
    });

    // Light ping — Caspeco's /me or /merchant endpoint echoes the
    // authenticated partner. We GET whichever is cheapest; on 404 we
    // fall back to the endpoint every partner account has, /receipts
    // (with a tiny limit) just to exercise auth.
    try {
      await this.client.get('/me');
    } catch (err) {
      if (err instanceof POSAdapterError && err.code === 'NOT_FOUND') {
        // /me is optional per partner tier — exercise a known-safe
        // endpoint instead.
        await this.client.get('/merchants');
        return;
      }
      throw err;
    }
  }

  async fetchOpenOrders(externalLocationId: string): Promise<POSOrder[]> {
    if (this.mock) {
      this.mockState.cycle += 1;
      return mockCaspecoOrders(externalLocationId, this.mockState);
    }
    const client = this.requireClient();
    const raw = await client.get<{ receipts: unknown[] }>(
      `/merchants/${encodeURIComponent(externalLocationId)}/receipts?state=OPEN`,
    );
    if (!Array.isArray(raw.receipts)) {
      throw new POSAdapterError('BAD_RESPONSE', 'Caspeco /receipts missing `receipts[]`', {
        retryable: false,
      });
    }
    return raw.receipts.map(mapCaspecoOrder);
  }

  async fetchOrder(externalLocationId: string, externalOrderId: string): Promise<POSOrder> {
    if (this.mock) {
      const found = mockCaspecoOrderById(externalLocationId, externalOrderId, this.mockState);
      if (!found) {
        throw new POSAdapterError('NOT_FOUND', `Mock Caspeco: ${externalOrderId}`, {
          retryable: false,
          status: 404,
        });
      }
      return found;
    }
    const client = this.requireClient();
    const raw = await client.get<unknown>(
      `/merchants/${encodeURIComponent(externalLocationId)}/receipts/${encodeURIComponent(externalOrderId)}`,
    );
    return mapCaspecoOrder(raw);
  }

  async markOrderPaid(
    externalLocationId: string,
    externalOrderId: string,
    payment: POSMarkPaidInput,
  ): Promise<void> {
    if (this.mock) {
      // No-op. Next fetchOpenOrders cycle drops the bill if state
      // conditions are met (cycle >= 4 closes order 77003, etc.).
      return;
    }
    const client = this.requireClient();
    await client.post<unknown>(
      `/merchants/${encodeURIComponent(externalLocationId)}/receipts/${encodeURIComponent(externalOrderId)}/settle`,
      {
        payment: {
          method: payment.method === 'swish' ? 'EXTERNAL_SWISH' : 'EXTERNAL_CARD',
          amount: payment.amount,
          tipAmount: payment.tipAmount ?? 0,
          reference: payment.reference,
        },
      },
    );
  }

  async fetchTables(externalLocationId: string): Promise<Array<{ number: string }>> {
    if (this.mock) {
      return [
        { number: '1' },
        { number: '4' },
        { number: '5' },
        { number: '9' },
        { number: '15' },
      ];
    }
    const client = this.requireClient();
    const raw = await client.get<{ tables: Array<{ label?: string; name?: string }> }>(
      `/merchants/${encodeURIComponent(externalLocationId)}/tables`,
    );
    return raw.tables
      .map((t) => ({ number: t.label ?? t.name ?? '' }))
      .filter((t) => t.number.length > 0);
  }

  private requireClient(): CaspecoClient {
    if (!this.client) {
      throw new POSAdapterError(
        'AUTH_FAILED',
        'Caspeco adapter used before authenticate()',
        { retryable: false },
      );
    }
    return this.client;
  }
}

export const caspecoFactory: POSProviderFactory = {
  type: 'caspeco',
  create: (opts) => new CaspecoAdapter({ mock: opts.mock ?? false }),
};

export { CaspecoAdapter };

// Re-export OAuth helpers so the onboarding route can import from the
// package's ./caspeco subpath without pulling on pos-adapter internals.
export {
  buildAuthorizeUrl,
  CaspecoTokensSchema,
  exchangeCodeForTokens,
  refreshAccessToken,
} from './oauth.js';
export type { CaspecoOAuthConfig, CaspecoTokens } from './oauth.js';
