# @flowpay/api

FlowPay's HTTP API — Fastify + TypeScript + Zod + Supabase.

The API is intentionally thin: it delegates most work to Supabase RPCs
and to the POS adapter packages. It is the only service that holds the
`SUPABASE_SERVICE_KEY`.

## Local development

```bash
cp apps/api/.env.example apps/api/.env
# Fill SUPABASE_URL / ANON_KEY / SERVICE_KEY from the Supabase dashboard.

pnpm install
pnpm --filter @flowpay/api dev
# → API listening on http://0.0.0.0:3001

curl http://localhost:3001/health
# → { "status": "ok", "uptime": 1, "db": { "connected": true, "latencyMs": 42 }, ... }
```

## Scripts

- `pnpm dev` — tsx watch, hot-reload.
- `pnpm build` — emits `dist/` via `tsc`.
- `pnpm start` — `node dist/server.js` (what the Docker image runs).
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm lint` — Biome.

## Layout

```
src/
  config.ts           # Zod-validated runtime config
  server.ts           # Fastify entrypoint (buildServer + main)
  plugins/
    config.ts         # fastify.config
    supabase.ts       # fastify.supabase + fastify.supabaseAdmin
  routes/
    health.ts         # GET /health
```

## Conventions

- Handlers live in `routes/*.ts`, registered in `server.ts`. Never inline
  in the server file.
- Use `fastify.supabase` (anon) in anything that runs on behalf of a
  guest. Use `fastify.supabaseAdmin` (service role) only in server-only
  flows — webhooks, cron, onboarding.
- All request/response shapes validated with Zod schemas from
  `@flowpay/schemas` (added in API-002+).

## Docker

```bash
docker build -f apps/api/Dockerfile -t flowpay-api .
docker run --rm -p 3001:3001 --env-file apps/api/.env flowpay-api
```

Build context must be the monorepo root — the Dockerfile copies the
whole workspace so pnpm can resolve `@flowpay/db`.
