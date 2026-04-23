/**
 * Caspeco REST client with automatic OAuth2 refresh on 401.
 *
 * Design constraints:
 *   - No dependency on the DB. The adapter cannot reach Vault. Tokens
 *     live in memory for the lifetime of this client instance.
 *   - On 401, we refresh the access_token once, retry once, and if
 *     that also fails we raise AUTH_FAILED (the scheduler will flip
 *     the integration to status='error').
 *   - The rotated refresh_token (some IdPs re-issue it on refresh) is
 *     exposed via `onTokensRotated` so the adapter layer can forward
 *     it upstream. For PREPARED MVP the forward hook is wired to a
 *     logger only — persistence back into `pos_integrations.credentials`
 *     happens in a follow-up (TA-004 config UI). See caspeco/index.ts.
 */

import { POSAdapterError } from '../types.js';
import {
  type CaspecoOAuthConfig,
  type CaspecoTokens,
  refreshAccessToken,
} from './oauth.js';

export interface CaspecoClientConfig {
  /** REST base URL, e.g. https://api.caspeco.net/v1 — sandbox differs from prod. */
  baseUrl: string;
  /** OAuth config used for refresh on 401. */
  oauth: CaspecoOAuthConfig;
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Fires whenever access/refresh tokens change so the adapter can forward. */
  onTokensRotated?: (tokens: CaspecoTokens) => void;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class CaspecoClient {
  private readonly baseUrl: string;
  private readonly oauth: CaspecoOAuthConfig;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onTokensRotated?: (tokens: CaspecoTokens) => void;

  private tokens: CaspecoTokens;

  constructor(cfg: CaspecoClientConfig & { initialTokens: CaspecoTokens }) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.oauth = cfg.oauth;
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = cfg.fetchImpl ?? globalThis.fetch;
    this.tokens = cfg.initialTokens;
    if (cfg.onTokensRotated !== undefined) {
      this.onTokensRotated = cfg.onTokensRotated;
    }
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /**
   * Currently active tokens. Exposed so the adapter can snapshot them
   * for the logger / follow-up persistence hook.
   */
  getTokens(): CaspecoTokens {
    return this.tokens;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    hasRefreshed = false,
  ): Promise<T> {
    // Pre-emptive refresh if the access token has already expired (or
    // is within the 30-s safety margin baked in by oauth.ts). Saves a
    // wasted 401 round-trip.
    if (!hasRefreshed && Date.now() >= this.tokens.expires_at) {
      await this.rotate();
      // Fall through — we'll use the freshly-rotated access_token.
    }

    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `${this.tokens.token_type} ${this.tokens.access_token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'FlowPay/0.1 (+https://flowpay.se)',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new POSAdapterError('NETWORK_ERROR', `Caspeco ${method} ${path} timed out`, {
          retryable: true,
          cause: err,
        });
      }
      throw new POSAdapterError('NETWORK_ERROR', `Caspeco ${method} ${path} failed`, {
        retryable: true,
        cause: err,
      });
    }
    clearTimeout(timer);

    // 401 once → refresh + retry. 401 again → AUTH_FAILED.
    if (response.status === 401 && !hasRefreshed) {
      await this.rotate();
      return this.request<T>(method, path, body, true);
    }

    if (response.status === 401 || response.status === 403) {
      throw new POSAdapterError('AUTH_FAILED', `Caspeco ${response.status} after refresh`, {
        retryable: false,
        status: response.status,
      });
    }
    if (response.status === 404) {
      throw new POSAdapterError('NOT_FOUND', `Caspeco ${path} not found`, {
        retryable: false,
        status: 404,
      });
    }
    if (response.status === 429) {
      throw new POSAdapterError('RATE_LIMITED', 'Caspeco rate limit', {
        retryable: true,
        status: 429,
      });
    }
    if (response.status >= 500) {
      throw new POSAdapterError('UPSTREAM_ERROR', `Caspeco ${response.status}`, {
        retryable: true,
        status: response.status,
      });
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new POSAdapterError(
        'BAD_RESPONSE',
        `Caspeco ${response.status}: ${text.slice(0, 200)}`,
        { retryable: false, status: response.status },
      );
    }

    // 204 No Content is legitimate for markOrderPaid.
    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new POSAdapterError('BAD_RESPONSE', 'Caspeco returned non-JSON', {
        retryable: false,
        cause: err,
      });
    }
  }

  private async rotate(): Promise<void> {
    const next = await refreshAccessToken(this.oauth, this.tokens.refresh_token);
    this.tokens = next;
    this.onTokensRotated?.(next);
  }
}
