# BRIEF-KI-007 — Feedback-flöde — PREPARED

- **Date:** 2026-04-23T07:09+02:00
- **Commit:** pending-zivar-commit
- **Status:** Files complete. Awaiting manual verification by Zivar.

## Summary

Guest feedback flow added behind `/t/:slug/:tableId/feedback?payment=<id>`.
SuccessRoute already navigates here (see `apps/guest/src/routes/success.tsx`
`goToFeedback`) — KI-007 lands as a drop-in that makes that navigation
lead to real UI.

Flow:

1. `SuccessRoute` navigates to `/feedback?payment=<id>` 3 seconds after the
   payment completes (or immediately on email-submit).
2. `FeedbackRoute` renders `StarRating` — 5 tap-targets, ≥ 64 × 64 px each,
   haptic tick on select (graceful on iOS), keyboard-driven radiogroup.
3. Rating 4 or 5 → `GoogleReviewPrompt` with explicit "Ja, dela på Google" /
   "Nej tack" buttons. On consent the client POSTs `/reviews` with
   `consent: true`; when API-006 returns `redirect_url` the browser is
   redirected to Google's own review form (we never post on the guest's
   behalf).
4. Rating 1-3 → `PrivateFeedback` with "Vad kan vi göra bättre?" textarea,
   optional email and phone for staff reply. Consent is hard-coded to
   `false` on this path — the server gates redirect on rating ≥ 4 + consent
   anyway, but we belt-and-brace it client-side.
5. Skip-knapp visible at all times (rating + decision phases); on terminal
   phases (`done` / `already`) a "Klar" button returns the guest to
   `/t/:slug/:tableId`.
6. `ALREADY_SUBMITTED` response (UNIQUE(payment_id) violation raised by
   `submit_review` RPC) renders a polite "Tack, du har redan svarat" instead
   of surfacing the raw error.

API-006's route is not yet implemented (KI-007 precedes API-006 in the
sprint ordering per `briefs/README.md`). The client handles this
gracefully: a `NOT_FOUND` from `POST /reviews` falls back to the
`done` phase ("Tack för att du hörde av dig!") — better than blocking
the guest on infrastructure readiness. When API-006 lands the same UI
will start redirecting to Google on the high-rating + consent path.

## Local verifications

Could not run `pnpm typecheck` / `pnpm lint` in this sandbox —
`registry.npmjs.org` is in the proxy deny-list (no `pnpm` available, no
`node_modules/` present). See `STATUS-SANDBOX-EGRESS-FULL-BLOCK.md`
§ "npm registry block — impact on local verifs" for the compensating
hand-review policy that was applied.

Hand-review covered:

- **All imports resolved.** `@flowpay/ui` exports `Button`, `Input`, `Card`,
  `Stack`, `cn` (see `packages/ui/src/index.ts`). `@flowpay/schemas`
  picks up `./review.js` via the updated barrel in `packages/schemas/src/index.ts`.
  `@tanstack/react-query` v5's `useMutation` + `isPending` API is already
  in use (`apps/guest/src/routes/payment.tsx`, `success.tsx`). `framer-motion`
  `motion` + `useReducedMotion` patterns copy from `success.tsx`.
- **Strict TS.** `verbatimModuleSyntax` + `useImportType` respected: type
  imports use `type` specifier (`KeyboardEvent`, `FormEvent`,
  `ReviewSubmitRequest`, `ReviewSubmitResponse`, `ReviewRating`, etc).
  `ApiError` imported without `type` (used as a class at runtime via
  `instanceof`).
- **`noUncheckedIndexedAccess` safety.** `RATINGS[index]` in `StarRating`
  widens to `(1|2|3|4|5) | undefined`; the component guards with
  `if (!rating) return;` before calling `onChange`. `buttonsRef.current[next]?.focus()`
  uses optional chaining.
