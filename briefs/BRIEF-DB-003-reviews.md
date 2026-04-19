# BRIEF-DB-003: Reviews-tabell
Thinking: 🟢 Normal

## Mål
Schema för recensioner: rating, text, samtycke för Google-publicering.

## Kontext
- Reviews kopplade till payment (1:1) — endast den som betalat kan ge review.
- Anonym eller namngiven (gäst kan ange email om de vill ha svar).
- google_consent + published_to_google_at för audit.

## Berörda filer
- `packages/db/supabase/migrations/009_reviews.sql`

## Steg
1. Migration 009 — `reviews`:
   - id (uuid PK)
   - payment_id (fk unique — bara en review per payment)
   - restaurant_id (fk för RLS + denormalisering)
   - rating int (check 1-5 not null)
   - text (text nullable)
   - guest_email (text nullable)
   - guest_phone (text nullable) — för SMS-svar vid låg rating
   - google_consent (bool default false)
   - published_to_google_at (timestamptz nullable)
   - replied_at (timestamptz nullable)
   - reply_text (text nullable)
   - created_at
2. RLS:
   - Anon kan INSERT via RPC (validerad payment_id + status='completed')
   - Staff SELECT inom sin restaurant
   - Staff UPDATE replied_at + reply_text inom sin restaurant
3. RPC submit_review(payment_id_param uuid, rating_param int, text_param text, email_param text, phone_param text, consent_param bool):
   - Validera payment.status='completed'
   - Validera rating 1-5
   - INSERT review
   - RETURN review-id
4. Index: (restaurant_id, created_at desc), (rating, created_at desc)
5. Commit: `feat(db): reviews schema`.

## Verifiering
- [ ] Review skapas via RPC med giltig payment.
- [ ] Försök review utan completed payment → fel.
- [ ] Försök 2 reviews för samma payment → unique violation.
- [ ] Staff ser endast egen restaurants reviews.
- [ ] Rating utanför 1-5 → check violation.

## Anti-patterns
- Tillåt ALDRIG direkt INSERT — alltid via RPC.
- Kasta ALDRIG bort text vid låg rating — värdefull för restaurang.

## Kopplingar
Beror på: DB-002.

## Rollback
Ta bort migration 009.
