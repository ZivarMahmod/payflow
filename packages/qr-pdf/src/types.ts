/**
 * Shared input/option types for the QR-PDF generator.
 *
 * These are re-exported from `./index` so consumers can import a single
 * barrel. We keep them in their own file so Zod schemas in other
 * packages can reference the raw types without pulling in `pdf-lib`.
 */

import { z } from 'zod';

/**
 * Layout modes the generator supports.
 *   - `a5-per-qr`  — one QR per A5 page. Best for posters/tent-cards.
 *   - `a4-4-per-page` — four QRs per A4 page (2×2 grid). Best for
 *     dense sticker sheets. The default for bulk printing.
 */
export const QrLayoutSchema = z.enum(['a5-per-qr', 'a4-4-per-page']);
export type QrLayout = z.infer<typeof QrLayoutSchema>;

/** One table's worth of data — enough to render a QR + caption. */
export const QrPdfTableSchema = z.object({
  /** Table number/label shown under the QR (e.g. "12", "Bar 3", "Takeaway"). */
  label: z.string().min(1).max(40),
  /** The opaque DB token (NOT the restaurant slug). We build the URL from slug + token. */
  qrToken: z.string().min(8).max(128),
});
export type QrPdfTable = z.infer<typeof QrPdfTableSchema>;

/** Everything needed to generate a print-ready PDF for a single restaurant. */
export const QrPdfInputSchema = z.object({
  /** Restaurant slug — part of the URL the QR points to. */
  restaurantSlug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase a-z, 0-9, or -'),
  /** Human-readable name for the header (e.g. "Cafe Bonjour"). */
  restaurantName: z.string().min(1).max(120),
  /**
   * Brand color as hex string. Used for the accent bar + label text.
   * Falls back to FlowPay purple if absent. `#` is optional.
   */
  brandColorHex: z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/)
    .optional(),
  /**
   * Optional PNG/JPEG bytes for the restaurant logo. If present the
   * generator embeds it top-center on each page. If absent we fall
   * back to the restaurant name in bold type.
   */
  logoBytes: z.instanceof(Uint8Array).optional(),
  /** Mime type hint so the generator picks the right embed call. */
  logoMimeType: z.enum(['image/png', 'image/jpeg']).optional(),
  /** Tables to print QRs for. Must be 1..500. */
  tables: z.array(QrPdfTableSchema).min(1).max(500),
  /** Layout choice. Defaults to a4-4-per-page. */
  layout: QrLayoutSchema.default('a4-4-per-page'),
  /**
   * Base URL the QR encodes. The generator appends
   * `/t/<slug>/<qrToken>`. Defaults to `https://flowpay.se`.
   * Overridable so local dev can point at a tunnel.
   */
  baseUrl: z
    .string()
    .url()
    .default('https://flowpay.se'),
  /**
   * "Scan to pay" caption. Swedish by default. Overridable for i18n
   * or when a restaurant wants their own copy.
   */
  caption: z.string().min(1).max(80).default('Skanna för att betala'),
});
export type QrPdfInput = z.infer<typeof QrPdfInputSchema>;

/** Default FlowPay purple — matches packages/ui tokens. */
export const DEFAULT_BRAND_COLOR_HEX = '#6b3fa0';
