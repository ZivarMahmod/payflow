/**
 * Caspeco OAuth2 helper — isolated from the HTTP client so both the
 * onboarding routes (`GET /integrations/caspeco/auth` +
 * `GET /integrations/caspeco/callback`) and the runtime client can
 * share one code path.
 *
 * Flow:
 *   1. Admin UI (TA-004) hits `GET /integrations/caspeco/auth` → we
 *      build an authorize URL using buildAuthorizeUrl() and redirect
 *      the manager's browser.
 *   2. Caspeco bounces back to our `redirect_uri` with `?code=…&state=…`.
 *      Route calls exchangeCodeForTokens() to swap the code for an
 *      access_token + refresh_token. Tokens are stored encrypted on
 *      `pos_integrations.credentials_encrypted` as JSON:
 *        { access_token, refresh_token, expires_at, token_type }
 *   3. At runtime the client uses the access_token. On 401 it calls
 *      refreshAccessToken() to get a fresh one. The new pair is
 *      returned so the caller can persist it (see note in
 *      client.ts on why that persistence is deferred to a follow-up).
 *
 * Everything here is pure + side-effect-free *apart from the network
 * call*. No DB access. That keeps the module easy to unit-test with a
 * stubbed `fetchImpl`.
 */

import { z } from 'zod';
import { POSAdapterError } from '../types.js';

/** Stored credential blob shape. Persisted in pos_integrations.credentials_encrypted after decrypt. */
export const CaspecoTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  /** Unix ms at which the access_token stops being valid. */
  expires_at: z.number().int().positive(),
  token_type: z.string().default('Bearer'),
  /** Caspeco sometimes scopes tokens to a specific merchant/location. Opaque to us. */
  scope: z.string().optional(),
});

export type CaspecoTokens = z.infer<typeof CaspecoTokensSchema>;

/** Caspeco's token-endpoint response. Validated at the boundary. */
const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  /** Seconds, per RFC 6749. */
  expires_in: z.number().int().positive(),
  token_type: z.string().default('Bearer'),
  scope: z.string().optional(),
});

export interface CaspecoOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Override for sandbox vs prod. */
  oauthBaseUrl: string;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout. Token calls should be fast (<2s). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Build the authorize URL the manager's browser is redirected to.
 * `state` is a CSRF-proof nonce the caller generates and verifies on
 * the callback leg. We URL-encode defensively.
 */
export function buildAuthorizeUrl(
  cfg: Pick<CaspecoOAuthConfig, 'clientId' | 'redirectUri' | 'oauthBaseUrl'>,
  opts: { state: string; scope?: string },
): string {
  const base = cfg.oauthBaseUrl.replace(/\/$/, '');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    state: opts.state,
  });
  if (opts.scope) {
    params.set('scope', opts.scope);
  }
  return `${base}/authorize?${params.toString()}`;
}

/**
 * Exchange an authorization_code for tokens. Called from the callback
 * route after the manager returns from Caspeco's consent screen.
 */
export async function exchangeCodeForTokens(
  cfg: CaspecoOAuthConfig,
  code: string,
): Promise<CaspecoTokens> {
  return requestTokens(cfg, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
}

/**
 * Swap a refresh_token for a new pair. Some IdPs rotate refresh tokens
 * on each call — we return whatever Caspeco sent back so the caller
 * always stores the latest values.
 */
export async function refreshAccessToken(
  cfg: CaspecoOAuthConfig,
  refreshToken: string,
): Promise<CaspecoTokens> {
  return requestTokens(cfg, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
}

// ── internals ────────────────────────────────────────────────────────

async function requestTokens(
  cfg: CaspecoOAuthConfig,
  form: Record<string, string>,
): Promise<CaspecoTokens> {
  const url = `${cfg.oauthBaseUrl.replace(/\/$/, '')}/token`;
  const fetchImpl = cfg.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': 'FlowPay/0.1 (+https://flowpay.se)',
      },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new POSAdapterError('NETWORK_ERROR', 'Caspeco token request timed out', {
        retryable: true,
        cause: err,
      });
    }
    throw new POSAdapterError('NETWORK_ERROR', 'Caspeco token request failed', {
      retryable: true,
      cause: err,
    });
  }
  clearTimeout(timer);

  // 400 from the token endpoint usually means "bad code" or "bad
  // refresh_token" — a credential problem, not retryable.
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    const body = await safeText(response);
    throw new POSAdapterError(
      'AUTH_FAILED',
      `Caspeco token endpoint ${response.status}: ${body.slice(0, 200)}`,
      { retryable: false, status: response.status },
    );
  }
  if (response.status === 429) {
    throw new POSAdapterError('RATE_LIMITED', 'Caspeco token endpoint rate-limited', {
      retryable: true,
      status: 429,
    });
  }
  if (response.status >= 500) {
    throw new POSAdapterError('UPSTREAM_ERROR', `Caspeco token endpoint ${response.status}`, {
      retryable: true,
      status: response.status,
    });
  }
  if (!response.ok) {
    const body = await safeText(response);
    throw new POSAdapterError(
      'BAD_RESPONSE',
      `Caspeco token endpoint unexpected ${response.status}: ${body.slice(0, 200)}`,
      { retryable: false, status: response.status },
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    throw new POSAdapterError('BAD_RESPONSE', 'Caspeco token endpoint returned non-JSON', {
      retryable: false,
      cause: err,
    });
  }

  const parsed = TokenResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new POSAdapterError(
      'BAD_RESPONSE',
      `Caspeco token payload failed validation: ${parsed.error.message.slice(0, 200)}`,
      { retryable: false, cause: parsed.error },
    );
  }

  const now = Date.now();
  // Bake a 30-second safety margin into expires_at so near-expiry tokens
  // are refreshed a beat early (avoids races where the client sends a
  // request that Caspeco receives after the token expired).
  const expires_at = now + Math.max(parsed.data.expires_in - 30, 0) * 1000;

  const tokens: CaspecoTokens = {
    access_token: parsed.data.access_token,
    refresh_token: parsed.data.refresh_token,
    expires_at,
    token_type: parsed.data.token_type,
    ...(parsed.data.scope !== undefined ? { scope: parsed.data.scope } : {}),
  };
  return CaspecoTokensSchema.parse(tokens);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
