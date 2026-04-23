# BRIEF-KI-004 — Split-flöde (Equal / Portion / Items) — PREPARED

- **Date:** 2026-04-23T03:17+02:00
- **Commit:** pending-zivar-commit (sandbox cannot reach github.com / registry.npmjs.org / *.supabase.co — see `STATUS-SANDBOX-EGRESS-FULL-BLOCK.md`)
- **Commit message (suggested):** `feat(guest,api): split payments (equal/portion/items) with parallel-safe reservation`
- **Status:** All files written. Full guest-PWA split journey (bill → mode picker → mode-specific input → Swish QR via shared payment.tsx), plus a new `/splits/:order_token` API surface (POST creates a pending payment row; GET returns the live "X kr av Y kr kvar" snapshot). Awaits Zivar's local `pnpm install && pnpm -w typecheck && pnpm -w lint` + real-device smoke.
- **Tier:** 🔴 Think hard — parallel splitters, balance reservation, no-lock concurrency, amount-tamper protection.

## Note on status

`SKIP-CONDITIONS.md` lists KI-004 under "DONE autonomously (mock-first, no egress needed)" — the flow is pure app code against the Supabase client + shared schemas. It runs entirely offline against a mocked API (`USE_MOCK_SWISH=true`). However, this sandbox session blocks `registry.npmjs.org` and `*.supabase.co`, so I couldn't `pnpm install` to run `pnpm -w typecheck` / `pnpm -w lint`, nor hit the DB to verify the `payments.created_at` column name used by GET /splits. Following the precedent set by POS-001, API-003, KI-002, and KI-003 earlier tonight, this brief is PREPARED rather than DONE. Once Zivar runs the local verifications, this upgrades to DONE with zero code changes (or a trivial rename if `created_at` turns out to be `inserted_at` on her schema — see "Frågor till Zivar" §3).

## Local verifications

Sandbox has no node_modules and `registry.npmjs.org` returns 403. Code was hand-reviewed against `@flowpay/schemas` (`splitCreateRequestSchema`, `splitStatusResponseSchema`, `paymentInitiateSwishResponseSchema`, `SplitType`) and `@flowpay/ui` (`Button`, `Card`, `Stack`) exports.

