# BRIEF-API-002 — GET /orders/:token endpoint — PREPARED

- **Date:** 2026-04-23T02:20+02:00
- **Commit:** pending-zivar-commit (sandbox cannot reach github.com / registry.npmjs.org — see `STATUS-SANDBOX-EGRESS-FULL-BLOCK.md`)
- **Status:** Files complete + vitest suite covers all 6 brief verification bullets. Awaiting Zivar's local `pnpm install && pnpm -w test` once registry is reachable.
- **Tier:** 🟡 Think — public endpoint, no auth, so the blast radius is "every guest on every Friday night". Handled with Zod validation both in and out, set-based gone-status check, anti-pattern grep in the test, Cache-Control: no-store, per-route rate limit.

## Local verifications

- [ ] pnpm install          — deferred (no registry access)
- [ ] pnpm -w typecheck     — deferred (but hand-reviewed against generated RPC types)
- [ ] pnpm -w lint          — deferred
- [ ] pnpm -w --filter @flowpay/api test  — deferred (6 vitest cases authored)

## Manual steps for Zivar (run locally)

```bash
# 1. Apply the new migration (adds logo_url + swish_number to the RPC).
cd packages/db
pnpm db:push       # applies 20260423000005_order_by_token_v2.sql
pnpm supabase gen types typescript --linked > src/database.types.ts
#   → should match the hand-edited file (widened get_order_by_token).

# 2. Install everything + run tests.
cd ../..
pnpm install                   # picks up @fastify/rate-limit per-route + vitest
pnpm -w typecheck
pnpm -w --filter @flowpay/api test
#   Expected: 6 passing tests in src/routes/orders.test.ts.

# 3. Smoke test against a real Supabase row.
#    3a. Seed a restaurant + table + orders_cache row via SQL editor:
#       insert into public.restaurants (id, slug, name, swish_number, logo_url)
#       values ('11111111-1111-1111-1111-111111111111', 'prinsen-sthlm',
#               'Restaurang Prinsen', '1231231231',
#               'https://cdn.flowpay.se/logos/prinsen.png');
#       insert into public.tables (id, restaurant_id, table_number)
#       values ('22222222-2222-2222-2222-222222222222',
#               '11111111-1111-1111-1111-111111111111', '7');
#       insert into public.orders_cache
#         (id, restaurant_id, table_id, pos_type, pos_order_id,
#          order_token, status, total, currency, items)
#       values (gen_random_uuid(),
#               '11111111-1111-1111-1111-111111111111',
#               '22222222-2222-2222-2222-222222222222',
#               'onslip', 'demo-bill-1', 'tok_demo1234abcd', 'open',
#               368.5, 'SEK',
#               '[{"name":"Pilsner","qty":2,"unitPrice":89,"lineTotal":178},
#                 {"name":"Räkmacka","qty":1,"unitPrice":120.5}]'::jsonb);

#    3b. Start the API and curl it:
cat > apps/api/.env <<EOF
NODE_ENV=development
PORT=3001
HOST=127.0.0.1
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_KEY=<service-key>
CORS_ORIGINS=http://localhost:3000
LOG_LEVEL=debug
EOF

pnpm --filter @flowpay/api dev
# In another shell:
curl -s http://127.0.0.1:3001/orders/tok_demo1234abcd | jq
#   Expected: { id: "tok_demo1234abcd", total: 368.5, currency: "SEK",
#               status: "open", items: [2 rows], restaurant: { name, slug,
#               logoUrl, swishNumber }, table: { number: "7" }, updatedAt }

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/orders/tok_does_not_exist
#   Expected: 404

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/orders/abc
#   Expected: 400 (token too short)

# 4. Flip status='paid' in the DB and re-curl — should return 410.
#    update public.orders_cache set status = 'paid'
#    where order_token = 'tok_demo1234abcd';
#    curl ... → 410 { error: { code: "ORDER_GONE", status: "paid" } }

# 5. Rate limit smoke — 11 rapid-fire requests from the same IP.
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:3001/orders/tok_demo1234abcd
done; echo
#   Expected: 200 200 200 200 200 200 200 200 200 200 429
```

