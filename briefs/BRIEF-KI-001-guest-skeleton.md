# BRIEF-KI-001: Gäst-PWA skeleton + QR-route
Thinking: 🟡 Think

## Mål
Skapa apps/guest — Vite + React 19 + Tailwind. Routing /t/:slug/:tableId. Läs order-token från query string. Dummy-nota först.

## Kontext
- Gäst-appen är MEST kritisk för prestanda. Bundle <100KB gzip vid MVP.
- Ingen auth, ingen installation. Ren PWA.
- Senare briefs lägger till API-calls och betalning.

## Berörda filer
- `apps/guest/package.json`
- `apps/guest/vite.config.ts`
- `apps/guest/index.html`
- `apps/guest/src/main.tsx`
- `apps/guest/src/App.tsx`
- `apps/guest/src/routes/order.tsx`
- `apps/guest/src/hooks/useOrderToken.ts`
- `apps/guest/tailwind.config.ts`
- `apps/guest/public/manifest.json`

## Steg
1. `pnpm create vite apps/guest --template react-ts`.
2. Installera: react 19, react-router-dom 7, @flowpay/ui (workspace), @tanstack/react-query, framer-motion, @flowpay/schemas (workspace).
3. Tailwind v4 setup, extenda packages/ui-tokens.
4. App.tsx: BrowserRouter med rutt /t/:slug/:tableId → OrderRoute.
5. useOrderToken.ts — läser ?order=X från URL.
6. routes/order.tsx:
   - Token saknas → error-state "Ingen aktiv beställning".
   - Token finns → visa dummy-nota (hardcoded items + total).
7. PWA manifest.json: name=FlowPay, theme_color=#FF5A1F, display=standalone, icons.
8. index.html: viewport meta, touch-action: manipulation, theme-color.
9. Smoke-test: `pnpm --filter guest dev` → öppna /t/test-bistro/t1?order=abc → ser dummy.
10. Commit: `feat(guest): PWA skeleton + QR route`.

## Verifiering
- [ ] Bundle < 200KB gzip (mät med vite-bundle-visualizer).
- [ ] Dummy-nota visas på desktop + iPhone 13 (Chrome devtools).
- [ ] Error-state utan ?order.
- [ ] Lighthouse Performance ≥ 95.
- [ ] Touch-targets ≥ 56px.

## Anti-patterns
- ALDRIG tunga deps (lodash, moment).
- INTE useState för server-data — planera för useQuery (kommer i KI-002).
- ALDRIG sätta viewport-scaling — bryter zoom på iOS.

## Kopplingar
Beror på: UI-001.