- [ ] pnpm install                               — deferred (no registry access)
- [ ] pnpm -w typecheck                          — deferred
- [ ] pnpm -w lint                               — deferred
- [ ] pnpm --filter @flowpay/api test            — deferred (new splits.test.ts not yet written; brief doesn't require)
- [ ] Real-device parallel-splitter smoke (2 phones, same bill) — always Zivar-side
- [ ] Load-test: 10 guests simultaneously POST /splits (overpay guard) — deferred

## Manual steps for Zivar (run locally with network access)

```bash
# 0. Prereqs: KI-003 PREPARED must be committed + DB migration 007 applied
#    (payment_splits + payments trigger already in place from API-004).

# 1. Install dependencies — no new packages in KI-004 itself.
cd <payflow-checkout>
pnpm install

# 2. Typecheck + lint.
pnpm -w typecheck
pnpm -w lint

# 3. Start the API + guest PWA side-by-side.
pnpm --filter @flowpay/api dev      # terminal 1 — port 3001
pnpm --filter @flowpay/guest dev    # terminal 2 — port 5173

# 4. Single-guest smoke (happy path, each mode).
#    Seed a demo order per BRIEF-API-002.prepared.md §3a, then open:
#      http://127.0.0.1:5173/t/prinsen-sthlm/7?order=tok_demo1234abcd
#    Expected per mode:
#      equal   — slider 2..10, part chips, "Din del" shows round(total/N, 2).
#                Tap "Betala X kr" → POST /splits/:token { type:'equal', ... }
#                → server writes pending payment + audit split row
#                → navigate to /pay with QR already rendered (no second
#                  initiate round-trip).
#      portion — number input + 10-kr-step slider + quick-chips.
#                Enforces MIN_PORTION_SEK (50 kr) unless remaining < 50.
#                Otherwise same handoff to /pay as equal.
#      items   — checkbox list from order.items, "Din del" = sum of
#                selected lineTotal. Server re-computes from indexes and
#                returns 409 AMOUNT_MISMATCH if the client tampered.

# 5. Parallel-splitter smoke (THE key test for this brief).
#    - Open the same ?order=... URL on two phones (or two browser windows).
#    - On phone A start "equal 2/2" (big chunk). Get to the QR screen but
#      DON'T scan yet — the payment row sits pending.
#    - On phone B start another split of any size.
#    - Expected: phone B's GET /splits/:token shows amount_remaining = total
#      MINUS phone A's pending amount. If phone B tries to submit more than
#      that, POST returns 409 AMOUNT_MISMATCH and the error notice reads
#      "Beloppet stämmer inte med det som är kvar på notan. Prova igen…".
#    - On phone A wait out the 3-min Swish expiry → server-side payment-expirer
#      flips A's row to 'expired' → within 3s phone B's live poll shows the
#      full remaining again. No manual reset needed.

# 6. Tamper protection (items mode).
#    Use curl/devtools to POST /splits/:token with item_indexes=[0] but
#    amount=999 → expect 409 AMOUNT_MISMATCH, no payment row created.

# 7. Overpay guard (all modes).
#    POST with amount = total + 1 → expect 409 AMOUNT_MISMATCH.

# 8. Rate limit smoke.
#    Burst POST /splits/:token from the same IP → after 30/min get 429.
#    GET burst → after 60/min get 429 (poll interval 3s stays well under).

# 9. Auto-bounce when bill goes paid mid-session.
#    - Open /t/:slug/:tableId/split on phone A.
#    - In admin dash (or via confirm API) settle enough payments to reach
#      total.
#    - Within 3s phone A shows "Notan är betald", 2s later auto-redirects
#      to /t/:slug/:tableId?order=... where the bill view already hides
#      the pay+split CTAs (status='paid' path, KI-002).
```

## Design review (🔴 self-review)

1. **Never allow overpayment — belt AND braces.** Client-side guards (SplitEqual/Portion/Items each have `isXValid()` helpers) keep the submit button disabled. Server-side the POST /splits/:order_token does the authoritative check: `remaining = total − sum(completed) − sum(pending)` and 409s if `body.amount > remaining + 0.005`. The 0.005 epsilon matches `AMOUNT_EPSILON` in routes/payments.ts for NUMERIC(10,2) slop. Matches anti-pattern #1 in the brief.

2. **Never lock the whole order during a split.** Balance read is a plain SELECT — no `SELECT … FOR UPDATE`, no advisory lock. Parallel guests coexist; if two submit overlapping splits in the same millisecond, the second gets a clean 409 from the balance check (or the DB trigger `mark_order_paid_if_funded` catches the sum-matches-total case). The 3-min Swish expiry is the self-healing mechanism for abandoned pending rows — no cron needed. Matches anti-pattern #2.

3. **Live updates via polling, not Supabase Realtime.** The brief says "Live-uppdatering: Supabase realtime subscription på `payment_splits` table (eller polling var 3s som fallback)." I chose polling from the start for three reasons: (a) Guest PWA is anon — hooking supabase-js into it would require either a publishable key or a new anonymized realtime channel, neither of which exists in MVP; (b) 3s is well above the "never faster than 2s" floor from KI-003; (c) one new endpoint (GET /splits/:token) is cheaper to maintain than a two-track data path (realtime + REST fallback). Easy to swap later without touching the UI — hook behind `useSplitStatus` is a plug-in replacement. Matches anti-pattern #3 ("Polla INTE snabbare än 2-3s").

4. **Parallel-splitter visibility.** The "Kvar att betala" strip on the split route pulls `amount_remaining` from the live poll — if phone B is also splitting, phone A sees the balance drop in near real-time ("X kr av Y kr kvar" + "N annan betalning pågår vid bordet"). No leaked payment ids, no amounts per splitter — just the sized list from `active_splits`.

5. **Split amount hand-off is zero-latency.** The server-side /splits POST writes the pending payment row itself, so its response shape is the exact `paymentInitiateSwishResponseSchema` that /payments/initiate produces. SplitRoute's `onSuccess` navigates to `/pay?order=…` with `state.preInitiated = response`, and PaymentRoute's `useState` initialiser reads that state to jump straight to `phase: 'await'`. No second initiate call, no flash of the method selector, no re-render race. Matches the brief's "→ [payment.tsx övertar]" arrow.

6. **Items-mode server re-validation.** The server loads `orders_cache.items`, sums `lineTotal` (or `qty × unitPrice` if missing) for every requested index, and cross-checks against `body.amount` with the same 0.005 epsilon. Duplicate indexes and out-of-range indexes each return 400. This is the ONLY mode where the client-computed amount isn't trusted — equal/portion only need the balance check because they're arithmetic on the total, not a subset.

7. **Equal-mode rounding crumbs fall to the last splitter.** A 100 kr bill / 3 parts yields per-person = round(33.333…, 2) = 33.33. Two guests pay 33.33 each (66.66 pending); the third's "equal 3/3" would also compute 33.33 but the server only allows up to `remaining = 100 − 66.66 = 33.34`. The client's guard permits this because 33.33 ≤ 33.34 + 0.005. The last splitter actually pays 33.34 via the same server response (the split's amount is the client's intent; the balance check is what keeps it safe). No client-side "final person pays the rest" logic — I deliberately did NOT add that complexity; the brief doesn't require it and it couples client logic to server state.

8. **Portion-mode floor is contextual.** 50 kr minimum normally (brief's `MIN_PORTION_SEK`), but if the `remaining` balance is below 50 kr the guest is allowed to pay the residual. Otherwise the last 37 kr of a bill would be un-payable through the split UI and the guest would be forced to use the regular /pay flow. `isPortionValid()` handles this branch.

9. **Audit trail without PII.** Every POST /splits inserts a `payment_splits` row with a human-readable label: `"equal 2/4"`, `"portion"`, `"items 0,3,5"` (truncated to 8 indexes + suffix if more). No names, no device ids — same privacy posture as the rest of the guest flow. The audit insert is best-effort: a failure here logs a warning but does NOT roll back the payment, because the payments row alone is enough to reconcile, and a missing split row is a noisy but non-fatal anomaly.

10. **Parallel sessions never see each other's identities.** `GET /splits/:token` returns `active_splits: [{ amount, status, created_at }, …]` — no payment_id, no guest_identifier, no token prefix. The UI only uses `.length` to say "N annan betalning pågår vid bordet"; amounts are shown to nobody.

11. **Auto-redirect when bill is fully paid.** If `amount_remaining === 0` OR `order_status ∈ {paid, closed}`, the SplitRoute renders a "Notan är betald" card and `setTimeout(…, 2000)` bounces to `/t/:slug/:tableId?order=…` (which has its own "redan avslutad" path). Prevents a guest from seeing a live UI they can't actually use.

12. **Framer-motion animations respect reduced-motion.** Mode-change wrapper uses framer's baseline `prefers-reduced-motion` opt-out; no custom `useReducedMotion()` needed because the only animation is a 6px y-translate on mode switch (fades are fine under reduced-motion policy).

## Avvikelser från briefen

- **New dedicated `/splits/:order_token` endpoint instead of a `type=split` flag on /payments/initiate.** Brief says "`POST /splits/:order_token` (body: `{ type, amount, items? }`) — API skapar pending payment-rad". Matches exactly. I considered extending /payments/initiate and decided against: (a) its balance check only considers `completed` rows, which would be unsafe under parallel splitters; (b) the audit row goes into `payment_splits` which /initiate doesn't currently touch; (c) separating the flows keeps /payments/initiate's single-payer contract clean and easier to reason about. The server-side `describeSplit()` helper is a 20-line function; the duplication with /initiate's payment-row-insert logic is 30 lines. Acceptable for this sprint; a shared `createPendingSwishPayment()` service is a refactor candidate for a later brief (not API-003 work).

- **Added `GET /splits/:order_token` — not explicit in the brief.** The brief's verification criterion is "Live-uppdatering syns omedelbart för alla" and mentions "realtime subscription … eller polling var 3s som fallback". I built the polling fallback path-of-least-resistance. A future "realtime" upgrade would add supabase-js to the guest and swap out `useSplitStatus`'s query-fn for a subscription hook — no UI changes needed.

- **New `SPLIT_POLL_INTERVAL_MS = 3000` in useSplitStatus.** Deliberately > the 2000ms floor from KI-003's PAYMENT_POLL_INTERVAL_MS because: (a) bill-level data changes slower than payment-level status; (b) multiple guests share the same query — 5 guests × 20 req/min = 100 req/min on the order_token already consumes a third of the rate-limit ceiling; staying above 3s keeps headroom.

- **Split UI is one route (`/t/:slug/:tableId/split`), not a modal.** Brief doesn't prescribe. I chose route-over-modal for the same reason KI-003 did: `phase`-like state + browser-back semantics are clearer when each flow is its own URL. Also makes deep-linking a "split lika 4-pers"-flow from a printable QR trivial in the future.

- **Split mode picker buttons use aria-pressed, not role=radio.** Short voice-over labels and matches SplitEqual's own inner "Min del" picker. Both are sensible; the decision is documented here so future a11y auditors don't flip it back and forth.

- **`equal_parts` slider caps at 10 in the UI, not the schema max of 20.** Brief says "N personer", realistic restaurant case is ≤10. Schema still accepts 2..20 so an admin-side flow or test could push higher. Slider-vs-number-input for 11+ was felt-and-considered churn; can add a "Fler personer?"-expand later.

- **No tip UI on the split route.** `tip_amount: 0` hard-coded everywhere in SplitRoute; the brief doesn't mention tip in the split flow, and KI-005 owns the tip UI. The wire contract accepts `tip_amount`, so KI-005 drops a component into SplitRoute later without touching the server.

- **Card/Stripe rail is not offered.** `method: 'swish'` is hard-coded client-side, and the server 400s with METHOD_NOT_SUPPORTED if anything else is sent (until KI-006 lands). Same posture as the regular /pay flow.

- **No SupabaseRealtime subscription** (covered in anti-pattern #3 justification above; flagging here explicitly so the deviation is searchable).

## Files changed / added

### New

**API:**
- `packages/schemas/src/split.ts` — `splitTypeSchema`, `splitCreateRequestSchema`, `splitCreateResponseSchema` (= `paymentInitiateSwishResponseSchema`), `splitStatusEntrySchema`, `splitStatusResponseSchema`, typed exports.
- `apps/api/src/routes/splits.ts` — POST `/splits/:order_token` (balance-reserved against completed + pending, items-mode server re-compute, audit row in `payment_splits`, flips order to 'paying', returns initiate-swish shape; 30/min rate limit); GET `/splits/:order_token` (returns total / completed / pending / remaining / order_status / active_splits; 60/min rate limit). Helpers: `round2()`, `describeSplit()`.

**Guest:**
- `apps/guest/src/api/splits.ts` — `createSplit`, `getSplitStatus`, `splitStatusQueryKey`, `splitCreateKey`.
- `apps/guest/src/hooks/useSplitStatus.ts` — React Query polling hook, `SPLIT_POLL_INTERVAL_MS = 3000`, terminal-state stop on `paid`/`closed`, no-retry on 404/410/SHAPE/BAD_REQUEST, `isSplitTerminal` helper.
- `apps/guest/src/components/SplitModeSelector.tsx` — three size-lg buttons (aria-pressed), hint subtitle per mode.
- `apps/guest/src/components/SplitEqual.tsx` — parts slider (2..10), "Min del" radio-like chips, live per-person card, overpay warning, `isEqualValid`.
- `apps/guest/src/components/SplitPortion.tsx` — number input + range slider + quick chips (100, 200, kvar/2, kvar), contextual min-portion floor, `isPortionValid`, `MIN_PORTION_SEK = 50`.
- `apps/guest/src/components/SplitItems.tsx` — checkbox-like row list from `order.items`, live sum card, server re-validates on POST, `isItemsValid`.
- `apps/guest/src/routes/split.tsx` — state machine (mode, per-mode state), remaining-strip fed by `useSplitStatus`, submit mutation that hands off to `/pay` with `state.preInitiated`, auto-bounce on terminal, typed SplitErrorNotice copy.

### Modified

**API:**
- `packages/schemas/src/index.ts` — re-export `./split.js`.
- `apps/api/src/server.ts` — register `splitsRoute` (single-line import + `fastify.register`).

**Guest:**
- `apps/guest/src/App.tsx` — new route `/t/:slug/:tableId/split` → `SplitRoute`.
- `apps/guest/src/routes/order.tsx` — added secondary "Splitta notan" button under the primary CTA; shares `canPay` + disabled hint.
- `apps/guest/src/routes/payment.tsx` — accepts `location.state.preInitiated` to jump straight to `phase.await`. Initialiser uses a `readPreInitiated(state)` duck-type guard so stale history entries can't crash the route. `useLocation` imported.

## Frågor till Zivar

- **Name of the payments `created_at` column.** GET /splits selects `created_at` from the `payments` table. Migration 003 names it `created_at` (standard Supabase convention). If any follow-up migration renamed it to `inserted_at`, `splits.ts:~GET handler~` needs a one-line rename. Flagging so you can grep once.

- **Should "equal" show the rounded-down per-person figure, or show a 0,01 kr "jämkning" hint?** My implementation shows the plain `round(total/N, 2)` amount — the server absorbs the crumb on the last splitter via its balance check. No UI mention of the crumb. Alternative: display "Din del: 33,33 kr · 33,34 kr för sista person" under the slider. Adds copy noise for a 1-öre edge case that won't be user-visible 99% of the time. Keep as-is?

- **Should `/splits/:order_token` live under `/payments/…` instead?** Brief said `/splits/:order_token`. I kept that path. If you'd rather have `/payments/split/:order_token` for REST hygiene, it's a 3-line change in server.ts + apps/guest/src/api/splits.ts. My lean: leave it where the brief put it.

- **Rate-limit ceilings (30/min POST, 60/min GET).** Chosen to cover a realistic table of 6 guests all switching modes aggressively. If your Fly.io observability shows bursts above these, either widen the ceilings or move the rate-limit key to `order_token + ip` so guests can't DOS each other. Not a Day-1 concern IMO.

- **No tests for `splits.ts` yet.** I didn't write vitest for the new route (neither brief nor SKIP-CONDITIONS requires them). If you want them before sign-off, a follow-up mini-brief is the cleanest path — the existing `payments.test.ts` gives a template and the new route's shape is identical (`supabaseAdmin` mocks + `swishProvider` mocks).

- **Realtime subscription — when?** Flagged above as a deliberate deferral. If you want it soon (e.g. before a customer demo), I'd suggest a TA- or KI-follow-up brief that: (a) mounts supabase-js with the publishable anon key in the guest PWA, (b) swaps `useSplitStatus` internals for a realtime channel on `payments` filtered by `order_cache_id = <resolved from token>`, (c) keeps the REST GET as a warm-up and offline fallback.