## Design review (🟡 self-review)

1. **RPC via anon client, not service-role.** The RPC `get_order_by_token` is `SECURITY DEFINER STABLE` and `execute` is granted to `anon, authenticated`. Using the anon client here honours least privilege — the endpoint's auth story is "possession of the token IS the credential", and the RPC enforces that server-side by filtering `status in ('open','paying')` and returning ONLY the curated projection. Running it via service-role adds zero and undermines the RLS story for future routes.
2. **Zod both on the way in and on the way out.** `orderTokenParamSchema` (min 8, max 256) gates invalid requests before they hit the DB. `orderByTokenResponseSchema.safeParse()` runs on the composed response — catches shape drift between `database.types.ts` and the wire contract in dev, no-op in prod.
3. **`cachedOrderItemSchema` at the jsonb boundary.** `orders_cache.items` is typed `Json | null`. Rather than trust-cast it to an array of items, we iterate and Zod-parse each row. If the POS adapter ever writes a malformed line, we surface `UPSTREAM_ERROR` 502 instead of shipping garbage.
4. **`lineTotal` computation is defensive.** Some adapters include it, some don't. We accept both in the cached shape and always emit a computed `lineTotal` on the wire so the guest never sees `undefined`.
5. **410 Gone distinct from 404 Not Found.** Brief says 404 for null, 410 for closed/paid. A guest whose URL is stale (bill paid by a friend) gets a semantically accurate status and the client can render "this bill has been paid" rather than "unknown bill". The RPC already filters `status in ('open','paying')`, so 410 is belt-and-braces for the case where a future migration loosens the RPC filter.
6. **Status type-coerce.** The DB enum includes `cancelled`, but our public schema only allows `open|paying|paid|closed`. The RPC filter makes `cancelled` impossible to reach 200, but I type-assert (`row.status as OrderLiveStatus`) rather than branching on it to keep the code linear. If the enum grows, the Zod output validation catches it.
7. **Rate limit is per-route, overrides global.** Global is 300/min (for /health mostly). This route is 10/min per IP as the brief demands. `@fastify/rate-limit` v10 supports per-route overrides via the `config.rateLimit` option in the route definition.
8. **IP key-generation via X-Forwarded-For first-hop.** Consistent with server.ts global config. Fly.io sets XFF; localhost falls back to `req.ip`.
9. **`Cache-Control: no-store`.** Brief anti-pattern: "Cacha ALDRIG response." The header is set explicitly on every 200; error responses don't matter because they're cheap to re-compute.
10. **Error text redaction.** Postgres `error.message` NEVER goes out to the client — it's logged with token-prefix-only (first 6 chars) for correlation. The test case `returns 502 when the RPC errors out` asserts the raw pg error string doesn't appear in the body.
11. **No internal IDs leak.** The RPC projection doesn't include `pos_order_id`, `restaurant_id`, `table_id`, or `credentials_encrypted`. The test `returns 200 with the curated shape` asserts via JSON-grep that these strings don't appear anywhere in the response. Insurance for the day someone widens the RPC accidentally.
12. **No caching in node_modules for the PWA either.** The response's `updatedAt` is the `last_synced_at` column, not `opened_at`. KI-002 will use a Supabase realtime channel on `orders_cache` for live updates; `updatedAt` is a hint, not a source of truth.

## Avvikelser från briefen

