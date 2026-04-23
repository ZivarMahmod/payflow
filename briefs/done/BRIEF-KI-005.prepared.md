# BRIEF-KI-005 — Dricks-selector — PREPARED

- **Date:** 2026-04-23T04:12+02:00
- **Commit:** pending-zivar-commit (sandbox cannot reach github.com / registry.npmjs.org / *.supabase.co — see `STATUS-SANDBOX-EGRESS-FULL-BLOCK.md`)
- **Commit message (suggested):** `feat(guest,api,db): tip selector + restaurant tip config`
- **Status:** All files written. Guest PWA renders a `<TipSelector>` between the amount card and the Swish button in `/pay`; it respects `restaurants.default_tip_percent` + `restaurants.tip_options`, hard-caps custom input at 30% of the bill, and survives the expired→retry path without silently resetting to the admin default. API's `/orders/:token` projection is widened to expose the two new columns via `get_order_by_token`, with defensive Zod coercion + safe fallbacks. Awaits Zivar's local `pnpm install && pnpm -w typecheck && pnpm -w lint && pnpm --filter @flowpay/api test`, plus Supabase CLI to push migration `20260423000008_restaurant_tip_config.sql`.
- **Tier:** 🟡 Think — single-screen UX with ledger-adjacent consequences (tip_amount rides into `payments.tip_amount`, which survives the whole reconciliation chain).

## Note on status

`SKIP-CONDITIONS.md` lists KI-005 under "DONE autonomously (mock-first, no egress needed)" — the flow is pure app code against the Supabase client + shared schemas + a backward-compatible RPC change. However, this sandbox session blocks `registry.npmjs.org` and `*.supabase.co`, so I couldn't `pnpm install` to run `pnpm -w typecheck` / `pnpm -w lint`, nor apply migration 008 against the live DB to confirm the RPC's widened shape round-trips. Following the precedent set by KI-002, KI-003, KI-004, and POS-001 earlier tonight, this brief is PREPARED rather than DONE. Once Zivar runs the local verifications, this upgrades to DONE with zero code changes.

## Local verifications

Sandbox has no node_modules and `registry.npmjs.org` returns 403. Code was hand-reviewed against `@flowpay/schemas` (`tipOptionsSchema`, `tipPercentSchema`, `orderRestaurantPublicSchema`, `paymentInitiateRequestSchema.tip_amount`) and `@flowpay/ui` (`Input`, `cn`, `Button`, `Stack`) exports.

- [ ] pnpm install                                  — deferred (no registry access)
- [ ] pnpm -w typecheck                             — deferred
- [ ] pnpm -w lint                                  — deferred
- [ ] pnpm --filter @flowpay/api test               — deferred (2 new test cases added for tip defaults + coercion; existing 6 untouched)
- [ ] supabase db push (migration 008)              — always Zivar-side
- [ ] Real-device tip smoke (iPhone Safari, Android Chrome) — always Zivar-side

## Manual steps for Zivar (run locally with network access)

