# BRIEF-API-004: Mark-order-paid → POS
Thinking: 🔴 Think hard

## Mål
När payment.status → completed, anropa POS:ens API och markera notan som betald. Detta stänger notan i POS:en precis som om servitören tagit betalt.

## Kontext
- Detta är HALVA produkten. Utan detta vet POS:en inte att betalningen skett, och servitören skulle försöka ta betalt igen.
- Måste vara IDEMPOTENT — om vi anropar två gånger ska POS:en inte panika.
- Måste vara RESILIENT — om POS:ens API är nere ska vi köa retries.

## Berörda filer
- `apps/api/src/services/payment-completion.ts`
- `apps/api/src/services/pos-update-queue.ts`
- `packages/db/supabase/migrations/006_pos_update_queue.sql`

## Steg
1. Migration 006: pos_update_queue-tabell:
   - id, payment_id (fk), restaurant_id, action (text default 'mark_paid'), payload jsonb, attempts int default 0, status (text check in ('pending','processing','done','failed')), last_error text, next_attempt_at timestamptz, created_at, updated_at
2. services/payment-completion.ts:
   - completePayment(payment_id) anropas när Swish/Stripe bekräftar.
   - Updaterar payment.status='completed', paid_at=now().
   - Om SUM(payments.amount) >= orders_cache.total → orders_cache.status='paid'.
   - Skapar pos_update_queue-rad action='mark_paid'.
3. services/pos-update-queue.ts:
   - Worker som varje 5s pollar pending queue-items där next_attempt_at <= now().
   - Hämtar pos_integration för restaurangen.
   - Anropar adapter.markOrderPaid(externalLocationId, externalOrderId, { method, amount, reference: payment.id }).
   - Vid success: status='done'.
   - Vid fel: attempts++, next_attempt_at = now() + exponential backoff (5s, 30s, 2min, 10min, 1h).
   - Efter 5 misslyckade försök: status='failed', notifiera admin via email.
4. Loggning till audit-trail.
5. Tester med mock POS-adapter.
6. Commit: `feat(api): pos update queue`.

## Verifiering
- [ ] Manuell test: completePayment → inom 5s syns notan som betald i Onslip.
- [ ] POS API nere → queue retryar med backoff.
- [ ] Två samtidiga completePayment för samma order → bara EN markOrderPaid mot POS.
- [ ] Failed-status efter 5 misslyckade försök + admin notifierad.
- [ ] Idempotens: kör completePayment två gånger → POS får INTE dubbla anrop.

## Anti-patterns
- Anropa ALDRIG POS direkt från completePayment — alltid via queue (för resilience).
- Glöm INTE idempotens — använd payment.id som reference.
- Lita ALDRIG på att första försöket lyckas.

## Kopplingar
Beror på: API-003, POS-001.

## Rollback
Stoppa worker. Manuellt rensa queue. Rollback migration 006.
