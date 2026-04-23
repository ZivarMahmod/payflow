/**
 * @flowpay/qr-pdf — print-ready QR PDF generator for restaurant tables.
 *
 * Consumer: the admin app (BRIEF-TA-005). It calls `generateQrPdf(input)`
 * server-side (in an API route) and streams the resulting bytes as
 * `application/pdf`.
 *
 * Why this lives in a dedicated package rather than inside `apps/admin`:
 *   - Admin-app scaffold (TA-001) is gated on an auth-provider decision
 *     that Zivar hasn't made yet. The substantive PDF logic is
 *     framework-agnostic and should ship regardless — building it here
 *     keeps TA-005 mergeable independently.
 *   - Pure-function core → trivially unit-testable with a stubbed
 *     `QRCode.toBuffer` (hoisted into `url.ts`).
 *
 * Anti-pattern guarantees (from BRIEF-TA-005):
 *   - Generation is SERVER-SIDE ONLY. The qr_token never ships to the
 *     browser. The admin UI POSTs `{ tables: [{id,…}], layout, … }` →
 *     the API route looks up tokens via service-role, then calls this
 *     generator, then streams bytes. Clients see PDF bytes only.
 *   - qr_tokens are stable. This generator never mutates them. The URL
 *     is purely a function of (slug, token). Reprints of the same
 *     table produce identical QRs.
 */

import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
} from 'pdf-lib';

import {
  A4,
  A5,
  a4QuadSlot,
  a5SingleSlot,
  hexToRgb,
  type QrSlot,
} from './layout.js';
import {
  DEFAULT_BRAND_COLOR_HEX,
  QrPdfInputSchema,
  type QrPdfInput,
  type QrPdfTable,
} from './types.js';
import { buildTableUrl, renderQrPng } from './url.js';

export * from './types.js';
export { buildTableUrl } from './url.js';

/**
 * Generate a print-ready PDF for the given restaurant + table list.
 *
 * @returns Uint8Array of PDF bytes. Caller streams / writes to disk.
 * @throws ZodError when `input` fails validation. zod error thrown
 *         eagerly (safeParse+throw) so callers can 400 with the
 *         message.
 */
export async function generateQrPdf(input: QrPdfInput): Promise<Uint8Array> {
  // Validate — callers can pass through untrusted body data.
  const parsed = QrPdfInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`generateQrPdf: invalid input — ${parsed.error.message}`);
  }
  const cfg = parsed.data;

  const brand = hexToRgb(cfg.brandColorHex ?? DEFAULT_BRAND_COLOR_HEX);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`FlowPay QR — ${cfg.restaurantName}`);
  pdf.setSubject('QR codes for table payment');
  pdf.setCreator('FlowPay');
  pdf.setProducer('FlowPay QR Generator');

  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);

  // Embed the logo once (if any) and reuse across pages.
  let logoImage: PDFImage | undefined;
  if (cfg.logoBytes && cfg.logoMimeType) {
    logoImage =
      cfg.logoMimeType === 'image/png'
        ? await pdf.embedPng(cfg.logoBytes)
        : await pdf.embedJpg(cfg.logoBytes);
  }

  if (cfg.layout === 'a5-per-qr') {
    for (const table of cfg.tables) {
      const page = pdf.addPage([A5.width, A5.height]);
      const slot = a5SingleSlot();
      await drawSlot({
        pdf,
        page,
        slot,
        table,
        cfg,
        brand,
        logoImage,
        fontBold,
        fontRegular,
        headerName: cfg.restaurantName,
      });
    }
  } else {
    // a4-4-per-page
    for (let i = 0; i < cfg.tables.length; i += 4) {
      const page = pdf.addPage([A4.width, A4.height]);
      const chunk = cfg.tables.slice(i, i + 4);
      for (let j = 0; j < chunk.length; j += 1) {
        const slot = a4QuadSlot(j as 0 | 1 | 2 | 3);
        const table = chunk[j];
        if (!table) continue; // TS narrowing — shouldn't happen
        await drawSlot({
          pdf,
          page,
          slot,
          table,
          cfg,
          brand,
          logoImage,
          fontBold,
          fontRegular,
          headerName: cfg.restaurantName,
        });
      }
    }
  }

  return pdf.save();
}

// ── internals ─────────────────────────────────────────────────────────

interface DrawSlotArgs {
  pdf: PDFDocument;
  page: PDFPage;
  slot: QrSlot;
  table: QrPdfTable;
  cfg: QrPdfInput;
  brand: { r: number; g: number; b: number };
  logoImage?: PDFImage;
  fontBold: PDFFont;
  fontRegular: PDFFont;
  headerName: string;
}

async function drawSlot(args: DrawSlotArgs): Promise<void> {
  const {
    pdf,
    page,
    slot,
    table,
    cfg,
    brand,
    logoImage,
    fontBold,
    fontRegular,
    headerName,
  } = args;

  // Accent bar across the top of the slot — brand color.
  // Width spans the slot's cell, not the entire page, so the quad
  // layout shows a bar per QR.
  const barHeight = 6;
  const barWidth = slot.qrSize * 1.4;
  page.drawRectangle({
    x: slot.centerX - barWidth / 2,
    y: slot.logoTopY - barHeight,
    width: barWidth,
    height: barHeight,
    color: rgb(brand.r, brand.g, brand.b),
  });

  // Logo or restaurant name at the top.
  if (logoImage) {
    // Scale logo to fit ~60pt tall, center horizontally.
    const maxHeight = 60;
    const scale = maxHeight / logoImage.height;
    const drawWidth = logoImage.width * scale;
    const drawHeight = maxHeight;
    page.drawImage(logoImage, {
      x: slot.centerX - drawWidth / 2,
      y: slot.logoTopY - barHeight - drawHeight - 12,
      width: drawWidth,
      height: drawHeight,
    });
  } else {
    const headerSize = 16;
    const headerWidth = fontBold.widthOfTextAtSize(headerName, headerSize);
    page.drawText(headerName, {
      x: slot.centerX - headerWidth / 2,
      y: slot.logoTopY - barHeight - headerSize - 16,
      size: headerSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
  }

  // Render + embed the QR.
  const url = buildTableUrl(cfg.baseUrl, cfg.restaurantSlug, table.qrToken);
  const pngBytes = await renderQrPng(url);
  const qrImage = await pdf.embedPng(pngBytes);
  page.drawImage(qrImage, {
    x: slot.qrX,
    y: slot.qrY,
    width: slot.qrSize,
    height: slot.qrSize,
  });

  // Table label (bold, centered).
  const labelSize = cfg.layout === 'a5-per-qr' ? 28 : 20;
  const labelText = `Bord ${table.label}`;
  const labelWidth = fontBold.widthOfTextAtSize(labelText, labelSize);
  page.drawText(labelText, {
    x: slot.centerX - labelWidth / 2,
    y: slot.labelBaselineY,
    size: labelSize,
    font: fontBold,
    color: rgb(brand.r, brand.g, brand.b),
  });

  // Caption.
  const captionSize = cfg.layout === 'a5-per-qr' ? 14 : 11;
  const captionWidth = fontRegular.widthOfTextAtSize(cfg.caption, captionSize);
  page.drawText(cfg.caption, {
    x: slot.centerX - captionWidth / 2,
    y: slot.captionBaselineY,
    size: captionSize,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });
}
