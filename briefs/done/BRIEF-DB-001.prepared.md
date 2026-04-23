# BRIEF-DB-001 — Initial tenant schema — PREPARED

- **Date:** 2026-04-23T00:30+02:00
- **Commit:** pending-zivar-commit (sandbox cannot reach github.com — see `STATUS-SANDBOX-EGRESS-FULL-BLOCK.md`)
- **Status:** Files complete. Awaiting manual verification by Zivar.

## Local verifications

This sandbox cannot reach `registry.npmjs.org` (403 blocked-by-allowlist), so
`pnpm install` / `pnpm typecheck` / `pnpm lint` cannot run here. All files
were hand-reviewed. Zivar verifies locally per "Manual steps" below.

- [ ] pnpm typecheck  — deferred to Zivar's machine
- [ ] pnpm lint       — deferred to Zivar's machine
- [ ] Unit tests      — no tests defined in this brief

## Manual steps for Zivar (run locally with network access)

```bash
cd <payflow>
pnpm install                      # brings in typescript for @flowpay/db
pnpm typecheck                    # expect: 5 tasks green (adds @flowpay/db)
pnpm lint                         # expect: 4 tasks green

cd packages/db
pnpm db:push                      # applies migrations to flowpay-sweden cloud
# Supabase Studio (or CLI) — verify:
#   - 4 tables in public: restaurants, locations, tables, staff
#   - seed.sql applied: Test Bistro + 1 location + 3 tables
#   - update any row -> updated_at bumps automatically
#   - re-running `pnpm db:push` is a no-op (idempotent)

pnpm supabase gen types typescript --linked > packages/db/src/database.types.ts
# Diff the generated file against the hand-authored one. Expect a clean
# diff — only whitespace/ordering. If anything else differs, the migration
# needs to be adjusted.
```

## Files changed

- `packages/db/supabase/migrations/20260423000001_initial_tenants.sql` — new. 4 tables + updated_at trigger + indexes. Idempotent via IF NOT EXISTS + DROP TRIGGER IF EXISTS.
- `packages/db/supabase/seed.sql` — new. Deterministic UUIDs and qr_tokens so the guest PWA can be demo'd against hard-coded tokens.
- `packages/db/src/database.types.ts` — new. Hand-authored Supabase types mirroring the migration. Zivar overwrites with `supabase gen types --linked` in the morning.
- `packages/db/src/index.ts` — new. Re-exports Database + row type helpers (`Restaurant`, `Location`, `TableRow`, `StaffMember`).
- `packages/db/package.json` — added `type: "module"`, `exports`, `typecheck`/`lint` scripts (real tsc/biome instead of stubs), `typescript` devDep.
- `packages/db/tsconfig.json` — new. Extends base, `noEmit`, `include: src/**/*.ts`.

## Avvikelser från briefen

- **Brief Step 9 (`npx supabase db reset` lokalt):** Not applicable. Per `packages/db/README.md` we are cloud-first with no local Docker. The equivalent is `pnpm db:push` against the Supabase Cloud project `flowpay-sweden`. Documented above.
- **Brief Step 10 (`supabase gen types --local`):** Source-of-truth is `--linked`, not `--local`, since we're cloud-first. Hand-authored `database.types.ts` is a temporary placeholder — overwritten on first successful run of `supabase gen types --linked`.
- **Migration filename:** Uses a Supabase-compatible timestamp prefix (`20260423000001_initial_tenants.sql`) instead of the plain `001_initial_tenants.sql` from the brief, because `supabase db push` requires the `YYYYMMDDHHMMSS_` prefix to order migrations correctly. Without it subsequent migrations cannot interleave deterministically.
- **staff.unique(restaurant_id, user_id):** Added — not in the brief. A Supabase auth user shouldn't be able to hold two role rows for the same restaurant (SC-001 RLS will rely on uniqueness to make the owner/manager/staff check deterministic). Zero data yet, safe to add.

## Frågor till Zivar

- None blocking. If you want the migration renamed to `001_initial_tenants.sql` without the timestamp prefix, let me know — but that will break Supabase CLI's ordering when DB-002 arrives.

## Schema summary (for quick review)

- **restaurants** — tenant root. `slug` unique, used in URLs.
- **locations** — physical sites. FK to restaurants cascade.
- **tables** — has `qr_token` (32 hex chars, default from `gen_random_bytes(16)`). FK to locations cascade.
- **staff** — `(restaurant_id, user_id)` unique; role ∈ {owner, manager, staff}. FK to `auth.users` cascade.
- **set_updated_at()** trigger function + triggers on restaurants/locations/tables.
- Indexes: `restaurants(slug)`, `tables(qr_token) unique`, `tables(location_id)`, `staff(user_id)`, `staff(restaurant_id)`, `locations(restaurant_id)`.
- No RLS — intentional. SC-001 adds it.
