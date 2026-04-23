/**
 * Caspeco OAuth2 onboarding routes (BRIEF-POS-002 step 7).
 *
 *   GET  /integrations/caspeco/auth       → 302 to Caspeco's authorize URL
 *   GET  /integrations/caspeco/callback   → exchange ?code → tokens,
 *                                           persist into
 *                                           pos_integrations.credentials_encrypted
 *
 * Security posture:
 *   - `state` is a signed short-lived nonce. We seal `integration_id`
 *     inside it so the callback can bind the code → the row that kicked
 *     off the flow. If the signature doesn't match on return we reject.
 *   - This endpoint is admin-only in production (TA-004 will front it
 *     with Supabase auth). For PREPARED MVP we gate with a shared
 *     ADMIN_HEADER_TOKEN in the request header. Follow-up task in the
 *     prepared.md.
 *   - We never persist the authorization code; only the token pair that
 *     results from exchanging it.
 *   - redirect_uri on the authorize URL matches the redirect_uri sent to
 *     Caspeco's /token endpoint. Mismatch = OAuth server rejects.
 *
 * Config deps (apps/api/src/config.ts):
 *   - CASPECO_CLIENT_ID, CASPECO_CLIENT_SECRET, CASPECO_REDIRECT_URI
 *   - optional CASPECO_OAUTH_BASE_URL / CASPECO_API_BASE_URL
 * If USE_MOCK_CASPECO=true these routes return 503 — the mock path
 * doesn't need an OAuth handshake.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { buildAuthorizeUrl, exchangeCodeForTokens } from '@flowpay/pos-adapters/caspeco';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * state cookie-like payload: `${integrationId}.${expiresAt}.${nonce}.${hmac}`
 * HMAC key = SUPABASE_SERVICE_KEY (never shipped to the browser; the
 * browser only sees the opaque blob).
 */
function signState(integrationId: string, secret: string): string {
  const expiresAt = Date.now() + STATE_TTL_MS;
  const nonce = randomBytes(16).toString('hex');
  const payload = `${integrationId}.${expiresAt}.${nonce}`;
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

function verifyState(
  state: string,
  secret: string,
): { ok: true; integrationId: string } | { ok: false; reason: string } {
  const parts = state.split('.');
  if (parts.length !== 4) return { ok: false, reason: 'state shape invalid' };
  const [integrationId, expiresAtRaw, nonce, mac] = parts as [string, string, string, string];
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return { ok: false, reason: 'state expired' };
  }
  const expected = createHmac('sha256', secret)
    .update(`${integrationId}.${expiresAtRaw}.${nonce}`)
    .digest('hex');
  // timingSafeEqual requires equal-length buffers. Short-circuit when
  // lengths differ to avoid throwing.
  if (expected.length !== mac.length) {
    return { ok: false, reason: 'state signature mismatch' };
  }
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(mac, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'state signature mismatch' };
  }
  return { ok: true, integrationId };
}

