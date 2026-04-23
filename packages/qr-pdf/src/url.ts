/**
 * URL construction + QR encoding helpers for the PDF generator.
 *
 * The URL format (from BRIEF-TA-005):
 *   https://flowpay.se/t/<restaurant-slug>/<qr-token>
 *
 * Anti-pattern reminder from the brief:
 *   - qr_tokens are stable per-table identifiers. We MUST NOT include
 *     per-print counters, timestamps, or regen-signatures in the URL —
 *     those would invalidate printed posters. The URL is purely a
 *     function of (slug, token).
 */

import QRCode from 'qrcode';

/** Build the public URL a guest hits when they scan a QR. */
export function buildTableUrl(baseUrl: string, restaurantSlug: string, qrToken: string): string {
  const clean = baseUrl.replace(/\/$/, '');
  // URL-encode token defensively — our DB stores opaque base58, but
  // downstream migrations could loosen that. Slug is constrained by
  // the Zod regex so raw-interpolating is safe.
  return `${clean}/t/${restaurantSlug}/${encodeURIComponent(qrToken)}`;
}

/**
 * Render the QR for one URL as a PNG buffer. We embed the PNG via
 * pdf-lib's `embedPng`. Size (512 × 512 px) is chosen so the embedded
 * image remains crisp when rendered at ~8 cm square on A5.
 */
export async function renderQrPng(url: string): Promise<Uint8Array> {
  const buf = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M', // balanced — tolerates paper scuffs
    type: 'png',
    margin: 1,
    width: 512,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
  // Node's `Buffer` is a Uint8Array subclass — safe cast for pdf-lib.
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
