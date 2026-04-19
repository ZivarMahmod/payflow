# BRIEF-TA-003: Feedback-inkorg + realtime
Thinking: 🟡 Think

## Mål
Lista reviews i realtid. Filter på rating. Push-notifiering vid låg rating. Reply-knapp.

## Kontext
- Restaurangägaren ska se negativ feedback snabbt — mål: svara inom 24h.
- Supabase Realtime ger live updates.

## Berörda filer
- `apps/admin/src/app/(dashboard)/feedback/page.tsx`
- `apps/admin/src/components/ReviewCard.tsx`
- `apps/admin/src/components/ReviewFilters.tsx`
- `apps/admin/src/hooks/useReviews.ts`
- `apps/admin/src/components/ReplyDialog.tsx`

## Steg
1. feedback/page.tsx: lista reviews sorterade created_at desc, paginerad (50 per sida).
2. ReviewFilters: Alla / ≤3 stjärnor / ≥4 stjärnor / Obesvarade.
3. ReviewCard: rating-stjärnor, text, timestamp, betalningsbelopp, payment-link, reply-status.
4. useReviews-hook: useQuery + Supabase Realtime subscription på reviews-tabellen.
5. Vid ny review med rating ≤ 3:
   - Toast-notifikation
   - Browser Push (om permission given)
   - Email till restaurantens notifications-email
6. ReplyDialog: textarea + "Skicka via SMS"-knapp (om guest_phone finns) eller "Skicka via email".
7. Reply uppdaterar review.replied_at + reply_text.
8. Commit: `feat(admin): feedback inbox`.

## Verifiering
- [ ] Reviews visas med rätt data.
- [ ] Realtime: skapa review via gäst-app → syns i admin inom 2s.
- [ ] Filter funkar.
- [ ] Push-notif triggar på låg rating (testa på dev).
- [ ] Reply via SMS skickar (kräver SMS-provider, mocka i MVP).

## Anti-patterns
- Hämta ALDRIG alla reviews — paginera.
- Stäng ALDRIG av subscription vid blur — fliken kan vara öppen.

## Kopplingar
Beror på: TA-001, DB-003.
