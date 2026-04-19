# BRIEF-KI-004: Split-flöde (lika/del/items)
Thinking: 🔴 Think hard

## Mål
Splittra notan: lika bland N personer, betala specifik del, eller välj rader. Varje split skapar en separat payment-rad.

## Kontext
- Sundays mest värdefulla feature efter pay-at-table — ökar dricks + konvertering.
- Tre lägen: Equal (N personer), Portion (slider), Items (checkboxar).
- Multipla parallella splits ska fungera (4 personer betalar parallellt).

## Berörda filer
- `apps/guest/src/routes/split.tsx`
- `apps/guest/src/components/SplitModeSelector.tsx`
- `apps/guest/src/components/SplitEqual.tsx`
- `apps/guest/src/components/SplitPortion.tsx`
- `apps/guest/src/components/SplitItems.tsx`
- `apps/api/src/routes/splits.ts`

## Steg
1. Från order-sidan: knappar "Betala allt" | "Splitta".
2. Splitta → SplitModeSelector (Equal / Portion / Items).
3. Equal: input för N (2-10), visa belopp/person. Välj "min del".
4. Portion: slider 50 kr till totalsumma, steg 10 kr. Visa restbelopp.
5. Items: checklist av order_items, totalsumma räknas live.
6. Vid val → POST /splits/:order_token { type, amount, items? }.
7. API skapar pending payment-rad, returnerar payment_id.
8. Fortsätt till payment.tsx (KI-003) med pending payment.
9. Realtime: visa "X kr betalt av Y kr — Z kr kvar" via Supabase Realtime subscription på payments.
10. När SUM(completed payments) === order.total → automatic redirect till success för alla aktiva sessions.
11. Commit: `feat(guest): split payment flow`.

## Verifiering
- [ ] Alla 3 split-lägen funkar.
- [ ] Två gäster betalar parallellt (lika split 2 personer) → båda lyckas.
- [ ] Summa av splits ≤ order.total (kan ej överbetala).
- [ ] Pending split som inte slutförs på 5 min → expirerar.
- [ ] Live-uppdatering syns hos alla parallella sessions.

## Anti-patterns
- Tillåt ALDRIG överbetalning.
- Lås ALDRIG order under split — andra ska kunna starta parallellt.

## Kopplingar
Beror på: KI-003, API-003.
