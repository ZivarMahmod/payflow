# BRIEF-POS-002 — Caspeco adapter — PREPARED

- **Date:** 2026-04-23T08:10+02:00
- **Commit:** pending-zivar-commit
- **Status:** Files complete. Awaiting manual verification by Zivar.

## Summary

Adds the Caspeco POS adapter alongside the Onslip adapter from
BRIEF-POS-001. Caspeco's defining difference is **OAuth2 with refresh
tokens**, so this brief lands both the adapter and the admin-side
onboarding routes.

Flow (real mode):

1. Restaurant creates a `pos_integrations` row with
   `type='caspeco'`, `status='paused'`, `credentials_encrypted=null`.
2. Admin UI (TA-004 when it lands) hits
   `GET /integrations/caspeco/auth?integration_id=…` → we build a
   signed authorize URL and 302 to Caspeco.
3. Manager approves → Caspeco bounces to
   `GET /integrations/caspeco/callback?code=…&state=…`.
4. Callback verifies the signed `state`, exchanges `code` for
   `{ access_token, refresh_token, expires_at }`, stores a JSON blob
   in `pos_integrations.credentials_encrypted`, flips `status` to
   `active`.
5. The existing POS sync scheduler (POS-001) picks the row up on its
   next tick, `getPOSProvider('caspeco')` returns a `CaspecoAdapter`,
   `authenticate()` parses the blob, and fetches open receipts.
6. On any `401` from the REST API the `CaspecoClient` refreshes the
   access token once and retries — see the client for retry rules.

Mock mode (`USE_MOCK_CASPECO=true`, the default) bypasses all network
traffic and returns a deterministic rotating fixture that differs from
Onslip's so a dev DB can tell them apart.

## Files changed

- **Added:**
  - `packages/pos-adapters/src/caspeco/oauth.ts` — authorize-URL
    builder + `exchangeCodeForTokens` + `refreshAccessToken`. Pure
    functions behind an injected `fetchImpl` for unit tests.
  - `packages/pos-adapters/src/caspeco/client.ts` — REST client with
    automatic 401 → refresh → retry. Pre-emptively refreshes when
    `expires_at` has already passed (saves one 401 round-trip).
  - `packages/pos-adapters/src/caspeco/mapper.ts` — Zod schema +
    `mapCaspecoOrder(raw)`. Caspeco uses `receiptId`, `grandTotal`,
    `rows[].unitPriceIncVat`, `state='OPEN'|'CLOSED'|'PAID'|'VOIDED'`.
  - `packages/pos-adapters/src/caspeco/mock.ts` — deterministic
    rotating fixture (cycle-based, no Date.now()).
  - `packages/pos-adapters/src/caspeco/index.ts` — `CaspecoAdapter`
    class + `caspecoFactory`. Re-exports the OAuth helpers so the
    onboarding route can consume them via the `./caspeco` subpath.
  - `apps/api/src/routes/integrations/caspeco-oauth.ts` — the two
    onboarding endpoints (`/auth` + `/callback`), with an HMAC-signed
    `state` parameter to bind code ↔ integration.
- **Modified:**
  - `packages/pos-adapters/src/index.ts` — registers
    `caspecoFactory` alongside `onslipFactory`.
  - `apps/api/src/config.ts` — adds optional
    `CASPECO_CLIENT_ID`/`CASPECO_CLIENT_SECRET`/`CASPECO_REDIRECT_URI`
    + OAuth/API base URLs. Optional so mock mode never trips
    validation.
  - `apps/api/src/server.ts` — registers `caspecoOAuthRoute`.
  - `NIGHT-RUN.md` — added Prepared entry, bumped total to 22/28.

## Local verifications

Could not run `pnpm typecheck` / `pnpm lint` — `registry.npmjs.org` is
blocked from the sandbox (same constraint as every prior brief this
run). Following the DB-003/KI-007/API-006 precedent, hand-review in
lieu of tool verifs:

