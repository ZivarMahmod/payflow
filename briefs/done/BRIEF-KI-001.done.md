# BRIEF-KI-001 — Gäst-PWA skeleton + QR-route — DONE

- **Start:** 2026-04-20T02:40:00+02:00
- **Slut:**  2026-04-20T03:15:00+02:00
- **Commit:** 40ba61df48b93452b36801a37797d511f6a4c8c6
- **Tier:** 🟡 Think

## Verifiering

- [x] **Bundle < 200 KB gzip** — PASS (med marginal).
  `vite build` i sandbox:
  ```
  dist/index.html                 0.81 KB gzip
  dist/assets/index-*.css         2.48 KB gzip
  dist/assets/react-vendor-*.js  17.39 KB gzip
  dist/assets/query-*.js          7.73 KB gzip
  dist/assets/motion-*.js         0.08 KB gzip   (tree-shaken — ingen motion-användning än)
  dist/assets/index-*.js         79.14 KB gzip
  ------------------------------------------
  Totalt                        ~107 KB gzip
  ```
  Budget 200 KB, ~53% använt. Headroom för API-klient, Zustand, QR-scanner senare.

- [x] **Dummy-nota renderas** — PASS (statisk + vite build).
  `apps/guest/src/routes/order.tsx` renderar `DUMMY_ORDER` (4 items, 775,00 kr
  totalt) via `@flowpay/ui` `Card`/`Stack`/`Button`. Formatering via
  `Intl.NumberFormat('sv-SE', { currency: 'SEK' })` i `src/lib/format.ts` —
  öre → "185,00 kr" utan hårdkodad locale-logik.
  Runtime-verifiering på iPhone 13 + desktop skjuts till KI-002 (då vi ändå
  byter till riktig `useQuery`-data och vill verifiera hela flödet samtidigt).

- [x] **Error-state utan `?order`** — PASS.
  `useOrderToken` returnerar `{ status: 'missing' }` när param saknas,
  `{ status: 'invalid' }` om Zod-validering failar. `OrderRoute` renderar
  `NoOrderState` med situationsanpassad copy för respektive fall.

- [~] **Lighthouse Performance ≥ 95** — DEFERRED.
  Kräver körande browser + dev-server. Inget i den här briefen borde
  regredera Lighthouse (ren PWA, inga render-blockande scripts, fonts via
  `system-ui`-fallback tills KI-001-overflow-frågan besvaras i KI-002).
  Körs första gången i KI-002 när vi har riktig data och jag kan starta
  `pnpm --filter @flowpay/guest preview` mot en headless browser.

- [x] **Touch-targets ≥ 56 px** — PASS.
  `@flowpay/ui` `Button`: `size="md"` = 56 px, `size="lg"` = 64 px (båda med
  `min-h-[56px]`/`min-h-[64px]` så iOS safe-area inte krymper dem).
  "Betala hela notan"-knappen använder `size="lg"` + `block`.

## Kvalitetsgrindar

- `tsc --noEmit` i `packages/schemas` → **0 fel**.
- `tsc --noEmit` i `apps/guest` → **0 fel** (efter att `rootDir` togs bort så
  `vite.config.ts` + `tailwind.config.ts` får vara ovanför `src/`).
- `biome lint` i `apps/guest/src` → **0 issues**, 7 filer.
- `biome lint` i `packages/schemas/src` → **0 issues**, 1 fil.
- `vite build` → **0 fel**, 113 moduler transformade på 3.9 s.

## Avvikelser från briefen

1. **Scaffoldade även `packages/schemas`.** Briefen nämner `@flowpay/schemas`
   som workspace-dep i Steg 2, men paketet fanns inte. Jag skapade en minimal
   version (Order / OrderItem / OrderToken-schemas, ~64 rader) eftersom (a)
   `master-doc` listar `packages/schemas` som planerat paket, (b) `apps/guest`
   inte hade kunnat typechecka utan den, (c) API-002 och KI-002 kommer kräva
   exakt dessa schemas. Better att bygga fundamentet en gång korrekt.
   Om du vill att paketet ska scaffoldas separat i egen brief — säg till och
   jag isolerar det i en revert + ny brief.

2. **Lade till `src/routes/not-found.tsx`** (inte i brief-filerna). Utan den
   ger `/` en tom sida. Minimal copy, ingen extra dep.

3. **Lade till `src/lib/format.ts`** (inte i brief-filerna). Extraherat öre →
   SEK-formatering som egen hjälpare så att KI-002/KI-003 inte duplicerar
   Intl-konfig. ~25 rader.

4. **`manualChunks` i `vite.config.ts`** — briefen säger inget om det, men
   att splitta `react-vendor` / `query` / `motion` i egna chunks betyder att
   framtida ändringar av app-koden inte invaliderar CDN-cachen för vendor-JS.
   Noll runtime-overhead, pure build-config.

5. **Tog bort `vitest run` från `test`-scriptet** — ingen `vitest` i deps
   ännu, scriptet hade failat i Turbo-körningar. Läggs tillbaka i samma PR
   som skriver första testet (KI-002 integration eller första ren unit).

## Kodgranskning

Briefen är 🟡 (inte 🔴/⚫), så ingen automatisk `engineering:code-review`
krävdes. Jag gick igenom diffen manuellt — inga `any`, inga hårdkodade
färger, inga `user-scalable=no`, inga tunga deps (ingen lodash, ingen
moment). `zod` + `framer-motion` + `react-query` är vad briefen uttryckligen
specar.

## Frågor till Zivar

**Ingen blocker.** En sak att eventuellt besluta om i KI-002:

- **Inter Variable-källa** (carried over from UI-001). Guest CSS fallbackar
  på `system-ui` tills dess — OK för MVP. Default förslag:
  `@fontsource-variable/inter` som dev-dep i `apps/guest` (minimal gzip,
  offline-safe) när KI-002 landar.

## Filer skapade/ändrade

Skapade:
- `apps/guest/.gitignore`
- `apps/guest/README.md`
- `apps/guest/index.html`
- `apps/guest/package.json`
- `apps/guest/public/icon.svg`
- `apps/guest/public/manifest.json`
- `apps/guest/src/App.tsx`
- `apps/guest/src/hooks/useOrderToken.ts`
- `apps/guest/src/index.css`
- `apps/guest/src/lib/format.ts`
- `apps/guest/src/main.tsx`
- `apps/guest/src/routes/not-found.tsx`
- `apps/guest/src/routes/order.tsx`
- `apps/guest/tailwind.config.ts`
- `apps/guest/tsconfig.json`
- `apps/guest/vite.config.ts`
- `packages/schemas/README.md`
- `packages/schemas/package.json`
- `packages/schemas/src/index.ts`
- `packages/schemas/tsconfig.json`

Ändrade: inga.

## Anteckningar (sandbox)

- Tredje körningen där `/tmp/payflow-git` återkommer med permission-problem.
  Bootade manuellt mot `$HOME/payflow-git` igen (notering i förra statusen
  gällde). `.agent/env.sh` behöver fortfarande uppdateras till `$HOME` — jag
  rör inte skriptet i denna brief men lyfter det ännu en gång i status.
- `pnpm install` vid root fortsätter fallera pga Windows-mountens oförmåga
  att `unlink '_testfile'`. Workaround för typecheck/lint/build: `npm install
  --no-save --no-package-lock` i respektive paketmapp + manuella symlinks för
  workspace-deps (`apps/guest/node_modules/@flowpay/{ui,schemas}` → paketen).
  Alla `node_modules/` är `.gitignore`:ade så ingen stök i committen.
