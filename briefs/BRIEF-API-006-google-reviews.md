# BRIEF-API-006: Google review deep link service
Thinking: 🟡 Think

## Mål
Generera Google Business Profile review-URL per restaurang. Vid 4-5 stjärnor + consent → redirect gäst dit.

## Kontext
- Vi POSTAR INTE recensioner programmatiskt — bryter Google TOS.
- Vi skickar gästen till Google's egna review-form för restaurangen.
- URL-format: `https://search.google.com/local/writereview?placeid=XXX`
- Restaurangen anger sitt place_id i admin-settings.

## Berörda filer
- `apps/api/src/routes/reviews.ts`
- `packages/db/supabase/migrations/010_google_place_id.sql`

## Steg
1. Migration 010: ALTER TABLE restaurants ADD google_place_id TEXT.
2. routes/reviews.ts:
   - POST /reviews { payment_id, rating, text?, email?, phone?, consent }
   - Anropa submit_review RPC (DB-003)
   - Om rating ≥ 4 OCH consent=true OCH restaurant.google_place_id finns:
     - Returnera `{ review_id, redirect_url: 'https://search.google.com/local/writereview?placeid=' + place_id }`
     - Markera review.published_to_google_at = now() (audit: vi skickade dem dit)
   - Annars: returnera `{ review_id, redirect_url: null }`
3. Frontend (KI-007) använder redirect_url om finns.
4. Commit: `feat(api): google review redirect`.

## Verifiering
- [ ] Hög rating + consent + place_id → returnerar redirect_url.
- [ ] Låg rating → ingen redirect.
- [ ] Hög rating utan consent → ingen redirect.
- [ ] Saknad place_id → ingen redirect (graceful).
- [ ] published_to_google_at sätts vid redirect.

## Anti-patterns
- Försök ALDRIG posta i gästens namn via Google API.
- Spara ALDRIG Google OAuth-tokens utan kryptering (ej relevant här men generellt).

## Kopplingar
Beror på: DB-003.
