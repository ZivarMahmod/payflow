# @flowpay/guest

Gäst-PWA — skanna QR, se nota, betala. Landar på `/t/:slug/:tableId?order=<token>`.

## Kör lokalt

```bash
pnpm --filter @flowpay/guest dev
# → http://localhost:5173/t/test-bistro/t1?order=abc
```

Utan `?order=` får du fallbacken "Ingen aktiv beställning" — det är med flit.

## Struktur

```
src/
  App.tsx              — router (endast /t/:slug/:tableId i KI-001)
  main.tsx             — React + React Query + BrowserRouter
  index.css            — Tailwind v4 + @flowpay/ui/tokens.css
  hooks/
    useOrderToken.ts   — parsar ?order=… via Zod
  routes/
    order.tsx          — notavy + dummy-data (byts till riktig i KI-002)
    not-found.tsx      — fallback
  lib/
    format.ts          — öre → "185,00 kr"
public/
  manifest.json        — PWA-manifest, theme_color = #FF5A1F
  icon.svg             — orange "F", källa för alla storlekar
```

## Bundle-budget

- Mål: **<200 KB gzip** vid MVP, **<100 KB** på sikt.
- Mät: `pnpm --filter @flowpay/guest analyze` (öppnar `stats.html`).
- Tunga deps som **aldrig** hamnar här: `lodash`, `moment`, `axios`,
  `date-fns/locale/*` utöver sv-SE.

## Designregler

- Ingen hårdkodad färg i TSX. Endast `bg-paper`, `text-ink`, `ring-accent`,
  `h-touch-md` osv. från `@flowpay/ui/tokens.css`.
- Touch-targets ≥ 56 px (`h-touch-md`). Lighthouse straffar mindre.
- Ingen `user-scalable=no` eller `maximum-scale=1` — bryter zoom på iOS.

## Nästa steg

- **KI-002** — byter `DUMMY_ORDER` mot `useQuery(['order', token])` mot `/orders/:token`.
- **KI-003** — lägger in betalflöde + `payments.create`-anrop.
- **KI-004** — split, tips.