- **Factory registry sanity.**
  - `packages/pos-adapters/src/index.ts`: `caspeco: caspecoFactory`.
    The `lightspeed` slot remains `undefined` — unchanged.
  - `getPOSProvider('caspeco', { mock: true })` now resolves. Prior
    behavior threw `"POS provider "caspeco" is not registered"`.
- **POSProvider contract.**
  - `CaspecoAdapter` implements every required method from
    `packages/pos-adapters/src/types.ts` (`authenticate`,
    `fetchOpenOrders`, `fetchOrder`, `markOrderPaid`, optional
    `fetchTables`).
  - `type: 'caspeco'` narrows correctly against the `PosType` union.
- **OAuth module correctness.**
  - `buildAuthorizeUrl` uses `URLSearchParams`, so `client_id` with
    unusual characters is properly escaped.
  - `exchangeCodeForTokens` and `refreshAccessToken` both route
    through `requestTokens`, which POSTs
    `application/x-www-form-urlencoded` per RFC 6749 §4.1.3 / §6.
  - `expires_at` is computed as `Date.now() + (expires_in - 30)*1000`
    — the 30-second safety margin is documented and matches what the
    client's pre-emptive refresh relies on.
  - 400/401/403 from the token endpoint → `AUTH_FAILED` (not
    retryable); 5xx → `UPSTREAM_ERROR` (retryable); 429 →
    `RATE_LIMITED` (retryable). Matches the Onslip client's taxonomy.
- **Client refresh behavior.**
  - `request()` passes `hasRefreshed=false` on the first call; the
    401 handler calls `rotate()` and retries with `hasRefreshed=true`.
    A second 401 becomes `AUTH_FAILED` (scheduler flips
    `pos_integrations.status='error'`).
  - `rotate()` replaces `this.tokens` atomically and fires
    `onTokensRotated(next)` — currently a no-op but the hook is
    wired.
  - 204 from `markOrderPaid`'s `/settle` endpoint is accepted
    (returns `undefined as T`).
- **Mapper shape.**
  - Caspeco `VOIDED` + `PAID` + `CLOSED` all collapse to
    `closed: true` — consistent with how Onslip `paid` is treated.
  - `grandTotal` / `unitPriceIncVat` are VAT-inclusive, matching the
    FlowPay convention end-to-end.
- **Onboarding route security.**
  - `state` is HMAC-SHA256 signed with `SUPABASE_SERVICE_KEY` (server
    secret; never ships to browser). 10-minute TTL baked in.
  - `verifyState` uses `timingSafeEqual` on equal-length buffers and
    short-circuits on length mismatch.
  - Rejects with 400 on signature mismatch or expiry.
  - `integration_id` is re-checked against `pos_integrations` before
    building the authorize URL — no open-redirect-for-anyone.
  - `USE_MOCK_CASPECO=true` → both routes respond 503 `MOCK_MODE`.
    Real-mode 503 `NOT_CONFIGURED` when env vars are absent.
  - `redirect_uri` is **identical** at authorize-time and
    exchange-time (both read from `fastify.config.CASPECO_REDIRECT_URI`),
    which is required by Caspeco's OAuth server.
- **Credential blob round-trip.**
  - Callback writes JSON:
    ```
    { access_token, refresh_token, expires_at, token_type, scope?,
      client_id, client_secret, redirect_uri,
      oauth_base_url, api_base_url }
    ```
  - Adapter's `parseCredentials` reads the same keys. Only the
    token trio is validated with Zod; OAuth app config is treated as
    strings.
- **Anti-patterns (BRIEF-POS-002).**
  - No Caspeco-specific logic leaks outside `caspeco/` or the
    onboarding route. The sync service and payment completion flow
    speak only `POSProvider` / `POSOrder`.
  - `refresh_token` logic is present in `oauth.ts` AND exercised on
    401 in `client.ts` (both required by the brief's anti-pattern
    list).

## Known gaps / open-for-next-brief

