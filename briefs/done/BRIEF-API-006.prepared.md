# BRIEF-API-006 — Google review redirect — PREPARED

- **Date:** 2026-04-23T07:45+02:00
- **Commit:** pending-zivar-commit
- **Status:** Files complete. Awaiting manual verification by Zivar.

## Summary

Implements the Google Business Profile review-redirect service for
BRIEF-API-006. Guest-PWA (KI-007) already POSTs to `/reviews` with
`{ payment_id, rating, text?, email?, phone?, consent }`; this brief
makes that endpoint real.

Flow:

1. Guest submits via `/feedback` (KI-007) → client calls
   `POST /reviews` on the API.
2. Route validates the body with the shared
   `reviewSubmitRequestSchema` (`packages/schemas/src/review.ts`).
3. Route calls the anon-safe SECURITY DEFINER RPC `submit_review`
   (DB-003). That RPC:
   - 404s if payment doesn't exist,
   - 409s via `22023` if payment isn't `completed`,
   - 23505s the second call for the same payment,
   - otherwise inserts the reviews row and returns the new `id`.
4. Iff `consent === true` **and** `rating >= 4`, the route re-reads
   the review (to get its `restaurant_id`) and then the restaurant's
   `google_place_id`. When that column is set the response carries
   `redirect_url = https://search.google.com/local/writereview?placeid=<id>`
   and we stamp `reviews.published_to_google_at = now()` for audit.
   When `google_place_id` is null we return `redirect_url: null` so the
   guest still sees a polite thank-you (KI-007 handles both).
5. All other cases → `redirect_url: null`.

## Files changed

- **Added:**
  - `packages/db/supabase/migrations/20260423000010_google_place_id.sql`
    — `alter table restaurants add column google_place_id` + length
    CHECK guarded by a `DO $$ … $$;` block (Postgres has no
    `ADD CONSTRAINT IF NOT EXISTS`).
  - `apps/api/src/routes/reviews.ts` — full `POST /reviews` handler,
    validates + calls RPC + builds redirect.
- **Modified:**
  - `packages/db/src/database.types.ts` — `restaurants.google_place_id`
    added to Row / Insert / Update (was missing); migration list
    comment extended with 010.
  - `apps/api/src/server.ts` — registered `reviewsRoute`.
  - `NIGHT-RUN.md` — added Prepared entry, bumped total to 21/28.

## Local verifications

Could not run `pnpm typecheck` / `pnpm lint` — `registry.npmjs.org` is
in the proxy deny-list (no `pnpm` in the sandbox, no `node_modules/`).
Following the DB-003 / KI-007 precedent, hand-review in lieu of tool
verifs:

- **Imports resolved.**
  - `reviewSubmitRequestSchema`, `reviewSubmitResponseSchema`,
    `reviewErrorResponseSchema`, `ReviewSubmitResponse` all live in
    `packages/schemas/src/review.ts` and are re-exported via
    `packages/schemas/src/index.ts`.
  - `FastifyInstance`, `FastifyPluginAsync` match the pattern in
    `routes/payments.ts`.
  - No stale `Review` type import — earlier draft used
    `@flowpay/db/types` `Review`; removed since we rely on the
    inferred supabase-js row type.
- **TS-strict sanity.**
  - `verbatimModuleSyntax` respected: `ReviewSubmitResponse` imported
    as `type`.
  - `noUncheckedIndexedAccess` irrelevant here — no array indexing.
  - `noUnusedLocals` clean: every import used.
  - `maybeSingle()` is called without a generic arg (consistent with
    other routes; supabase-js infers the row shape from the typed
    client).
- **Error-mapping correctness.**
  - Verified against `submit_review` RPC body in
    `20260423000009_reviews.sql`:
    - rating out of range → `22023` with "rating" in message → 400
      INVALID_REQUEST.
    - payment not found → `02000` → 404 PAYMENT_NOT_FOUND.
    - payment not completed → `22023` without "rating" → 409
      PAYMENT_NOT_COMPLETED.
    - duplicate → unique-violation `23505` → 409 ALREADY_SUBMITTED.
  - The code dispatch is tight: inspects `pgCode(err)` first, then
    `pgMessage(err).toLowerCase().includes('rating')` to split the two
    22023 cases.
- **Audit trigger interop.**
  - `reviews_enforce_reply_only()` bypasses itself when
    `auth.uid() is null` — the service-role admin client has no JWT
    subject so the stamp of `published_to_google_at` does NOT trigger
    "only replied_at + reply_text may change" (verified in migration
    009 lines 104..107). Safe.
- **Anti-patterns (BRIEF-API-006).**
  - We never POST to Google — only redirect to
    `search.google.com/local/writereview`.
  - `encodeURIComponent(placeId)` on the URL path — prevents quote
    injection if a future schema change allows non-opaque characters.
  - `redirect_url` gated on `consent && rating >= 4 && place_id`
    exactly as the brief's "Verifiering" list requires.
  - No Google OAuth-tokens anywhere in this brief.

## Manual steps for Zivar (run locally with network access)

```bash
# 1. Install + local verifs the sandbox couldn't run.
pnpm install
pnpm --filter @flowpay/api typecheck
pnpm --filter @flowpay/api lint

# 2. Regenerate DB types after applying migration 010 (or hand-verify
#    the diff matches what I added).
supabase db push        # applies 20260423000010_google_place_id.sql
pnpm --filter @flowpay/db gen-types

# 3. Start the API locally + exercise the four verification bullets:
pnpm --filter @flowpay/api dev

#    a. Hög rating + consent + place_id → redirect_url present.
#       Set a place_id first:
#         update restaurants set google_place_id='ChIJEXAMPLE' where slug='foo';
#       Then from psql / supabase SQL editor verify a completed payment
#       exists; POST /reviews with { payment_id, rating:5, consent:true }.
#       Expect { review_id, redirect_url:"https://search.google.com/local/writereview?placeid=ChIJEXAMPLE" }.
#       And:  select published_to_google_at from public.reviews
#             where id = <review_id>;   -- non-null
#
#    b. Låg rating → redirect_url null (regardless of consent).
#       POST /reviews with rating:2, consent:true. Expect redirect_url:null.
#
#    c. Hög rating utan consent → redirect_url null.
#       POST /reviews with rating:5, consent:false. Expect redirect_url:null.
#       published_to_google_at should remain null.
#
#    d. Saknad place_id → redirect_url null (graceful).
#       update restaurants set google_place_id=null where slug='foo';
#       POST /reviews with rating:5, consent:true. Expect redirect_url:null.
#       published_to_google_at should remain null.
#
# 4. Duplicate-submit → 409 ALREADY_SUBMITTED.
#    POST /reviews twice on the same payment_id. Second call returns
#    { error: { code: "ALREADY_SUBMITTED", ... } }.
#
# 5. Payment not completed → 409 PAYMENT_NOT_COMPLETED.
#    Create a payment row with status='pending' and POST /reviews.
#
# 6. Payment missing → 404 PAYMENT_NOT_FOUND.
#    POST /reviews with a made-up UUID.
```

## Open-for-next-brief

- POS-002 (Caspeco adapter) and TA-005 (QR-PDF generator) are the
  remaining mock-first briefs.
- API-006's redirect is stateless once `google_place_id` is set — the
  admin app (TA-004 when auth lands) will just need a text input that
  writes `restaurants.google_place_id`.
