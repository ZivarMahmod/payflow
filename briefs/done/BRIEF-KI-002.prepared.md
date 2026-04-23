# BRIEF-KI-002 — Guest PWA → /orders/:token wiring — PREPARED

- **Date:** 2026-04-23T02:45+02:00
- **Commit:** pending-zivar-commit (sandbox cannot reach github.com / registry.npmjs.org — see `STATUS-SANDBOX-EGRESS-FULL-BLOCK.md`)
- **Status:** Files complete. Guest PWA now fetches the bill from GET /orders/:token via TanStack Query, with premium skeleton + error states and staggered Framer Motion entrance. Awaiting Zivar's local `pnpm -w typecheck && pnpm --filter @flowpay/guest dev`.
- **Tier:** 🟡 Think — first client-server wiring. Care taken on: staleTime, retry-denylist for 404/410/400, skeleton vs spinner, prefers-reduced-motion, sticky CTA avoiding content overlap.

## Local verifications

- [ ] pnpm install         — deferred (no registry access)
- [ ] pnpm -w typecheck    — deferred (hand-reviewed against `@flowpay/schemas` exports)
- [ ] pnpm -w lint         — deferred
- [ ] Visual QA on 3G Fast — deferred (needs running API + Supabase row)

## Manual steps for Zivar (run locally)

```bash
# 0. Make sure apps/api has been started (API-002 prepared).
#    Seed the demo row from BRIEF-API-002.prepared.md §3a.

# 1. Configure the guest PWA's .env.
cp apps/guest/.env.example apps/guest/.env   # defaults to http://localhost:3001

# 2. Install + run.
pnpm install
pnpm -w typecheck
pnpm --filter @flowpay/guest dev
#   → Vite listens on http://127.0.0.1:5173

# 3. Scan the QR flow in the browser.
#    http://127.0.0.1:5173/t/prinsen-sthlm/7?order=tok_demo1234abcd
#    Expected:
#      – Skeleton shimmer appears IMMEDIATELY (no spinner).
#      – Within ~200ms the items fade+slide in staggered (Framer Motion).
#      – Total is rendered large, sticky at the bottom, 3xl tabular-nums.
#      – Header says "Restaurang Prinsen · Bord 7".

# 4. Test the error states.
#    a) API down: stop apps/api, refresh → OrderError with "Något strular hos oss"
#       and a retry button. Click retry with API back up → success.
#    b) Unknown token: /t/prinsen-sthlm/7?order=tok_unknown → 404 → "Notan
#       hittades inte". No retry button (retryable: false).
#    c) Paid bill: update public.orders_cache set status='paid' where ...
#       → 410 → "Notan är redan avslutad". No retry button.
#    d) Malformed token (3 chars): /t/.../?order=abc → Guest short-circuits
#       in useOrderToken (no API call) → "Ogiltig QR-kod".

# 5. Chrome DevTools throttle → "Slow 3G".
#    – Skeleton stays up long enough to see the shimmer; items pop in
#      staggered when data lands. Should feel premium, not janky.

# 6. Cache behaviour.
#    – Blur the tab for >30s, re-focus. React Query refetches silently; no
#      skeleton flash on cache-hit (isFetchedAfterMount toggles the
#      stagger animation off for re-renders).
```

## Design review (🟡 self-review)

1. **API client is a hand-rolled fetch, not ky/axios.** Three reasons: (a) keeps the vendor chunk lean (bundle budget is 200 KB gzip), (b) fetch is universal in our target browsers (iOS 16.4+ / Chrome 103+), (c) a custom `ApiError` + `ApiErrorCode` taxonomy is the whole value-add, and a library would hide the mapping.
2. **Zod-at-the-boundary.** `apiGet` accepts a schema and `safeParse`s the response before returning. If the API ever ships a broken shape, the guest surfaces `code: 'SHAPE'` instead of crashing downstream — and in dev the formatted Zod error hits the console, in prod we swallow it (user data safety).
3. **React Query retry denylist.** 404 / 410 / 400 never retry — they won't fix themselves and retries would waste battery + bill the rate limiter. Anything else retries up to 2 times (inherited from `main.tsx`).
4. **Skeleton, not spinner.** Brief anti-pattern: "INTE spinner > 200ms". The skeleton renders on first byte of `isPending`; shimmer is a 1.4s ease-in-out animation using `@keyframes` (CSS) rather than a React state loop. `prefers-reduced-motion` media query kills the animation and falls back to a static 60%-opacity pulse.
5. **Stagger on first render only.** `isFetchedAfterMount` is false on cache hits — we swap `initial='visible', animate=undefined` so the items don't re-play the entrance when the guest tabs back in. The brief called this out as a verification bullet.
6. **Sticky pay CTA with `env(safe-area-inset-bottom)`.** iOS safe-area padding so the button never clips under the home-indicator. `pb-40` on the scroll container guarantees the last bill row isn't hidden behind it. Gradient fade at the top of the sticky bar tells the eye there's more above.
7. **Canonical name from API, fallback to URL.** Header reads `order.restaurant.name` primarily, `slugFromUrl` only as a fallback. Same for table number. The URL is guest-editable; the API response is authoritative.
8. **`formatAmount` — new decimal SEK formatter.** `formatOre` is kept for the KI-001 fixture path (still referenced? not after this brief, but no harm keeping it). `formatAmount` caches `Intl.NumberFormat` per currency so we don't re-allocate on every item render.
9. **Accessible labels.** Skeleton has `aria-busy="true" aria-live="polite"`. Error uses `role="alert" aria-live="assertive"`. Retry button has `aria-label="Försök hämta nota igen"`. Quiet but screen-reader-friendly.
10. **No polling, no manual invalidation.** Brief anti-patterns both. `refetchOnWindowFocus` + 30s `staleTime` does the right thing on its own.
11. **Cache key.** `['order', token]` via `orderQueryKey()` — exported so KI-003 can invalidate on pay-success without stringly-typed drift.
12. **Error copy is per-code, warmly phrased.** The `COPY` map in `OrderError.tsx` handles all 9 codes with Swedish microcopy. Defaults to FALLBACK if a new code lands without copy — soft-fails instead of rendering `undefined`.