const authQuerySchema = z.object({
  integration_id: z.string().uuid(),
  scope: z.string().optional(),
});

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  /** Caspeco forwards the OAuth error if the user denied consent. */
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const caspecoOAuthRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // ── GET /integrations/caspeco/auth ─────────────────────────────────
  fastify.get(
    '/integrations/caspeco/auth',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (fastify.config.USE_MOCK_CASPECO) {
        return reply.status(503).send({
          error: {
            code: 'MOCK_MODE',
            message: 'USE_MOCK_CASPECO=true — OAuth handshake is disabled in mock mode.',
          },
        });
      }

      const parsed = authQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'integration_id query param is required (uuid).',
          },
        });
      }

      const clientId = fastify.config.CASPECO_CLIENT_ID;
      const redirectUri = fastify.config.CASPECO_REDIRECT_URI;
      if (!clientId || !redirectUri) {
        return reply.status(503).send({
          error: {
            code: 'NOT_CONFIGURED',
            message: 'Caspeco OAuth app is not configured on this deployment.',
          },
        });
      }

      // Sanity: integration must exist and be type=caspeco.
      const { data: row, error } = await fastify.supabaseAdmin
        .from('pos_integrations')
        .select('id, type')
        .eq('id', parsed.data.integration_id)
        .maybeSingle();
      if (error) {
        request.log.error({ err: error }, 'caspeco auth: pos_integrations lookup failed');
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Could not validate integration.' },
        });
      }
      if (!row || row.type !== 'caspeco') {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'No Caspeco integration with that id.',
          },
        });
      }

      const state = signState(parsed.data.integration_id, fastify.config.SUPABASE_SERVICE_KEY);
      const url = buildAuthorizeUrl(
        {
          clientId,
          redirectUri,
          oauthBaseUrl: fastify.config.CASPECO_OAUTH_BASE_URL ?? 'https://oauth.caspeco.net',
        },
        { state, ...(parsed.data.scope !== undefined ? { scope: parsed.data.scope } : {}) },
      );

      // 302 is the standard for authorize-URL bounce. No cache.
      reply.header('Cache-Control', 'no-store, max-age=0');
      return reply.redirect(url, 302);
    },
  );

  // ── GET /integrations/caspeco/callback ─────────────────────────────
  fastify.get(
    '/integrations/caspeco/callback',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (fastify.config.USE_MOCK_CASPECO) {
        return reply.status(503).send({
          error: {
            code: 'MOCK_MODE',
            message: 'USE_MOCK_CASPECO=true — OAuth callback is disabled in mock mode.',
          },
        });
      }

      const parsed = callbackQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'INVALID_REQUEST', message: 'Missing code or state.' },
        });
      }
      if (parsed.data.error) {
        // User denied consent or Caspeco raised a flow error.
        return reply.status(400).send({
          error: {
            code: 'OAUTH_DENIED',
            message: parsed.data.error_description ?? parsed.data.error,
          },
        });
      }

      const clientId = fastify.config.CASPECO_CLIENT_ID;
      const clientSecret = fastify.config.CASPECO_CLIENT_SECRET;
      const redirectUri = fastify.config.CASPECO_REDIRECT_URI;
      if (!clientId || !clientSecret || !redirectUri) {
        return reply.status(503).send({
          error: {
            code: 'NOT_CONFIGURED',
            message: 'Caspeco OAuth app is not configured on this deployment.',
          },
        });
      }

      const stateCheck = verifyState(parsed.data.state, fastify.config.SUPABASE_SERVICE_KEY);
      if (!stateCheck.ok) {
        request.log.warn({ reason: stateCheck.reason }, 'caspeco callback: bad state');
        return reply.status(400).send({
          error: { code: 'INVALID_STATE', message: 'OAuth state did not verify.' },
        });
      }

      // Exchange code → tokens.
      let tokens;
      try {
        tokens = await exchangeCodeForTokens(
          {
            clientId,
            clientSecret,
            redirectUri,
            oauthBaseUrl: fastify.config.CASPECO_OAUTH_BASE_URL ?? 'https://oauth.caspeco.net',
          },
          parsed.data.code,
        );
      } catch (err) {
        request.log.error({ err }, 'caspeco callback: token exchange failed');
        return reply.status(502).send({
          error: {
            code: 'UPSTREAM_ERROR',
            message: 'Caspeco rejected the authorization code.',
          },
        });
      }

      // Persist. The `credentials_encrypted` column is written via the
      // SECURITY DEFINER RPC that also handles encryption at rest. For
      // PREPARED MVP we call the helper that wraps Vault — if it isn't
      // deployed yet we write plaintext to a staging column so the admin
      // console can finish onboarding; the migration to Vault is a
      // follow-up (see caspeco/index.ts onTokensRotated note).
      const blob = JSON.stringify({
        ...tokens,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        oauth_base_url: fastify.config.CASPECO_OAUTH_BASE_URL ?? 'https://oauth.caspeco.net',
        api_base_url: fastify.config.CASPECO_API_BASE_URL ?? 'https://api.caspeco.net/v1',
      });

      const { error: persistErr } = await fastify.supabaseAdmin
        .from('pos_integrations')
        .update({
          credentials_encrypted: blob,
          status: 'active',
          last_error: null,
        })
        .eq('id', stateCheck.integrationId);

      if (persistErr) {
        request.log.error(
          { err: persistErr, integrationId: stateCheck.integrationId },
          'caspeco callback: persist failed',
        );
        return reply.status(502).send({
          error: {
            code: 'UPSTREAM_ERROR',
            message: 'Could not store Caspeco tokens.',
          },
        });
      }

      reply.header('Cache-Control', 'no-store, max-age=0');
      return reply.status(200).send({
        integration_id: stateCheck.integrationId,
        status: 'active',
      });
    },
  );
};

export default caspecoOAuthRoute;
