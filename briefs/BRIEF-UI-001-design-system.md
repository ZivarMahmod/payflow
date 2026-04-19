# BRIEF-UI-001: Designsystem + baskomponenter
Thinking: 🟡 Think

## Mål
Skapa `packages/ui` med color tokens, typografi, och baskomponenter (Button, Input, Card, Stack) som används av guest-PWA + admin.

## Kontext
- Premium-känsla. Awwwards-nivå. Ingen "payment company-blue".
- Tailwind v4 med custom tokens.
- shadcn/ui som bas där det passar, men vi överrider styling.
- Font: Inter variabel (free).

## Berörda filer
- `packages/ui/package.json`
- `packages/ui/src/tokens.css`
- `packages/ui/tailwind.config.ts`
- `packages/ui/src/components/Button.tsx`
- `packages/ui/src/components/Input.tsx`
- `packages/ui/src/components/Card.tsx`
- `packages/ui/src/components/Stack.tsx`
- `packages/ui/src/index.ts`

## Steg
1. `pnpm init` i packages/ui.
2. Installera: react, tailwindcss v4, clsx, tailwind-merge, @types/react, class-variance-authority.
3. tokens.css:
   ```css
   :root {
     --flow-ink: #0A0A0A;
     --flow-paper: #FAFAFA;
     --flow-accent: #FF5A1F;
     --flow-mint: #00C08B;
     --flow-blush: #FFE5D9;
     --flow-graphite: #3F3F46;
     --flow-hairline: #E4E4E7;
   }
   @media (prefers-color-scheme: dark) {
     :root {
       --flow-ink: #FAFAFA;
       --flow-paper: #0A0A0A;
       /* … */
     }
   }
   ```
4. tailwind.config.ts: mappa tokens till utilities (bg-ink, bg-paper, text-ink, text-accent osv).
5. Button.tsx med cva: variants `primary` (orange), `secondary` (ink), `ghost`. Sizes: sm, md, lg. Min height 56px på md/lg (touch-targets).
6. Input.tsx: focus-ring i --flow-accent, baseline med tokens.
7. Card.tsx: --flow-paper bakgrund, subtle border via --flow-hairline.
8. Stack.tsx: flex/grid wrapper med gap-prop, direction-prop.
9. Exportera allt från src/index.ts.
10. Skapa minimal showcase-page (eller Storybook senare).
11. Commit: `feat(ui): design tokens + base components`.

## Verifiering
- [ ] Alla tokens fungerar via Tailwind.
- [ ] Button: 3 varianter × 3 storlekar = 9 kombinationer renderar.
- [ ] Komponenterna importeras rent från `@flowpay/ui` i annan workspace.
- [ ] Hot reload fungerar mellan packages/ui och konsumenter.
- [ ] Dark mode-tokens fungerar (testa via Chrome devtools).

## Anti-patterns
- ALDRIG hårdkoda färger — alltid tokens.
- ALDRIG ny komponent per variant — använd cva.
- Importera ALDRIG från relativa paths mellan komponenter.

## Kopplingar
Beror på: IN-001.
