# BRIEF-API-001 — Fastify skeleton — PREPARED

- **Date:** 2026-04-23T01:10+02:00
- **Commit:** pending-zivar-commit (sandbox cannot reach github.com / registry.npmjs.org — see `STATUS-SANDBOX-EGRESS-FULL-BLOCK.md`)
- **Status:** Files complete. Awaiting `pnpm install` + `pnpm dev` on Zivar's machine.
- **Tier:** 🟢 Normal

## Local verifications

Sandbox cannot install npm packages. TypeScript was written against the
Fastify 5 / @supabase/supabase-js 2.46 / Zod 3.23 APIs as documented;
hand-reviewed for strict-mode correctness.

- [ ] pnpm install         — deferred (no registry access)
- [ ] pnpm --filter @flowpay/api typecheck  — deferred
- [ ] pnpm --filter @flowpay/api lint       — deferred
- [ ] pnpm --filter @flowpay/api dev        — deferred
- [ ] `curl localhost:3001/health`          — deferred
- [ ] docker build                          — deferred

## Manual steps for Zivar (run locally)

```bash
cd apps/api
cp .env.example .env
# Paste SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY from
#   supabase.com/dashboard → flowpay-sweden → Settings → API

pnpm install                  # installs fastify, @fastify/cors, zod, etc.
pnpm -w typecheck             # should pass across the workspace
pnpm --filter @flowpay/api dev
# → API listening on http://0.0.0.0:3001

# In another terminal:
curl -s http://localhost:3001/health | jq
# Expected:
# {
#   "status": "ok",
#   "uptime": <small number>,
#   "db": { "connected": true, "latencyMs": <~50-200> },
#   "version": "0.0.1",
#   "now": "2026-04-23T..."
# }

# Rate-limit check — 301 requests in a minute should start returning 429:
for i in $(seq 1 310); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health; done | sort | uniq -c
# Expected: mostly 200, some 429 at the tail.

# Docker build — context MUST be monorepo root:
cd ../..
docker build -f apps/api/Dockerfile -t flowpay-api .
docker run --rm -p 3001:3001 --env-file apps/api/.env flowpay-api
```

## Security review

1. **Service key never in a client bundle.** Only `supabasePlugin` reads it, and nothing in `routes/` calls `fastify.supabaseAdmin` yet. The rule is enforced by convention + the brief's anti-pattern list; later PRs should add a lint rule if they hand-roll admin calls.
2. **Zod-validated env at boot.** Missing/malformed vars → process throws before listening. No half-broken server in prod.
3. **CORS allowlist in production.** `CORS_ORIGINS` empty = dev-only "allow any"; production requires explicit origins. The plugin callback rejects anything outside the list.
4. **Rate limit per X-Forwarded-For.** Behind Fly.io proxies, trusting `req.ip` gives the proxy IP — we derive from `X-Forwarded-For[0]` instead so limits bite per real client.
5. **`trustProxy: true`** is required for Fly.io, but that also means we MUST NOT read `req.ip` for security decisions without proxy awareness. We don't currently.
6. **Error handler strips internals.** 500s never leak the stack to clients; `request.log.error` gets the full err object for Fly logs.
7. **`bodyLimit: 1 MB`** — caps JSON payload. Reviews/feedback later might grow — bump if a brief needs it.
8. **Graceful shutdown.** SIGTERM → `server.close()` awaits inflight requests. Fly.io's default 5-second grace is plenty.
9. **Supabase client options:** `persistSession: false` and no refresh — these are server-side clients that should NOT maintain auth state.

## Avvikelser från briefen

- **Added `fastify-plugin` wrapper for config + supabase plugins.** The brief says "registrera plugins" — Fastify v5 requires `fp()` to make decorators visible outside the plugin's encapsulated scope. Without it `fastify.supabase` would only be visible to siblings, not to routes.
- **Added `tsconfig.build.json`.** Separate from `tsconfig.json` because the root config sets `noEmit: true` (so `tsc --noEmit` is the default typecheck), but the Docker build needs to actually emit.
- **Added Pino pretty-print in dev + JSON in prod.** Brief doesn't mention logging; Fastify ships Pino by default. Dev gets a readable log; Fly.io's log aggregator wants JSON.
- **Added `HOST`, `CORS_ORIGINS`, `LOG_LEVEL` to `.env.example`.** Not in brief but needed by `server.ts` / `config.ts`. Defaults are sane (0.0.0.0, empty, info).
- **`USE_MOCK_*` already in .env.example** — carried over from the pre-existing file, validated by Zod schema.
- **Dockerfile is 3-stage and works from monorepo root.** The brief says "multi-stage (node:22-alpine)" — I wrote a deps / build / runtime split so production images don't ship dev deps, and documented that the build context must be the repo root (because workspace packages like `@flowpay/db` need to be resolvable).
- **`.dockerignore` + `.gitignore` added.** Small but standard; keeps `.env` and `node_modules` out of images/commits.
- **`fastify.supabase.rpc('get_order_by_token', ...)` used for the DB ping.** It's the cheapest anon-level call we have, covered by DB-002. Returns 0 rows (not an error) for a bogus token, so we can measure DB latency without depending on any specific data existing.
- **Typed decorators via `declare module 'fastify'`.** So routes see `fastify.supabase` / `fastify.supabaseAdmin` / `fastify.config` with full types instead of `any`.
- **`main()` only runs if the file was invoked directly** (checks `import.meta.url`). Lets future tests import `buildServer` without the server auto-listening.

## Files changed / added

- `apps/api/package.json` — new.
- `apps/api/tsconfig.json` — new.
- `apps/api/tsconfig.build.json` — new.
- `apps/api/src/config.ts` — new.
- `apps/api/src/server.ts` — new.
- `apps/api/src/plugins/config.ts` — new.
- `apps/api/src/plugins/supabase.ts` — new.
- `apps/api/src/routes/health.ts` — new.
- `apps/api/Dockerfile` — new.
- `apps/api/.dockerignore` — new.
- `apps/api/.gitignore` — new.
- `apps/api/.env.example` — updated (added HOST, CORS_ORIGINS, LOG_LEVEL).
- `apps/api/README.md` — new.

## Frågor till Zivar

- **Fly.io region.** Brief says "Fly.io eu-north-1 (start)" — that matches Supabase region. No `fly.toml` in this brief; will come with a deploy brief later. OK?
- **`@flowpay/schemas` reference in README.** Mentioned as "added in API-002+" — schemas package exists (see `packages/schemas/`) but isn't consumed here. API-002 will actually import from it.
- **Logging to external aggregator.** Pino → stdout today. Fly.io aggregates stdout automatically. If we want Logtail/Datadog/etc. that's a separate brief.
