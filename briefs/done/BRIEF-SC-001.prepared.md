# BRIEF-SC-001 — RLS-policies on all tenant tables — PREPARED

- **Date:** 2026-04-23T00:40+02:00
- **Commit:** pending-zivar-commit (sandbox cannot reach github.com — see `STATUS-SANDBOX-EGRESS-FULL-BLOCK.md`)
- **Status:** Files complete. Awaiting manual verification by Zivar.
- **Tier:** 🔴 Think hard — extra care taken. See "Security review" below.

## Local verifications

Sandbox cannot run pnpm (no npm registry access). SQL was hand-reviewed
for anti-recursion, with-check vs. using coverage, and role-escalation gaps.

- [ ] pnpm typecheck  — deferred (no TS touched by this brief)
- [ ] pnpm lint       — deferred
- [ ] RLS smoke tests — deferred to Zivar's machine (test plan below)

## Manual steps for Zivar (run locally with network access)

```bash
cd packages/db
pnpm db:push                      # applies 002_rls_policies.sql

# In Supabase SQL editor, run the test plan below as two users:
#   1. Service-role (SQL editor default) — everything visible.
#   2. Impersonated authenticated user — only their own restaurant visible.
#      See "Test scenarios" at the bottom of this file.
```

## Test scenarios (Zivar runs in Supabase SQL editor)

```sql
-- Setup: 2 restaurants + 2 staff users (run as service-role)
insert into public.restaurants (id, slug, name) values
  ('a1111111-0000-0000-0000-000000000001', 'rest-a', 'Rest A'),
  ('a2222222-0000-0000-0000-000000000002', 'rest-b', 'Rest B')
on conflict do nothing;

-- You'll need two auth.users. Create them in Auth UI first, grab their
-- ids, then (as service-role):
insert into public.staff (restaurant_id, user_id, role) values
  ('a1111111-0000-0000-0000-000000000001', '<user-a>', 'owner'),
  ('a2222222-0000-0000-0000-000000000002', '<user-b>', 'owner');

-- Test as user A (set auth.uid() in SQL editor via role switcher):
select * from public.restaurants;   -- must return only Rest A
select * from public.staff;         -- must return only Rest A's staff

-- Try to insert staff into Rest B as user A → must FAIL with RLS violation.
insert into public.staff (restaurant_id, user_id, role)
values ('a2222222-0000-0000-0000-000000000002', '<user-a>', 'staff');

-- Try to update Rest B's name as user A → must FAIL.
update public.restaurants
set name = 'hacked' where slug = 'rest-b';

-- Infinite-recursion check: query staff 1000 times — must stay < 200ms.
explain analyze select count(*) from public.staff;
-- Look for `Function Scan on get_staff_restaurants` — means we did NOT
-- recursively hit the staff policies.
```

## Security review (🔴 self-review)

Potential issues checked:

1. **Infinite recursion on staff policies.** Mitigated via `get_staff_restaurants()` SECURITY DEFINER + STABLE. Policies on `staff` that reference staff would recurse, so they call the SECURITY DEFINER helper instead.
2. **Owner escalation.** Managers cannot insert/update rows with `role = 'owner'`. Check appears in both `with check` and `using` clauses — a manager cannot demote-then-promote-as-owner.
3. **Self-SELECT for onboarding.** `staff_select_self` exists so a newly-invited owner can see their own row BEFORE `get_staff_restaurants()` sees it (race: the staff row was just inserted by service-role, the `get_staff_restaurants()` query with STABLE caching might have cached the old set). Defensive coverage.
4. **`auth.uid()` is NULL for anon.** All policies implicitly exclude anon (only `to authenticated`). Anon has no explicit grants. Good.
5. **Service-role bypass.** Confirmed — Supabase Postgres applies `supabase_admin` as a superuser that ignores RLS. All server-side writes (onboarding, POS sync, payment completion) use `SUPABASE_SERVICE_KEY`.
6. **`with check` on all mutating policies.** Every INSERT/UPDATE has `with check` — not just `using`. Missing with-check is the #1 cause of RLS bugs where you can mutate INTO something you can't mutate FROM.
7. **Helper function grants.** `get_staff_restaurants()` / `get_staff_role()` have `REVOKE ALL FROM public` + `GRANT EXECUTE TO authenticated`. Anon cannot call them.
8. **tables → locations chain.** `tables` has no `restaurant_id` directly — policies walk through `locations`. Each policy uses an EXISTS subquery keyed on the RLS-visible locations view; the planner folds it with the get_staff_restaurants filter.
9. **DELETE rules.** Only `owner` can delete locations / tables / staff. Removed "manager can delete" even where not excluded by the brief — safer default. Zivar may relax per-table if needed.

## Avvikelser från briefen

- **Added `get_staff_role(restaurant_id uuid)` helper.** The brief only names `get_staff_restaurants()`. Inside a policy that needs "is caller an owner of *this* restaurant", `get_staff_restaurants()` returns *all* restaurants — a separate role lookup is cleaner than IN-list + join, and stable-tagged so it can be inlined. Kept SECURITY DEFINER for the same recursion reason.
- **Added `staff_select_self` policy.** Not in the brief, but covers the onboarding race where a newly-inserted owner isn't yet in their own `get_staff_restaurants()` result cache.
- **`REVOKE ALL … THEN GRANT SELECT/INSERT/UPDATE/DELETE TO authenticated`**. Explicit baseline rather than relying on implicit Postgres defaults. Safer when migrations change in future.
- **No INSERT policy on `restaurants`.** Brief doesn't specify — onboarding goes through service-role. Explicit absence is documented.
- **Migration filename `20260423000002_rls_policies.sql`** — timestamped prefix, same reasoning as DB-001.

## Files changed

- `packages/db/supabase/migrations/20260423000002_rls_policies.sql` — new.

## Frågor till Zivar

- **DELETE on staff by manager:** Brief allowed managers to modify staff; it doesn't spell out DELETE. I restricted DELETE to owners only. If that breaks the intended UX, relax by adding `staff_delete_managers_limited` following the same pattern as `staff_update_managers_limited`.
