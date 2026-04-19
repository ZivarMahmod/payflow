# BRIEF-API-001: Fastify-skeleton
Thinking: 🟢 Normal

## Mål
Skapa apps/api — Fastify + TypeScript + Zod + Supabase-klient. /health endpoint. Ingen business-logik ännu.

## Kontext
- API:t är tunt — delegerar till Supabase RPC och POS-adapters.
- Fastify för prestanda. Zod för validering (delade scheman med klient).
- Deploy: Fly.io eu-north-1 (start).

## Berörda filer
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/src/server.ts`
- `apps/api/src/plugins/supabase.ts`
- `apps/api/src/routes/health.ts`
- `apps/api/.env.example`
- `apps/api/Dockerfile`

## Steg
1. Skapa apps/api, `pnpm init`.
2. Installera: fastify, @fastify/cors, @fastify/rate-limit, zod, @supabase/supabase-js, dotenv, tsx, typescript, @types/node.
3. tsconfig: strict, target ES2022, module NodeNext, moduleResolution NodeNext.
4. server.ts: starta Fastify, registrera CORS, ladda .env, registrera plugins, lyssna på PORT (default 3001).
5. plugins/supabase.ts: skapa både publik (anon) och admin (service_role) client. Decoreta fastify.supabase och fastify.supabaseAdmin.
6. routes/health.ts: GET /health → { status: 'ok', uptime, db: <ping result> }.
7. Scripts: dev (tsx watch src/server.ts), build (tsc), start (node dist/server.js).
8. Dockerfile multi-stage (node:22-alpine).
9. .env.example: PORT, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY.
10. Commit: `feat(api): fastify skeleton`.

## Verifiering
- [ ] `pnpm --filter api dev` startar utan fel.
- [ ] GET http://localhost:3001/health → status ok + db connected.
- [ ] TypeScript strict — inga fel.
- [ ] Dockerfile bygger.

## Anti-patterns
- INTE Express — Fastify medvetet.
- ALDRIG service_role-clienten i publika routes.
- Skriv ALDRIG handlers inline i server.ts.

## Kopplingar
Beror på: IN-001, IN-002.
