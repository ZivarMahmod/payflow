# BRIEF-API-003: Swish privat QR + payment-API
Thinking: 🔴 Think hard

## Mål
Implementera Swish-betalning via privat QR-flöde. Generera Swish deep link + QR-data. Klient pollar status. Vi markerar payment completed när bekräftat.

## Kontext
- Swish Handel API kräver bank-avtal (tar tid). MVP: privata QR-flöden.
- Deep link `swish://payment?data=…` öppnar Swish-appen med belopp + meddelande förifyllt.
- Pengarna går DIREKT till restaurangens Swish-konto. Vi ser inte pengaflödet.
- Confirmation-strategier i prio:
  1. Tink Open Banking (poll restaurangens konto) — bygg senare
  2. Manuell knapp i admin (MVP fallback)
  3. Swish Handel webhook — långsiktigt

## Berörda filer
- `apps/api/src/routes/payments.ts`
- `apps/api/src/services/swish.ts`
- `packages/db/supabase/migrations/005_payments_swish.sql`

## Steg
1. Migration 005: ALTER TABLE payments ADD COLUMN swish_reference TEXT, swish_message TEXT, expires_at TIMESTAMPTZ.
2. services/swish.ts:
   - generateSwishUrl({ number, amount, message }) → `swish://payment?data=...`
   - generateSwishQR(payload) → returnerar data-URL med qrcode-paketet
3. routes/payments.ts:
   - POST /payments/initiate { order_token, amount, tip_amount, method }
     - Om method='swish': skapa payment status='pending', expires_at=now()+3min, returnera { payment_id, swish_url, qr_data_url, expires_at }
   - GET /payments/:id/status — returnerar aktuell status
   - POST /payments/:id/confirm (admin-only, service_role) — markerar completed
4. När payment.status → completed:
   - Markera orders_cache.status='paid' om SUM(payments.amount) ≥ order.total
   - Trigga POS-update (kommer i API-004)
5. Cron-jobb: payments med status='pending' och expires_at < now() → status='expired'.
6. Tester med vitest.
7. Commit: `feat(api): swish payment flow`.

## Verifiering
- [ ] Swish-URL öppnar Swish-app (test riktig iPhone + Android).
- [ ] QR-data-URL renderar giltig QR (skanna med kamera).
- [ ] Status-polling returnerar uppdaterad status.
- [ ] 3 min utan confirm → status='expired'.
- [ ] order.status uppdateras endast när SUM matchar.

## Anti-patterns
- Skicka ALDRIG Swish utan pending payment-rad — audit trail.
- Lita ALDRIG på client-state — server of truth.
- Glöm INTE timeout — annars hänger gäst-app.

## Kopplingar
Beror på: DB-002, API-002.

## Rollback
Ta bort routes/payments.ts + services/swish.ts + migration 005.
