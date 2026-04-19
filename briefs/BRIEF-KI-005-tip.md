# BRIEF-KI-005: Dricks-selector
Thinking: 🟡 Think

## Mål
Lägg till dricks-steg i betalningsflödet: 0/5/10%/eget. Default per restaurang.

## Kontext
- Svensk dricks-norm: ofta inget, ibland 5-10%. På bar runda upp.
- Restaurangen sätter default + alternativ via admin (TA-004).

## Berörda filer
- `apps/guest/src/components/TipSelector.tsx`
- `apps/guest/src/routes/payment.tsx` (uppdaterad)
- `packages/db/supabase/migrations/007_restaurant_tip_config.sql`

## Steg
1. Migration 007: ALTER TABLE restaurants ADD default_tip_percent NUMERIC(5,2) DEFAULT 0, tip_options JSONB DEFAULT '[0, 5, 10]'::jsonb.
2. TipSelector.tsx:
   - Stora knappar för options + "Eget belopp"-input.
   - Animerad preview av ny totalsumma (Framer Motion).
   - Default-option pre-selected baserat på restaurant.default_tip_percent.
3. Placera mellan summa-sida och betalningsmetod-val.
4. Skicka tip_amount som del av POST /payments/initiate.
5. Custom-input begränsat till 0-30% av order-total (UX-skydd).
6. Commit: `feat(guest): tip selector`.

## Verifiering
- [ ] Dricks läggs till totalen korrekt.
- [ ] Default matchar restaurant.default_tip_percent.
- [ ] Custom-input avvisar > 30%.
- [ ] Animation smidig.

## Anti-patterns
- Tvinga ALDRIG dricks-val — 0 ska vara synligt och jämställt.
- Förifyll ALDRIG högt — manipulativt.

## Kopplingar
Beror på: KI-003.
