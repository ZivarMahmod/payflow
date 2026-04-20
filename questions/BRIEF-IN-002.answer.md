# BRIEF-IN-002 — UNBLOCKED via Supabase Cloud

**Date:** 2026-04-20

## Answer from Zivar
Supabase Cloud (Pro plan) replaces local Docker. Project `flowpay-prod` exists
on supabase.com in region `eu-north-1`. Credentials are in `.agent/secrets.env`
on the developer machine (gitignored, loaded by `env.sh`).

Env vars available during agent runs:
- `SUPABASE_URL` (project URL)
- `SUPABASE_PROJECT_REF=xpzxqhefxczcrvkqltdp`
- `SUPABASE_ANON_KEY` (publishable, sb_publishable_...)
- `SUPABASE_SERVICE_KEY` (secret, sb_secret_...)
- `SUPABASE_DB_PASSWORD`

## Updated steps for BRIEF-IN-002 (skip all Docker)

1. `cd packages && mkdir -p db && cd db`
2. `pnpm init` → `"name": "@flowpay/db"`, `"private": true`
3. `pnpm add -D supabase`
4. `npx supabase init` (creates `supabase/config.toml` + folders)
5. Ensure `supabase/config.toml` has `project_id = "xpzxqhefxczcrvkqltdp"`
6. Create or update `apps/api/.env.example` with empty placeholders:
   ```
   SUPABASE_URL=
   SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_KEY=
   ```
7. Add scripts in `packages/db/package.json`:
   - `"db:push": "supabase db push"`
   - `"db:pull": "supabase db pull"`
   - `"db:diff": "supabase db diff"`
8. README in `packages/db`: document cloud-only workflow (no local start/stop).
9. Connectivity smoke test (pipe to file, read last line only):
   `curl -s "${SUPABASE_URL}/rest/v1/" -H "apikey: ${SUPABASE_ANON_KEY}" > /tmp/sb.json && head -c 200 /tmp/sb.json`
10. Commit: `chore(db): supabase cloud-first dev setup (no local Docker)`
11. Create `briefs/done/BRIEF-IN-002.done.md` per protocol.
12. Move this file to `questions/done/BRIEF-IN-002.answer.md` when processed.

## Skipped verification items (cloud-only replacement)

- ~~`npx supabase start` startar utan fel~~ → replaced by curl smoke test.
- ~~Supabase Studio på http://localhost:54323~~ → use https://supabase.com/dashboard/project/xpzxqhefxczcrvkqltdp

## Next brief

After IN-002 is `done`: DB-001 (tenants schema) becomes eligible. It can run
migrations against cloud via `supabase db push` — no Docker needed.
