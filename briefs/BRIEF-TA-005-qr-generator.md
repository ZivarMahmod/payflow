# BRIEF-TA-005: QR-generator + print-PDF
Thinking: 🟡 Think

## Mål
Generera print-ready PDF med QR-koder per bord. Restaurangen laddar ner och trycker som klistermärken/skyltar.

## Kontext
- Varje bord får unik qr_token från DB-001.
- QR pekar på flowpay.se/t/{slug}/{table_id}.
- PDF ska innehålla QR + bordsnummer + restaurang-logo + "Skanna för att betala".

## Berörda filer
- `apps/admin/src/app/(dashboard)/qr/page.tsx`
- `apps/admin/src/app/api/qr/pdf/route.ts`
- `apps/admin/src/lib/pdf/qr-pdf.ts`

## Steg
1. /qr/page.tsx:
   - Lista bord per location
   - Multi-select checkboxar
   - "Generera PDF" → POST /api/qr/pdf
2. lib/pdf/qr-pdf.ts:
   - Använd react-pdf eller pdf-lib för PDF-generation.
   - A5-format per QR (en per sida) eller A4 med 4 per sida (val).
   - Layout: restaurang-logo top, stor QR center, bordsnummer under, "Skanna för att betala" text.
   - Custom färg från restaurant.brand_color.
3. /api/qr/pdf route handler — server-side generation, stream som application/pdf.
4. Filnamn: `flowpay-qr-{restaurant-slug}-{date}.pdf`.
5. Bonus: preview i UI innan download (canvas eller embedded PDF-viewer).
6. Commit: `feat(admin): qr generator + pdf`.

## Verifiering
- [ ] PDF genereras med rätt QR-koder.
- [ ] Skanna QR från PDF (printad eller skärm) → går till rätt order-URL.
- [ ] Logo + färg appliceras korrekt.
- [ ] Layout funkar för 1, 4, 25 bord.
- [ ] Print-preview ser bra ut på A5/A4.

## Anti-patterns
- Generera ALDRIG QR i klient — server-side så token aldrig läcker till tredje parts skript.
- Roterar ALDRIG qr_tokens utan eftertanke — alla tryckta skyltar blir ogiltiga.

## Kopplingar
Beror på: TA-001, DB-001.
