# BRIEF-IN-002 — UNBLOCKED (retry with new Supabase project)

**Date:** 2026-04-20 (second attempt, after region swap)

## Answer from Zivar
Old project `flowpay-prod` (ref: xpzxqhefxczcrvkqltdp) deleted.
New project created in Sweden region. Credentials updated in
`.agent/secrets.env` on the developer machine.

New env vars (populated via `source .agent/env.sh`):
- `SUPABASE_URL=https://nhpmaxtdxkzbauqbkbdk.supabase.co`
- `SUPABASE_PROJECT_REF=nhpmaxtdxkzbauqbkbdk`
- `SUPABASE_ANON_KEY` (sb_publishable_...)
- `SUPABASE_SECRET_KEY` (sb_secret_...)
- `SUPABASE_SERVICE_KEY` — alias of SECRET_KEY for backward compat

**Note:** `SUPABASE_DB_PASSWORD` is NOT yet set in secrets.env.
It's only needed later for `supabase db push` (migrations). For
BRIEF-IN-002 itself (scaffolding packages/db) no password is required.
If DB-001 or later briefs need the password, block and ask Zivar.

## Verification gate before executing IN-002

At the start of the run, after sourcing env.sh, verify:
```bash
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "Missing Supabase env vars — check .agent/secrets.env is readable from mount"
  exit 1
fi
curl -s -o /tmp/sb.json -w "%{http_code}" \
  "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_ANON_KEY"
# Expect 200. If 401/403, keys are wrong. If timeout, network issue.
```

If that passes, proceed with the cloud-first steps below.

## Steps (cloud-first, no Docker)

Brief `briefs/BRIEF-IN-002-supabase.md` is already updated to cloud-first
version by a previous run. Follow its Steps section. Short reference:

1. `cd packages && mkdir -p db && cd db && pnpm init`
2. Set `"name": "@flowpay/db"`, `"private": true` in package.json
3. `pnpm add -D supabase`
4. `npx supabase init` (generates supabase/config.toml)
5. Edit config.toml: `project_id = "nhpmaxtdxkzbauqbkbdk"`
6. Add scripts to packages/db/package.json:
   - `"db:push": "supabase db push"`
   - `"db:pull": "supabase db pull"`
   - `"db:diff": "supabase db diff"`
7. Create/update `apps/api/.env.example` with SUPABASE_* placeholders
8. README in packages/db — cloud-only workflow
9. Commit: `chore(db): supabase cloud setup (flowpay-sweden)`
10. Create `briefs/done/BRIEF-IN-002.done.md` per protocol
11. Move this file to `questions/done/BRIEF-IN-002.answer.md`

## If still blocked

Create a new blocked file that describes the EXACT error (command + output),
don't recycle old blocked templates. The reason won't be "no Docker" anymore.
