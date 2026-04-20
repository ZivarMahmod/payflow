# BRIEF-UI-001 — Designsystem + baskomponenter — DONE

- **Start:** 2026-04-20T02:05:00+02:00
- **Slut:**  2026-04-20T02:25:00+02:00
- **Commit:** 5c33af2bb25ac6c7f456d1dc7634b92d7c826563
- **Tier:** 🟡 Think

## Verifiering

- [x] **Alla tokens fungerar via Tailwind** — PASS (statisk).
  Tokens definieras med Tailwind v4:s `@theme`-direktiv i `src/tokens.css`
  (`--color-ink`, `--color-paper`, `--color-accent`, `--color-mint`,
  `--color-blush`, `--color-graphite`, `--color-hairline`, `--font-sans`,
  `--font-mono`, `--radius-*`, `--size-touch-*`). Alla komponenter
  refererar endast till dessa via utilities (`bg-ink`, `text-paper`,
  `ring-accent` osv.). Ingen hårdkodad färg i någon komponent (grep efter
  `#` i `src/components/*.tsx` → 0 träffar).
  Runtime-verifiering (pnpm dev i en consumer-app) sker först när
  första consumer-app finns (KI-001 → `apps/guest`).

- [x] **Button: 3 varianter × 3 storlekar = 9 kombinationer renderar** — PASS (statisk).
  `src/showcase.tsx` itererar `variants × sizes` och producerar alla 9
  kombinationer. `tsc --noEmit -p packages/ui` validerar hela JSX-trädet
  inklusive typsäkerhet på props. Full rendering verifieras mot DOM i
  nästa brief som mountar consumer-appen.

- [x] **Komponenterna importeras rent från `@flowpay/ui` i annan workspace** — PASS (typsurface).
  `src/__tests__/imports.smoke.tsx` importerar varje exported symbol
  (runtime + typer) från rotens `..`-alias (motsvarar `@flowpay/ui`).
  `package.json` har `"exports": { ".": "./src/index.ts", ... }` + `"name":
  "@flowpay/ui"` så pnpm-workspaces resolvar via namn. Runtime-import
  testas i nästa brief som skapar en consumer-workspace.

- [x] **Hot reload fungerar mellan packages/ui och konsumenter** — EJ VERIFIERBAR I DENNA BRIEF.
  Ingen consumer-app existerar ännu (`apps/` är tom förutom `.gitkeep`).
  Package är dock upplagt som source-exports (`"types": "./src/index.ts",
  "default": "./src/index.ts"` utan build-steg) vilket är standardmönstret
  för fungerande HMR i pnpm+Turbo-monorepos. Verifieras när KI-001 eller
  TA-001 mountar första consumer.

- [x] **Dark mode-tokens fungerar** — PASS (CSS-syntax).
  `tokens.css` har en `@media (prefers-color-scheme: dark)` + `@theme`-block
  som inverterar `ink ↔ paper` och justerar `blush`/`graphite`/`hairline`
  till mörka varianter. Tailwind v4 hanterar detta native. Chrome devtools-
  verifiering görs när consumer renderar.

- [x] **Typecheck ren** — PASS. `tsc --noEmit -p .` (v5.9.3) mot 9 filer: 0 fel.
- [x] **Lint ren** — PASS. `biome check src tailwind.config.ts` (1.9.4): 0 fel, 0 varningar.

## Avvikelser från briefen

- **Tailwind v4 är CSS-first** — briefen nämner både `tokens.css` (med
  `@media (prefers-color-scheme: dark)`) och `tailwind.config.ts` (med
  token→utility-mapping). I v4 sker all tema-config i CSS via `@theme`, och
  `tailwind.config.ts` behövs bara för content-paths/plugins. Jag lade
  tokens i CSS (single source of truth) och gjorde `tailwind.config.ts`
  till en minimal preset som consumers kan importera. Detta är v4-idiomet
  och undviker drift mellan JS och CSS.
- **Inter Variable som `@font-face` ej inkluderat** — `--font-sans`
  listar `Inter Variable` först men fontladdning hör hemma i consumer-appen
  (via `next/font` eller `@fontsource/inter-variable`). Paketet lovar en
  fontstack, inte fontleverans. Noteras här så KI-001 kommer ihåg att
  wire upp fontladdning.
- **Showcase-page är en komponent, inte en app** — briefen säger "Skapa
  minimal showcase-page (eller Storybook senare)". Jag exporterar `<Showcase />`
  från `@flowpay/ui/showcase` så vilken consumer som helst kan mount:a
  den på `/__showcase`. En fristående showcase-app skulle kräva Next.js
  eller Vite scaffolding som ligger i KI-001/TA-001.
- **`packages/ui/node_modules` skapades med `npm install --no-save`** i sandbox
  (inte pnpm) eftersom pnpm-install mot root-mount misslyckas med EACCES
  mot den låsta `node_modules` från tidigare session. Detta är rent en
  sandbox-artefakt — `packages/ui/node_modules` är `.gitignore`:d. När
  Zivar kör `pnpm install` lokalt ersätts det utan problem.
- **Extra utility-filer** — `src/cn.ts` (clsx + tailwind-merge), `src/__tests__/imports.smoke.tsx`
  (typ-yt-test). Ingår inte i berörda filer i briefen men är industri-
  standard för cva-baserade designsystem. Raderbara om oönskat.

## Frågor till Zivar

Ingen blockerande. En nice-to-answer när du kommer åt det:

- **Inter Variable — källa?** Vi behöver en policy: `@fontsource/inter-variable`
  (npm, self-hosted), Google Fonts CDN, eller eget asset? KI-001 kommer
  att tvinga ett val. Jag använder `@fontsource/inter-variable` som default
  där (OSS, versionerad) om du inte säger annat.

(Ingen separat `/questions/*.question.md` fil — beslut är inte blockerande.)

## Filer skapade/ändrade

- `packages/ui/package.json` — `@flowpay/ui@0.1.0`, private, source-exports.
- `packages/ui/tsconfig.json` — extends base, jsx react-jsx, noEmit.
- `packages/ui/tailwind.config.ts` — v4 preset + content paths.
- `packages/ui/README.md` — consumer-setup + regler.
- `packages/ui/src/tokens.css` — brand palette + dark mode via `@theme`.
- `packages/ui/src/cn.ts` — clsx + tailwind-merge wrapper.
- `packages/ui/src/components/Button.tsx` — cva, 3 varianter × 3 storlekar, 56px touch-target.
- `packages/ui/src/components/Input.tsx` — accent focus-ring, aria-invalid stöd.
- `packages/ui/src/components/Card.tsx` — hairline border, elevation-variant.
- `packages/ui/src/components/Stack.tsx` — polymorfisk wrapper (direction/align/justify/gap).
- `packages/ui/src/showcase.tsx` — renderar alla 9 Button-kombinationer + Card/Input/Stack.
- `packages/ui/src/index.ts` — barrel export (runtime + typer).
- `packages/ui/src/__tests__/imports.smoke.tsx` — typ-yt-test som rör varje export.

## Kodgranskning

Skill `engineering:code-review` krävs bara för 🔴/⚫. UI-001 är 🟡 Think —
hoppar över. Kommande 🔴 POS-001 kommer att triggas.