1. **Rotated refresh_token not persisted back to Vault.**
   `onTokensRotated` is called on every refresh but the stored blob
   isn't updated. Works for IdPs that keep `refresh_token` stable
   across calls (the common case); breaks on IdPs that force rotation.
   Follow-up is to wire `onTokensRotated` through to a
   service-role RPC (`update_pos_credentials`) that the adapter can
   invoke — but the adapter currently has no DB handle. Options:
   a) Pass a persist callback from `pos-sync.ts` down into
   `getPOSProvider(…)`, or b) make `CaspecoAdapter` accept an
   adminClient. Leaning toward (a) for layering cleanliness. Tracked
   on my audit list.
2. **No credential encryption at rest yet.** Migration 005 creates
   `credentials_encrypted text`, but we write plaintext JSON today.
   SC-001-ish follow-up: introduce a `pgsodium.crypto_secretbox_seal`
   wrapper + `get_pos_credentials` RPC that decrypts at read time.
3. **Admin auth on `/integrations/caspeco/*` is missing.** The route
   is reachable by anyone who can hit the API. Gated behind TA-004's
   auth when it lands. For PREPARED MVP, the rate limit + signed
   state is the only barrier — acceptable while USE_MOCK_CASPECO is
   the default and no real tokens are flowing yet.

## Manual steps for Zivar (run locally with network access)

```bash
# 1. Install + local verifs the sandbox couldn't run.
pnpm install
pnpm --filter @flowpay/pos-adapters typecheck
pnpm --filter @flowpay/pos-adapters lint
pnpm --filter @flowpay/api typecheck
pnpm --filter @flowpay/api lint

# 2. Smoke-test mock mode (default).
#    With USE_MOCK_CASPECO=true:
#    - Create a pos_integrations row with type='caspeco',
#      credentials_encrypted='{"mock":"true"}', status='active'.
#    - ENABLE_POS_SYNC=true pnpm --filter @flowpay/api dev
#    - Watch logs: 3 receipts (77001-77003) should upsert into
#      orders_cache. On the 4th cycle 77003 flips to closed.
#    - hitting `/integrations/caspeco/auth` should 503 MOCK_MODE.

# 3. Real mode (only when you have partner creds).
#    Set env:
#      USE_MOCK_CASPECO=false
#      CASPECO_CLIENT_ID=<from Caspeco partner portal>
#      CASPECO_CLIENT_SECRET=<from Caspeco partner portal>
#      CASPECO_REDIRECT_URI=https://<host>/integrations/caspeco/callback
#      CASPECO_OAUTH_BASE_URL=https://oauth.caspeco.net   # or sandbox host
#      CASPECO_API_BASE_URL=https://api.caspeco.net/v1    # or sandbox
#    Then:
#    - Create pos_integrations row (paused) for your restaurant.
#    - GET /integrations/caspeco/auth?integration_id=<uuid>
#      Expect: 302 to oauth.caspeco.net/authorize?... with a long
#      opaque `state`.
#    - Approve on Caspeco → bounce to /callback → 200
#      `{ integration_id, status: "active" }`. Row's
#      credentials_encrypted is populated.
#    - ENABLE_POS_SYNC=true → real receipts start syncing.

# 4. Token refresh smoke-test.
#    Manually expire the access_token in credentials_encrypted (set
#    expires_at=1). Next sync cycle: client hits 401, refreshes,
#    request succeeds. Confirm `published_to_google_at`-style
#    audit behavior is NOT triggered (wrong brief — this is just
#    checking the 401 path doesn't flip status='error').

# 5. markOrderPaid end-to-end.
#    Trigger a payments flow (API-003/004) that completes a payment
#    on a Caspeco-backed restaurant. Expect POST to
#    /merchants/:id/receipts/:rid/settle with
#    `{ method, amount, tipAmount, reference }`.
```

## Dependencies confirmed

- **Depends on POS-001** (same scheduler, same interface) — satisfied.
  `PosSyncService` is POS-agnostic; `getPOSProvider('caspeco', {mock})`
  is the only integration seam.
- **API-004 (mark-order-paid → POS queue)** already enqueues via
  `payments_enqueue_pos_update` → drains through
  `PosUpdateQueueWorker` — Caspeco's `markOrderPaid` plugs in there
  without changes.
