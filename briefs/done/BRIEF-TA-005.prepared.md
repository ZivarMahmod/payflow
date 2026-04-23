# BRIEF-TA-005 — QR generator + print PDF — PREPARED

- **Date:** 2026-04-23T08:30+02:00
- **Commit:** pending-zivar-commit
- **Status:** Core PDF library complete as a standalone package.
  Admin-side wiring deferred until TA-001 lands (dashboard shell).

## Summary

Builds the server-side QR-to-PDF generator for BRIEF-TA-005. The brief
lists files under `apps/admin/src/` — but `apps/admin/` doesn't exist
yet (TA-001, the admin shell, is SKIPPED pending Zivar's auth-provider
decision). Putting the substantive work in a shared package instead:

- `packages/qr-pdf/` ← the PDF generator itself, framework-agnostic.

When TA-001 lands, the admin app will import `@flowpay/qr-pdf` and
expose:

1. `apps/admin/src/app/(dashboard)/qr/page.tsx` — multi-select table
   list → POST to the API route.
2. `apps/admin/src/app/api/qr/pdf/route.ts` — reads restaurant +
   tables + tokens via service-role, calls `generateQrPdf`, streams
   bytes as `application/pdf`.

Both are thin wrappers (~20 lines each). The hard logic — QR
encoding, pdf-lib layout, brand theming, multi-page grid — is all in
this package and covered below.

## Files changed

- **Added:**
  - `packages/qr-pdf/package.json` — new workspace package, deps
    `pdf-lib`, `qrcode`, `zod`.
  - `packages/qr-pdf/tsconfig.json` — extends the repo base.
  - `packages/qr-pdf/src/types.ts` — `QrPdfInput`, `QrPdfTable`,
    `QrLayout`, all Zod-validated. Defaults to A4 with 4 QRs/page,
    base URL `https://flowpay.se`, caption "Skanna för att betala",
    brand color `#6b3fa0` (FlowPay purple).
  - `packages/qr-pdf/src/url.ts` — `buildTableUrl(baseUrl, slug,
    token)` + `renderQrPng(url)` using `qrcode` with M-level error
    correction (tolerates paper scuffs).
  - `packages/qr-pdf/src/layout.ts` — pure-math coordinate helpers:
    `A4`, `A5`, `a5SingleSlot()`, `a4QuadSlot(0..3)`, `hexToRgb()`.
  - `packages/qr-pdf/src/index.ts` — `generateQrPdf(input)` — the
    public API. Composes per-slot drawing with optional logo embed
    (PNG or JPEG).

## Local verifications

Could not run `pnpm typecheck` / `pnpm lint` — same egress block as
every prior brief this run. Hand-review in lieu of tool verifs:

- **Package layout matches the repo convention.** `tsconfig.json`
  extends `../../tsconfig.base.json`. `exports` map declares `.` only
  (no subpath yet — consumers use the barrel). `files: ["src"]`
  matches `packages/schemas`, `packages/pos-adapters`, `packages/db`.
- **API safety (anti-pattern coverage).**
  - QR generation runs server-side. The only exported client-safe
    thing is `buildTableUrl` (pure string), which the admin-side UI
    may use for previewing but the token **must** be looked up
    server-side. Documented in the file header.
  - qr_tokens are passed through verbatim; the generator never
    hashes or rotates them. A reprint of the same table yields
    identical bytes (modulo PDF metadata — which pdf-lib stabilises
    when CreationDate/ModDate are not set; current code does NOT
    set them, so byte-reproducibility holds barring pdf-lib internal
    nondeterminism).
  - Zod validation happens eagerly. Invalid input throws before any
    pdf-lib call.
- **Layout correctness.**
  - `a4QuadSlot` uses `col = i % 2`, `row = i < 2 ? 0 : 1`. Reading
    order (top-left → top-right → bottom-left → bottom-right) is
    preserved.
  - pdf-lib's y-up coordinate system is handled — logo anchors at
    `logoTopY - barHeight - drawHeight - 12`, which positions the
    logo *below* the brand bar visually.
  - QR dimension clamped to ≤ 280pt (≈ 9.9 cm) on A5 and ≤ 180pt
    (≈ 6.3 cm) on A4. Prevents overlap at extreme aspect ratios.
