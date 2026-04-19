# BRIEF-KI-006: Stripe-betalning i gäst-PWA
Thinking: 🟡 Think

## Mål
Lägg till kort/Apple Pay/Google Pay som betalningsmetod i gäst-PWA via Stripe PaymentElement.

## Kontext
- PaymentElement är Stripes drop-in UI som auto-detekterar tillgängliga metoder (kort, Apple Pay, Google Pay) baserat på enhet.
- Vi får client_secret från API och initierar Stripe.js i klienten.

## Berörda filer
- `apps/guest/src/components/StripeCheckout.tsx`
- `apps/guest/src/components/PaymentMethodSelector.tsx` (uppdaterad)
- `apps/guest/src/api/payments.ts` (uppdaterad)

## Steg
1. Installera @stripe/stripe-js + @stripe/react-stripe-js i apps/guest.
2. Lägg till "Kort / Apple Pay" som alternativ i PaymentMethodSelector (tillsammans med Swish).
3. Vid kort-val: POST /payments/initiate { method: 'card' } → få client_secret.
4. StripeCheckout.tsx:
   - Wrappa i Elements-provider med stripePromise.
   - Använd PaymentElement (auto-detekterar Apple Pay/Google Pay).
   - confirmPayment med return_url = success-sidan.
5. Vid Stripe-success: webhook bekräftar → polling KI-003 ser status='completed' → success.
6. Stripe publishable key i .env (publik, OK i klient).
7. Commit: `feat(guest): stripe checkout`.

## Verifiering
- [ ] Test-kort 4242… funkar end-to-end.
- [ ] Apple Pay-knapp syns på iOS Safari (riktig device).
- [ ] Google Pay på Android Chrome.
- [ ] 3DS-flow fungerar (test-kort 4000 0027 6000 3184).
- [ ] Felhantering vid declined card.

## Anti-patterns
- Använd ALDRIG egna kortinputs — alltid Stripe-element.
- Lagra ALDRIG client_secret bortom payment-sessionen.

## Kopplingar
Beror på: KI-003, API-005.
