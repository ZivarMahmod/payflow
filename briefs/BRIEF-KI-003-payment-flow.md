# BRIEF-KI-003: Betalningsflöde + success-sida
Thinking: 🔴 Think hard

## Mål
Hela betalningsflödet i gäst-PWA: välj metod (Swish) → visa QR + öppna Swish-knapp → polla status → success-sida.

## Kontext
- Sanningens ögonblick. Friktion här tappar konvertering.
- iOS: "Öppna Swish" måste vara user gesture för deep link att fungera.
- Success-sidan ska KÄNNAS celebratorisk.

## Berörda filer
- `apps/guest/src/routes/payment.tsx`
- `apps/guest/src/routes/success.tsx`
- `apps/guest/src/components/SwishQR.tsx`
- `apps/guest/src/components/PaymentMethodSelector.tsx`
- `apps/guest/src/hooks/usePaymentStatus.ts`
- `apps/guest/src/api/payments.ts`

## Steg
1. Från order-sidan: knapp "Betala" → navigate /t/:slug/:table/pay?order=token.
2. payment.tsx:
   - PaymentMethodSelector — endast Swish i MVP (Stripe i KI-006).
   - Vid Swish-val → POST /payments/initiate.
3. SwishQR.tsx: stor QR (250×250px+) + primary button "Öppna Swish" (deep link, user gesture).
4. usePaymentStatus(payment_id) — pollar GET /payments/:id/status varje 2s, stoppar vid completed/expired.
5. När completed → navigate /success.
6. Vid expired (3 min) → visa "Tiden gick ut" + retry-knapp.
7. success.tsx:
   - Animerad checkmark (scale + fade, Framer Motion)
   - Kvittosummering (belopp, dricks, totalt)
   - Email-input "Vill du ha kvitto på mail?" (skickar till POS:en — vi forwardar bara)
   - Efter 3s eller submit → prompt om feedback (kommer i KI-007)
8. Haptic feedback navigator.vibrate(50) vid success.
9. Commit: `feat(guest): full swish payment flow`.

## Verifiering
- [ ] End-to-end lokalt: skanna → nota → betala → success.
- [ ] Swish deep link öppnar Swish-app på riktig mobil.
- [ ] Polling stoppar vid completed (ingen memory leak — clearInterval).
- [ ] Success-animering 60fps.
- [ ] Timeout-flöde fungerar.

## Anti-patterns
- ALDRIG auto-öppna Swish — kräver user gesture på iOS.
- Polla ALDRIG snabbare än 2s.
- Navigera ALDRIG bort från success utan att visa kvitto.

## Kopplingar
Beror på: KI-002, API-003.
