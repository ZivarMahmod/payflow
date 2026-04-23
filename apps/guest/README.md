# @flowpay/guest

Gäst-PWA — skanna QR, se nota, betala. Editorial design (Vildsvin & Vin-flöde).

## Kör lokalt

```bash
pnpm --filter @flowpay/guest dev
# → http://localhost:5173/t/test-bistro/Bord1?order=bord-1-dev
```

URL-format: `/t/:slug/:tableId?order=<token>`

- `:slug` — restaurangens slug (`restaurants.slug`)
- `:tableId` — visuell etikett, ej databas-uppslag
- `?order=<token>` — opaque-token min 8 tecken, slår upp `orders_cache.order_token`

Utan giltig token visas "Notan hittades inte"-fallback.

## Flödet (9 skärmar)

| Steg | Route | Komponent | Skärm |
|---|---|---|---|
| 1 | `/t/:slug/:tableId` | [WelcomeView](src/components/WelcomeView.tsx) | Välkomst (peach glow) |
| 2 | `/t/:slug/:tableId` | [BillView](src/components/BillView.tsx) | Notan (dotted dividers, moms, total) |
| 3 | `/t/:slug/:tableId/split` | [SplitModeSelector](src/components/SplitModeSelector.tsx) | Lika / Välj rader / Eget belopp |
| 4 | `/t/:slug/:tableId/split` | [SplitItems](src/components/SplitItems.tsx) | Checkbox-lista + DIN DEL dark-summary |
| 5 | `/t/:slug/:tableId/split` | [SplitPortion](src/components/SplitPortion.tsx) | Slider + 1/4–2/3 quick-pills |
| 6 | `/t/:slug/:tableId/pay` | [TipSelector](src/components/TipSelector.tsx) | 2×2 tip-grid + custom amount |
| 7 | `/t/:slug/:tableId/pay` | [SwishQR](src/components/SwishQR.tsx) | QR + F-logga + to/meddelande |
| 8 | `/t/:slug/:tableId/success` | [success.tsx](src/routes/success.tsx) | Mint check, kvitto, email, recension |
| 9 | `/t/:slug/:tableId/feedback` | [GoogleReviewPrompt](src/components/GoogleReviewPrompt.tsx) | Stjärnor + Google Business Profile |

## Bundle-budget

- Mål: **<200 KB gzip** vid MVP, **<100 KB** på sikt.
- Mät: `pnpm --filter @flowpay/guest analyze` (öppnar `stats.html`).
- Tunga deps som **aldrig** hamnar här: `lodash`, `moment`, `axios`,
  `date-fns/locale/*` utöver sv-SE.

## Designregler

- Ingen hårdkodad färg i TSX. Endast tokens från `@flowpay/ui/tokens.css`
  (`bg-paper`, `text-ink`, `bg-accent`, `text-mint`, `bg-shell`, etc.).
- Editorial serif (`font-serif-italic`) för rubriker. Inter för body.
- Touch-targets ≥ 56 px på primary CTAs.
- Inga `user-scalable=no` eller `maximum-scale=1` — bryter zoom på iOS.
- Belopp renderas via `<Amount value={x} />` så "kr"-suffixet får rätt typografi.

## Miljövariabler

`VITE_API_URL` (krävs i dev) — pekar på Fastify-API:t, t.ex. `http://192.168.50.169:3001`.
Se `.env.example`.

## Noter att veta om

- Welcome är ett *state* av OrderRoute (inte egen route). Refresh återställer till welcome.
- Moms-rader använder en heuristik (drick-keywords → 25 %, övrigt → 12 %) tills POS-adaptrar
  pushar `vatRate` per rad. Endast directional, POS äger formell breakdown.
- Kort-betalning är dold bakom en ghost-länk i tip-steget tills Stripe-briefen (API-005) har keys.