```bash
# 0. Prereqs: KI-003 PREPARED must be committed, and /orders/:token
#    (API-002) must be live. Nothing else.

# 1. Install dependencies — no new packages in KI-005 itself.
cd <payflow-checkout>
pnpm install

# 2. Typecheck + lint.
pnpm -w typecheck
pnpm -w lint

# 3. Run the API test suite — two new cases were added to
#    apps/api/src/routes/orders.test.ts for the tip-config path:
#      (a) "falls back to safe defaults when tip config is missing"
#      (b) "coerces numeric-as-string tip config and drops malformed entries"
#    Both should pass green; the other six should be untouched.
pnpm --filter @flowpay/api test -- --run

# 4. Apply the DB migration.
cd packages/db
supabase db push
#    → Expect: creates columns `restaurants.default_tip_percent NUMERIC(5,2)`
#      and `restaurants.tip_options JSONB` (defaults: 0, [0,5,10]), adds
#      two CHECKs (range [0, 30], array-shape), then CREATE OR REPLACE on
#      get_order_by_token to expose the two new columns in the projection.
#    → Existing rows get backfilled to the defaults via column DEFAULT —
#      safe for all restaurants currently in the DB.

# 5. Start the API + guest PWA side-by-side.
pnpm --filter @flowpay/api dev      # terminal 1 — port 3001
pnpm --filter @flowpay/guest dev    # terminal 2 — port 5173

# 6. Happy-path tip smoke (admin default = 0).
#    Seed the demo order per BRIEF-API-002.prepared.md §3a, then open:
#      http://127.0.0.1:5173/t/prinsen-sthlm/7?order=tok_demo1234abcd
#    Expected:
#      - "Dricks" heading + 3 buttons [0 %, 5 %, 10 %], "0 %" pre-selected
#        (admin default_tip_percent = 0). "Frivilligt" label visible.
#      - Tap 10 % → "Ny totalsumma" animates +10% (e.g. 487.50 → 536.25).
#      - Tap "Betala med Swish" → POST /payments/initiate fires with
#        tip_amount = 48.75 (NOT 0). Confirm in Network tab.

# 7. Custom-input smoke.
#    - Tap "Eget belopp" → number input appears, focuses.
#    - Type "15" → preview updates to 487.50 + 73.13 = 560.63.
#    - Type "35" → red error "Max 30% av notan (...)". Betala button greys
#      out (aria-invalid=true, and `disabled` on the button).
#    - Delete → empty input reads as 0 tip, Betala re-enables.

# 8. Admin-default variant (requires TA-004 to be landed, or manual SQL):
#    Set one restaurant's default_tip_percent = 10 and tip_options = [0, 7, 12]:
#      UPDATE public.restaurants
#        SET default_tip_percent = 10,
#            tip_options = '[0, 7, 12]'::jsonb
#        WHERE slug = 'prinsen-sthlm';
#    - Reload /pay → buttons show [0 %, 7 %, 12 %], none highlighted
#      (10 is not in the options). Custom mode is pre-filled with "10".
#    - "Ny totalsumma" shows the bill + 10%.
#    - Put default_tip_percent back to 0 and tip_options to [0, 5, 10] when
#      done (or don't — the defaults are admin-configurable now).

# 9. Prefers-reduced-motion smoke (macOS: System Settings → Accessibility →
#    Display → Reduce Motion; Safari respects it).
#    - Switch presets → total changes instantly, no fade/slide. No jank.

# 10. Expired→retry path (KI-005 invariant).
#    - With tip preset set to 10 %, hit Betala. Swish QR appears.
#    - Let the 3-min timer expire → "Tiden gick ut" card.
#    - Tap "Försök igen" → back on /pay. The 10 % preset is STILL highlighted,
#      the tip_amount state is preserved. (This is the reason TipSelector is
#      controlled rather than self-managed — parent owns the value.)
```

## Design review (🟡 self-review)

1. **0 is rendered identically to every other preset.** Same `min-h-[64px]` button, same grid cell, same bold typography; the only visual difference is the secondary label ("Ingen dricks" vs "+X kr"). The admin picks the default; if they picked 0, the 0-button gets `aria-checked=true` and the accent-tinted border. No "pre-check the 10% sneakily" dark pattern — matches anti-pattern #1 in the brief ("Tvinga ALDRIG dricks-val — 0 ska vara synligt och jämställt").

2. **Admin-intent mirroring, not paternalism.** `initialSelection()` is a pure function with three cases: exact-match preset → select it; default is 0 but no 0-preset → fall through to first listed preset (degrade gracefully, warn in code comment that admins SHOULD list 0); otherwise → pre-fill custom mode with the default value. `computeInitialTipAmount()` is exported so the parent route seeds its tip state with the exact same logic TipSelector uses on first paint — no "double-fire on strict-mode effect remount" pitfall.

3. **Custom-input cap = DB-CHECK cap = 30 %.** Both the component's `TIP_CUSTOM_MAX_PERCENT` constant and the migration's CHECK `default_tip_percent BETWEEN 0 AND 30` agree. The component flags over-cap visibly (`aria-invalid`, red inline error) AND clamps the emitted SEK amount defensively to `round2(orderTotal * 0.30)`, AND reports `onInvalidChange(true)` to the parent which disables "Betala med Swish". Three layers — matches anti-pattern #2 ("Förifyll ALDRIG högt — manipulativt"); a hostile admin API or an over-aggressive user input can't sneak a tip past any of them.

4. **Defensive coercion at the API boundary.** supabase-js deserialises NUMERIC(5,2) as a string on older clients, and jsonb elements can also come through as strings. `coerceTipPercent()` and `coerceTipOptions()` in `apps/api/src/routes/orders.ts` accept both shapes, drop NaN/out-of-range elements rather than 502ing, and fall back to the DB default `[0, 5, 10]` / `0` on any malformed input. Two new tests pin both paths.

