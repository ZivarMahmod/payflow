# BRIEF-DB-003 — Reviews-tabell — PREPARED

- **Date:** 2026-04-23T06:05:44+02:00
- **Commit:** pending-zivar-commit
- **Status:** Files complete. Awaiting manual verification by Zivar.

## Summary

Reviews schema added as migration
`20260423000009_reviews.sql`. One row per `payments.id` (unique FK), with
`rating` (1..5), optional free text, guest contact, Google-publishing
consent/audit, and staff reply fields. RLS + SECURITY DEFINER RPC
`submit_review` ensure:

- Anon cannot INSERT directly — only through `submit_review`, which
  validates the associated payment exists with `status='completed'` and
  derives `restaurant_id` from the payment (so the guest can't spoof).
- Staff of the owning restaurant can SELECT all reviews.
- Staff UPDATE is restricted to `replied_at` + `reply_text` by a
  BEFORE UPDATE trigger. Attempting to mutate any other column raises
  `42501` ("staff may only update replied_at and reply_text").
- `service_role` bypasses the staff-update trigger (needed for the
  API's Google-publish flow to stamp `published_to_google_at`).

Types were extended by hand in `packages/db/src/database.types.ts` because
the sandbox can't reach `*.supabase.co` to run
`supabase gen types typescript --linked` — see CONTEXT.md "Egress is
blocked".

## Local verifications

Could not run `pnpm typecheck` / `pnpm lint` in this sandbox —
`registry.npmjs.org` is in the proxy deny-list (no `pnpm` available, no
`node_modules/` present). See `STATUS-SANDBOX-EGRESS-FULL-BLOCK.md`
§ "npm registry block — impact on local verifs" for the compensating
hand-review policy that was applied.

Hand-review covered:
- Migration SQL parses under standard Postgres 15 grammar — each
  `create ... if not exists`, `alter ... enable row level security`,
  `drop policy if exists`, and `create policy` statement mirrors the
  idioms used in migrations 002/003/006/007, which already compile.
- All type additions in `database.types.ts` follow the same shape used
  for existing tables (Row / Insert / Update / Relationships), with
  `UUID → string`, `timestamptz → string`, `boolean → boolean`, and
  `integer → number`. `Review` / `ReviewInsert` / `ReviewUpdate`
  helpers are exported alongside the existing helpers.
- `submit_review` RPC signature in the TS types matches the
  `(payment_id_param, rating_param, text_param, email_param,
  phone_param, consent_param)` parameter list in the SQL.

## Manual steps for Zivar (run locally with network access)

```bash
# 1. From the monorepo root — install + local verifs that the sandbox
#    could not run.
pnpm install
pnpm typecheck
pnpm lint

# 2. Push the migration to the linked Supabase project.
cd packages/db
pnpm supabase db push

# 3. Regenerate types from the live schema to overwrite the
#    hand-authored types (Zivar's local pnpm script wraps this).
pnpm supabase gen types typescript --linked > src/database.types.ts

# 4. Verify reviews contract end-to-end via psql (fill in a real
#    completed-payment id from a recent order):
PAYMENT_ID='<uuid of a completed payment>'
pnpm supabase db query "
select public.submit_review(
    '$PAYMENT_ID'::uuid,
    5,
    'Toppen!',
    'guest@example.com',
    '+46701234567',
    true
);
"
# Expected: a new uuid returned. Second call with the same payment_id
# must fail with unique_violation (23505).

# 5. Rating range — expect 22023 when out of bounds:
pnpm supabase db query "
select public.submit_review(
    '$PAYMENT_ID'::uuid, 0, null, null, null, false
);
"

# 6. Uncompleted payment — expect 22023 "not completed":
PENDING_PAYMENT='<uuid of a payment with status=pending>'
pnpm supabase db query "
select public.submit_review('$PENDING_PAYMENT'::uuid, 3, null, null, null, false);
"

# 7. Staff-update immutability — connect as a staff user and try to
#    update reviews.rating. Expect error 42501 from the trigger.
```

## Verification checklist mapping

- [x] **Review skapas via RPC med giltig payment** — covered by step 4
      above (manual). SQL path validated by hand review.
- [x] **Försök review utan completed payment → fel** — step 6 covers
      `22023 not completed`.
- [x] **Försök 2 reviews för samma payment → unique violation** — step 4
      second call. Enforced by `payment_id unique` column constraint.
- [x] **Staff ser endast egen restaurants reviews** — `reviews_select_staff`
      policy uses `restaurant_id in (select public.get_staff_restaurants())`
      which mirrors the exact pattern used in SC-001 and DB-002 for
      orders_cache, payments, payment_splits. Requires staff session to
      test manually — step 7.
- [x] **Rating utanför 1-5 → check violation** — step 5. Double-guarded
      by (a) the `check (rating between 1 and 5)` table constraint and
      (b) the explicit validation inside `submit_review` that raises
      22023 before the INSERT is attempted.

## Avvikelser från briefen

- **Naming convention**: the brief says `009_reviews.sql`, but the repo
  adopted a `YYYYMMDDHHMMSS_` prefix in migrations 001-008
  (`20260423000001_...` through `20260423000008_...`). I followed the
  established convention and named the file
  `20260423000009_reviews.sql`.
- **Unreplied partial index**: added
  `reviews_unreplied_idx (restaurant_id, created_at desc) where
  replied_at is null`. Not in the brief but trivially supports the
  staff inbox that TA-003 (currently SKIPPED for auth) will need, at
  no cost when reviews are replied.
- **Immutability trigger** (`reviews_enforce_reply_only`): the brief
  says "Staff UPDATE replied_at + reply_text" without specifying how to
  enforce that only these two columns may change. Postgres RLS cannot
  express column-level immutability, so I added a trigger. The guest-
  authored text must not be mutable post-submission; this is the
  guardrail.

## Frågor till Zivar

None. Patterns followed DB-002 / SC-001 idioms; no ambiguity.

## Filer skapade/ändrade

- `packages/db/supabase/migrations/20260423000009_reviews.sql` (new)
- `packages/db/src/database.types.ts` (updated: reviews table types,
  submit_review RPC signature, Review/ReviewInsert/ReviewUpdate helper
  exports, header comment extended to list migrations 008 + 009)

## Suggested commit message (for Zivar)

`feat(db): reviews schema`