- **`noUnusedLocals` / `noUnusedParameters`.** Every hook return and every
  prop referenced in the body. `hasAny` in `PrivateFeedback` used to flip
  submit-button copy.
- **Biome style rules.** `useImportType: error` satisfied. Single quotes,
  semicolons, trailing commas, arrow parens — hand-matched to the existing
  files (`success.tsx`, `payment.tsx`). `organizeImports` may reorder on
  CI but ordering is already alphabetical within each group.
- **Anti-patterns (BRIEF-KI-007).**
  - Skip-knapp synlig — yes, both during `rating` and `decision` phases,
    plus the explicit "Hoppa över" in `PrivateFeedback` and `Nej tack` in
    `GoogleReviewPrompt`.
  - Textarea never pre-filled — `useState('')` in `PrivateFeedback`.
  - Low rating text never sent to Google — client hard-codes `consent: false`
    on that branch; the server double-enforces (API-006 gates on `rating ≥ 4`
    independently).
  - One review per payment — relies on DB-003's UNIQUE(payment_id); client
    maps `ALREADY_SUBMITTED` to a thank-you card.

## Manual steps for Zivar (run locally with network access)

```bash
# 1. Install + local verifs that the sandbox could not run.
pnpm install
pnpm typecheck   # expect: no errors in apps/guest or packages/schemas
pnpm lint        # expect: clean on the new files

# 2. Run the guest PWA against the local API (or against Supabase if
#    API-002..API-004 have been verified end-to-end).
pnpm --filter @flowpay/guest dev

# 3. Walk the three paths manually:
#
#    a. Happy path (rating = 5, consent = yes). If API-006 is NOT yet
#       landed → expect "Tack för att du hörde av dig!" card. If API-006
#       IS landed + the restaurant has a google_place_id → expect a
#       redirect to search.google.com.
#
#    b. Mid path (rating = 5, consent = no). Expect POST /reviews with
#       consent=false and the "Tack …" card. No Google redirect.
#
#    c. Low path (rating = 2, text + email + phone). Expect POST /reviews
#       with consent=false and the fields populated. Verify in Supabase:
#
#         select rating, text, guest_email, guest_phone, google_consent
#         from public.reviews order by created_at desc limit 1;
#
# 4. Duplicate-submit test: refresh the /feedback page after submitting
#    and submit again. Expect the "Tack, du har redan svarat" card.
#
# 5. Accessibility sweep:
#      - Tab into the StarRating radiogroup — arrow-left/right + Home/End
#        should move focus; Enter/Space commits.
#      - VoiceOver / TalkBack announces "X av 5" for each star.
#      - Reduced-motion: macOS System Settings → Accessibility → Display
#        → Reduce motion. No scale-bounce on tap.
```

## Files changed

- **Added:**
  - `packages/schemas/src/review.ts` — review request/response/error schemas.
  - `apps/guest/src/api/reviews.ts` — `submitReview` + `reviewMutationKey`.
  - `apps/guest/src/components/StarRating.tsx` — keyboard + haptic star rating.
  - `apps/guest/src/components/GoogleReviewPrompt.tsx` — rating 4-5 prompt.
  - `apps/guest/src/components/PrivateFeedback.tsx` — rating 1-3 private text.
  - `apps/guest/src/routes/feedback.tsx` — route + phase state machine.
- **Modified:**
  - `packages/schemas/src/index.ts` — `export * from './review.js';`.
  - `apps/guest/src/App.tsx` — register `/t/:slug/:tableId/feedback` route.
  - `NIGHT-RUN.md` — added Prepared entry, bumped total to 20/28.

## Open-for-next-brief

- **API-006** (`apps/api/src/routes/reviews.ts` + migration 010
  `google_place_id`) remains the immediate follow-up. KI-007's client
  exercises the contract defined in `packages/schemas/src/review.ts` —
  the API route only has to call `submit_review`, optionally build the
  `redirect_url`, and return the same response shape.