5. **Never cache /orders/:token.** Unchanged from API-002 — `Cache-Control: no-store` still fires. Tip config mutates less often than bills, but the tip columns ride on the same response, so cache semantics follow the stricter of the two (bill freshness wins).

6. **Rounding rides the ledger rail.** Preset percent × total → `round2()` → NUMERIC(10,2) — matches `payments.tip_amount`'s precision and the existing `round2()` in POS adapters. The server recomputes `amount + tip_amount` when writing the payment row; the API derives nothing from `percent`, only from the literal `tip_amount` the client sends. Client-side float slop cannot drift the audit trail.

7. **Expired→retry preserves tip.** `tipAmount` is owned by `PaymentView`, not `TipSelector`. When `phase` flips to `expired` and the guest taps "Försök igen", `setPhase({ kind: 'select' })` brings back the TipSelector component, which initialises its `selection` from the current `tipAmount` via the same `computeInitialTipAmount` path — so the highlighted preset / custom raw value round-trips cleanly. Zivar: verify in step 10 above.

## Files touched

**New files**
- `packages/db/supabase/migrations/20260423000008_restaurant_tip_config.sql` — adds 2 columns + 2 CHECKs + widens RPC
- `apps/guest/src/components/TipSelector.tsx` — the selector component (controlled, ~430 lines)

**Modified files**
- `packages/schemas/src/order.ts` — adds `tipPercentSchema`, `tipOptionsSchema`, extends `orderRestaurantPublicSchema`
- `apps/api/src/routes/orders.ts` — imports new types, adds defensive coercion, round-trips `defaultTipPercent` + `tipOptions` in the response shape
- `apps/api/src/routes/orders.test.ts` — updates `goodRow()` + happy-path assertion to include tip config, adds 2 new test cases
- `apps/guest/src/routes/payment.tsx` — seeds `tipAmount` from order data, renders `<TipSelector>` between the amount card and `<PaymentMethodSelector>`, passes `tip_amount` into the initiate mutation, blocks Betala while `tipInvalid === true`
- `apps/guest/src/components/PaymentMethodSelector.tsx` — adds a `disabled` prop (separate from `isSubmitting`) so the tip-invalid path doesn't flash "Startar…"

## Frågor till Zivar

1. **Is `tipAmount > orderTotal` ever OK?** Current cap is 30% which is hard; a large party at a fine restaurant might want to tip more flexibly. If you want a relief valve, the simplest path is raising `TIP_CUSTOM_MAX_PERCENT` (and the DB CHECK) rather than removing the cap. Flag if you want to widen to 50%.
2. **Component-test convention.** `apps/guest/` has no `*.test.tsx` files today. I didn't add any for TipSelector to stay consistent — but if you want coverage, `computeInitialTipAmount` and the `__internals` exports are already tests-ready pure functions. Happy to add a Vitest + @testing-library/react pass in a follow-up if you want it for the next UI-heavy brief (KI-006 Stripe).
3. **TA-004 wiring.** The brief says "Restaurangen sätter default + alternativ via admin (TA-004)". TA-004 is still ahead of us in the queue; once it lands, the admin UI writes to the two columns migration 008 just added. No API changes needed — the current SQL fields are the contract.

## Related briefs / cross-refs

- Depends on: **KI-003** (guest payment flow) — PREPARED. The tip selector sits inside the 'select' phase KI-003 defined.
- Enables: **TA-004** (admin tip config screen) — not yet dequeued. Writes to the same columns this migration just added.
- Ledger: `payments.tip_amount` already exists (DB-002 / API-003). This brief adds the INPUT side of that value.

## Rollback plan

If migration 008 applies cleanly but the RPC widening misbehaves on an older supabase-js client:
```sql
-- Revert the RPC to the pre-008 shape (still exists in migration 0005).
-- The two new columns stay (harmless — just unused). Re-run migration
-- 0005_order_by_token_v2.sql's CREATE OR REPLACE fragment manually.
```
If the UX review rejects the selector outright, the guest PWA falls back to the current behaviour by reverting `apps/guest/src/routes/payment.tsx` + deleting `TipSelector.tsx`; no DB or API changes are required to remove the feature (the new columns become silent dead weight).