## Avvikelser från briefen

- **Bundle split.** Brief doesn't mention it; I didn't add a new chunk. `framer-motion` and `@tanstack/react-query` are already in their own manualChunks in `vite.config.ts` from KI-001, so the wiring change doesn't move the vendor budget.
- **`VITE_API_URL` required.** Brief step 7 says "add to .env.example" — done. In prod I also added a `console.error` when it's unset (dev silent, prod loud). The app doesn't throw at module-load because a screenshot-perfect error screen is better than a white page.
- **Retry behavior.** Brief says "Error + retry funkar" — I built a first-class retry button that calls `query.refetch()` AND wired `isRetrying={query.isRefetching}` so the button shows "Försöker igen…" while retrying. 404/410 hide the button because retry is meaningless.
- **Stale-time** is inherited from main.tsx (30s). Brief says "staleTime 30s" — matches.
- **Cache-hit animation suppression.** Brief said "Framer Motion-animering kör vid första render, ej vid cache-hit." I solved it via `isFetchedAfterMount` — if React Query served from cache without hitting the network, the initial state is already 'visible', so Framer doesn't transition. Not the only way (AnimatePresence + key would also work) but simpler.
- **Sticky CTA added.** Brief says "Totalsumma sticky bottom" — interpreted as the pay CTA + total pair (guest wants to pay, not just see the total). The total is ALSO rendered inside the Card at the actual bill end, so it's reachable by scroll if the guest wants the context.
- **`BillLine` extracted** to keep the map tidy and avoid re-rendering the container when a line updates (React Query treats the whole array as one update, but splitting components lets future per-line realtime land cleanly).
- **No tests added.** Brief doesn't require them for the guest app; component tests would need jsdom + a router mock + QueryClient wrapper — over-investment at this stage. I'd add them at KI-003 (payment flow) when stakes rise.
- **Removed the KI-001 `DUMMY_ORDER` fixture.** Brief step: "Ta bort dummy." Done. The dummy is no longer referenced; `formatOre` remains in `format.ts` because deleting a pure helper tomorrow is cheaper than re-adding it today if another caller shows up.

## Files changed / added

- `apps/guest/src/api/client.ts` — new. Fetch wrapper with typed `ApiError` + `ApiErrorCode`.
- `apps/guest/src/api/orders.ts` — new. `getOrder(token, signal)` + `orderQueryKey`.
- `apps/guest/src/components/OrderSkeleton.tsx` — new. CSS shimmer, reduced-motion safe.
- `apps/guest/src/components/OrderError.tsx` — new. Per-code copy + retry button.
- `apps/guest/src/routes/order.tsx` — rewritten. useQuery → skeleton / error / bill view with Framer Motion stagger.
- `apps/guest/src/lib/format.ts` — added `formatAmount(amount, currency)` (decimal SEK, cached per-currency formatter).
- `apps/guest/.env.example` — new. Documents `VITE_API_URL`.

## Frågor till Zivar

- **`VITE_API_URL` in prod.** I default dev to `http://localhost:3001` but the prod URL is TBD (Fly.io app name not chosen yet). When you pick it, update the example + your prod env.
- **CTA disabled state.** I kept the pay CTA disabled with `Betalflödet aktiveras i nästa steg (KI-003).` Seemed friendlier than hiding it; the price is the main piece of info and keeping the button shape stable avoids layout-shift when KI-003 lands. OK with that?
- **Sticky total only on scroll?** Right now the sticky bar is always present. On very short bills (1–2 items) the total appears twice (inside the Card + in the CTA button). That's intentional — the CTA needs to name the amount — but if it looks silly at 2 items we could hide the in-Card total until > N items. Parkered for real-device QA.
- **Skeleton uses 3 placeholder rows.** Most restaurants' bills are 4–8 lines; 3 was a compromise between "looks empty" and "looks misleading". Easy to tweak.