- **TS-strict sanity.**
  - `verbatimModuleSyntax` respected — `import type` used for
    `PDFImage`, `PDFFont`, `PDFPage`, `QrPdfInput`, `QrPdfTable`,
    `QrSlot`.
  - `noUncheckedIndexedAccess` — array index `chunk[j]` is narrowed
    with `if (!table) continue;` before use.
  - `exactOptionalPropertyTypes` — `logoImage` is passed through
    only when defined (`embedPng`/`embedJpg` branches).
- **Accessibility / print.**
  - Colors default to FlowPay purple; the Zod regex accepts
    `#RRGGBB` and plain `RRGGBB`.
  - Table labels use bold; caption uses regular. Hierarchy survives
    B&W photocopy.
  - Error correction M is an industry default — trades 15% data
    capacity for decoding tolerance on scuffed prints.

## Known gaps / open-for-next-brief

1. **Admin-app wiring deferred.** Once TA-001 scaffolds
   `apps/admin/`, the page + route handler are 20-line imports of
   `@flowpay/qr-pdf`. Concrete snippets included below so it's a
   mechanical merge rather than design work.
2. **No preview in UI.** The brief's bonus step 5 ("preview i UI
   innan download") needs a PDF renderer in the browser. Two
   options: a) render the first page to canvas via
   `pdfjs-dist`, or b) embed the returned bytes as a `<embed>`/
   `<object>`. Option (b) is zero-code; option (a) is prettier but
   adds ~700 KB. Defer the choice to TA-001's frontend stack decision.
3. **Logo upload path.** The API route that TA-001 eventually builds
   will need to fetch the restaurant's logo from Supabase Storage
   before calling `generateQrPdf`. That's a pure admin-app concern;
   the library takes raw bytes, so storage-layer choices don't leak
   into here.

## Skeleton for the admin-side wiring (unlinked — activates with TA-001)

```ts
// apps/admin/src/app/api/qr/pdf/route.ts
import { generateQrPdf } from '@flowpay/qr-pdf';
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const body = await req.json();
  // body: { restaurantId, tableIds[], layout }
  const supabase = createServiceRoleClient();

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('slug, name, brand_color_hex, logo_path')
    .eq('id', body.restaurantId)
    .single();

  const { data: tables } = await supabase
    .from('tables')
    .select('label, qr_token')
    .in('id', body.tableIds);

  const bytes = await generateQrPdf({
    restaurantSlug: restaurant.slug,
    restaurantName: restaurant.name,
    brandColorHex: restaurant.brand_color_hex,
    tables: tables.map((t) => ({ label: t.label, qrToken: t.qr_token })),
    layout: body.layout ?? 'a4-4-per-page',
  });

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="flowpay-qr-${restaurant.slug}-${new Date().toISOString().slice(0, 10)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
```

## Manual steps for Zivar

```bash
pnpm install                             # pulls pdf-lib + qrcode
pnpm --filter @flowpay/qr-pdf typecheck
pnpm --filter @flowpay/qr-pdf lint

# Smoke-test from a node REPL or script:
cat <<'EOF' > /tmp/qr-test.mjs
import { writeFileSync } from 'node:fs';
import { generateQrPdf } from '@flowpay/qr-pdf';

const bytes = await generateQrPdf({
  restaurantSlug: 'cafe-bonjour',
  restaurantName: 'Café Bonjour',
  tables: [
    { label: '1', qrToken: 'abc123token' },
    { label: '2', qrToken: 'def456token' },
    { label: '3', qrToken: 'ghi789token' },
    { label: '12', qrToken: 'jkl012token' },
    { label: '25', qrToken: 'mno345token' },
  ],
  layout: 'a4-4-per-page',
});
writeFileSync('/tmp/qr.pdf', bytes);
console.log('wrote /tmp/qr.pdf', bytes.byteLength, 'bytes');
EOF
node --experimental-vm-modules /tmp/qr-test.mjs
open /tmp/qr.pdf   # or xdg-open on Linux
```

Verify:

- [ ] PDF opens in Preview/Acrobat without errors.
- [ ] Page 1 shows 4 QR slots with labels "Bord 1", "Bord 2",
      "Bord 3", "Bord 12"; page 2 shows "Bord 25" alone.
- [ ] Each QR scans to `https://flowpay.se/t/cafe-bonjour/<token>`.
- [ ] Brand-color bar renders at the top of each slot.
- [ ] A5 layout produces one big QR per page when
      `layout: 'a5-per-qr'` is passed.
