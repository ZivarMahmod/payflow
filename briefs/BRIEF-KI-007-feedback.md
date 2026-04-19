# BRIEF-KI-007: Feedback-flöde efter betalning
Thinking: 🟡 Think

## Mål
Efter success-sidan: rating-prompt. Vid 4-5 → fråga om Google-publicering. Vid 1-3 → privat textruta.

## Kontext
- Det som lyfter FlowPay > bara-pay-at-table.
- Sundays siffra: 67% lämnar feedback i betalflödet vs <5% efter besöket.

## Berörda filer
- `apps/guest/src/routes/feedback.tsx`
- `apps/guest/src/components/StarRating.tsx`
- `apps/guest/src/components/GoogleReviewPrompt.tsx`
- `apps/guest/src/components/PrivateFeedback.tsx`
- `apps/guest/src/api/reviews.ts`

## Steg
1. Efter 3s på success → modal/route /feedback?payment_id=X.
2. StarRating: 5 stora tap-targets (min 64px), haptic feedback per val.
3. Vid 4-5: GoogleReviewPrompt med:
   - "Skulle du dela detta på Google? ⭐"
   - "Ja, dela" → POST /reviews { rating, consent: true } → redirect till Google deep link
   - "Nej tack" → POST /reviews { rating, consent: false }
4. Vid 1-3: PrivateFeedback med:
   - Textarea "Vad kan vi göra bättre?"
   - Optional email + telefon för svar
   - "Skicka" → POST /reviews { rating, text, email, phone, consent: false }
5. Tacka-sida efter submit.
6. Skip-knapp finns alltid.
7. Commit: `feat(guest): feedback flow`.

## Verifiering
- [ ] Rating sparas med rätt restaurant_id (via payment-uppslag).
- [ ] Google deep link öppnar rätt URL för restaurangen (kommer från API-006).
- [ ] Låg rating + text går INTE till Google.
- [ ] Skip funkar utan friktion.
- [ ] Endast en review per payment (försök två → "Tack, du har redan svarat").

## Anti-patterns
- Blockera ALDRIG från att stänga — feedback frivilligt.
- Skicka ALDRIG låg rating till Google.
- Pre-fyll ALDRIG text — gäst ska skriva fritt.

## Kopplingar
Beror på: KI-003, DB-003.