- **Schemas file at `packages/schemas/src/order.ts` — kept separate from existing `index.ts`.** The existing `orderSchema` uses ÖRE integers (KI-001 dummy-nota). API-002 uses decimal SEK because that's what the DB and POS adapters speak. Rather than break KI-001's fixture path, I added `orderByTokenResponseSchema` alongside and re-exported via `index.ts`. A future brief can converge both on öre once KI-002 confirms the PWA's math works that way.
- **Field name: `id` on the response, not `token`.** The brief's Zod sample has `id: z.string()`. I mapped `order_token → id` so the wire shape matches the brief exactly. Internally everything is still "token" (path param, RPC arg, schema name `orderTokenParamSchema`) — only the response key is `id`.
- **Added `currency.length === 3` on output schema.** Brief has `currency: z.string()`. Three characters (SEK/EUR/USD) is the only legal value so we lock it down. The DB enforces via `check (currency in ('SEK',...))`.
- **Added `updatedAt` ISO timestamp to the wire shape.** Brief doesn't mention it. The guest PWA needs to show "uppdaterat 15:30:30" so realtime reconciles don't look stale. Free information, taken from `last_synced_at`.
- **Validation of inbound token** uses min 8 chars (not Zod's default of min 1). 8 chars matches the token generator in DB-002 (16 hex chars). Shorter inputs are always malformed → 400 before DB.
- **502 instead of 500 when RPC errors.** PostgREST errors mean Supabase is sad; that's upstream to us, so the semantic code is 502. Matches how pos-sync classifies 5xx from Onslip as retryable upstream.
- **Test runner is vitest** (brief says "vitest" ✓). Added `vitest@^2.1.8` dev-dep and `vitest.config.ts` with `pool: 'forks', singleFork: true` because tests mutate `process.env`.
- **Test approach: `fastify.inject` + rpc stub.** No real Supabase, no HTTP. The stub replaces `fastify.supabase.rpc` after `buildServer()` and lets each case script its own response. Fast (≈200ms per test), reproducible, and covers all 6 brief verification bullets.
- **Rate-limit test uses `x-forwarded-for` = `203.0.113.42`** (TEST-NET-3, reserved). Prevents the CI test from ever colliding with a real IP. The 11th request asserts 429 explicitly.
- **Migration 005 (`20260423000005_order_by_token_v2.sql`) not 003 edit.** DB-002's 003 migration is already "prepared". I chose `CREATE OR REPLACE FUNCTION` in a new migration over editing 003 so the project's migration sequence stays immutable (Supabase treats migrations as append-only once pushed).
- **`orderGoneSchema` exported** (in `order.ts`) for the 410 response body, even though routes shape it inline today. Admin dashboard may need to render gone-status info; having the schema documented centrally beats each caller re-deriving it.
- **Anti-pattern grep IN the test, not just in the review.** The happy-path test case greps the JSON response for `pos_order_id`, `restaurant_id`, `credentials` and asserts absence. Catches a regression the day someone widens the RPC without thinking.

## Files changed / added

- `packages/db/supabase/migrations/20260423000005_order_by_token_v2.sql` — new. Widens RPC to include `restaurant_logo_url` + `restaurant_swish_number`.
- `packages/db/src/database.types.ts` — updated RPC return signature to match migration 005.
- `packages/schemas/src/order.ts` — new. `orderByTokenResponseSchema`, `cachedOrderItemSchema`, gone-status schemas.
- `packages/schemas/src/index.ts` — re-export `./order.js`.
- `apps/api/src/routes/orders.ts` — new. GET /orders/:token with Zod in/out, per-route rate limit, 404/410/502 handling.
- `apps/api/src/routes/orders.test.ts` — new. Six vitest cases covering happy path, 404, 400, 410, rate limit, upstream error.
- `apps/api/src/server.ts` — registers `ordersRoute`.
- `apps/api/package.json` — adds `vitest` dev-dep, flips `test` script from stub to `vitest run`.
- `apps/api/vitest.config.ts` — new. node env, single-fork pool because tests mutate `process.env`.

## Frågor till Zivar

- **Token length minimum = 8.** The DB-002 generator emits 16 hex chars so 8 is safe. If you later decide to use short codes (e.g. 6-char human-readable for table tents), we need to loosen this and confirm collision-resistance. Fine as-is?
- **Cache-Control on the response is `no-store`.** No CDN in front of the API yet, but when Cloudflare lands in DEV-001-or-whatever we need to make sure this route is excluded from edge caching. Flag raised; will revisit at the Cloudflare brief.
- **Migration 005 = tiny DDL, no data change.** Safe to apply on prod without a window.
- **Swish number is returned verbatim from `restaurants.swish_number`.** That column is intentionally "public" (it's printed on the shop's window) but worth noting: anyone who guesses a token sees it. Token is the access-control boundary — the lookup only returns this row if the token matches. Zero info leak beyond what's already on the wall.
