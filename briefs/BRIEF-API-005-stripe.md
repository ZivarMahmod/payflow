# BRIEF-API-005: Stripe Connect-integration (kort)
Thinking: 🔴 Think hard

## Mål
Lägg till Stripe Connect Standard för kort + Apple Pay + Google Pay. Pengarna går direkt till restaurangens Stripe-konto. Vi tar vår fee via application_fee_amount.

## Kontext
- Stripe Connect Standard = restaurangen har eget Stripe-konto, vi initierar charges på deras vägnar.
- application_fee_amount = vår fee, dras automatiskt och betalas till oss.
- Vi rör ALDRIG vid pengarna → undviker FI-tillstånd som betalningsinstitut.
- Onboarding via Stripe Connect Onboarding Link (10 min för restaurangen).

## Berörda filer
- `packages/payments/src/stripe/index.ts`
- `apps/api/src/routes/payments.ts` (uppdaterad)
- `apps/api/src/routes/webhooks/stripe.ts`
- `packages/db/supabase/migrations/008_stripe_integration.sql`

## Steg
1. Skapa Stripe-konto för FlowPay, aktivera Connect.
2. Migration 008:
   - ALTER TABLE restaurants ADD stripe_account_id TEXT, stripe_onboarding_completed BOOL DEFAULT false
   - ALTER TABLE payments ADD stripe_payment_intent_id TEXT
3. packages/payments/src/stripe/index.ts:
   - createOnboardingLink(restaurant_id) → Stripe AccountLink, returnerar URL för restaurang
   - createPaymentIntent({ stripe_account_id, amount, application_fee, metadata }) → returnerar client_secret
4. Uppdatera POST /payments/initiate:
   - Om method='card' → createPaymentIntent, returnera { payment_id, stripe_client_secret }.
   - application_fee_amount = round(amount * 0.008) (vår 0.8%).
5. routes/webhooks/stripe.ts:
   - POST /webhooks/stripe — verifiera signatur.
   - Hantera payment_intent.succeeded → completePayment(payment_id).
   - Hantera payment_intent.payment_failed → markera failed.
6. Restaurang-onboarding-flow: admin-sida (kommer i TA-004) använder createOnboardingLink.
7. Tester med Stripe test-mode.
8. Commit: `feat(payments): stripe connect integration`.

## Verifiering
- [ ] Restaurang kan onboarda via Stripe Connect (test-mode).
- [ ] Test-kort 4242 4242 4242 4242 → payment.status='completed' inom 5s.
- [ ] application_fee dyker upp på vårt Stripe-konto.
- [ ] Webhook-signatur valideras (avvisa förfalskade webhooks).
- [ ] Apple Pay funkar på iOS Safari.

## Anti-patterns
- ALDRIG hantera kortdata själv — Stripe Elements/PaymentElement.
- ALDRIG hoppa över signature verification.
- Spara ALDRIG full PAN — bara last4 om det är användbart.

## Kopplingar
Beror på: API-003, DB-002.

## Rollback
Stäng Stripe Connect, ta bort migration 008.
