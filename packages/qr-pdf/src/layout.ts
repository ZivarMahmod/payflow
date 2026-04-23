/**
 * PDF layout helpers — pure math, no pdf-lib imports here so the
 * positioning logic can be unit-tested without spinning up a full
 * document.
 *
 * pdf-lib uses a coordinate system where (0, 0) is the *bottom-left*
 * corner and units are points (1 pt = 1/72 inch). All helpers here
 * return points.
 */

/** A4 portrait in points: 595.28 × 841.89. */
export const A4 = { width: 595.28, height: 841.89 } as const;
/** A5 portrait in points: 419.53 × 595.28. */
export const A5 = { width: 419.53, height: 595.28 } as const;

export interface QrSlot {
  /** Bottom-left of the QR square. */
  qrX: number;
  qrY: number;
  /** QR edge length. Rendered square. */
  qrSize: number;
  /** Bottom-left of the label (table number) line, centered around qrX + qrSize/2. */
  labelBaselineY: number;
  /** Bottom-left of the "scan to pay" caption line. */
  captionBaselineY: number;
  /** Top of the page for the logo area's bottom. Logo is centered horizontally. */
  logoTopY: number;
  /** Horizontal center the slot uses for logo + label + caption. */
  centerX: number;
}

/**
 * One A5 page = one QR, big and centered.
 *
 * Composition (top → bottom):
 *   - Logo band (top 15% of page).
 *   - QR square (center, ~45% of page width, i.e. ~13 cm).
 *   - Table label (bold, 2 lines under QR).
 *   - "Skanna för att betala" caption (smaller, below label).
 */
export function a5SingleSlot(): QrSlot {
  const page = A5;
  const qrSize = page.width * 0.55; // ~23 cm printed size? no — 55% of 14.8 cm ≈ 8.1 cm. Clamp below.
  const qrClamped = Math.min(qrSize, 280); // ≈ 9.9 cm
  const centerX = page.width / 2;
  const qrX = centerX - qrClamped / 2;
  // Put QR vertically so logo has room above, labels below.
  const qrY = page.height * 0.32;
  const labelBaselineY = qrY - 36; // 36pt gap below QR
  const captionBaselineY = labelBaselineY - 24; // 24pt below label
  const logoTopY = page.height - 36; // 0.5 inch top margin

  return {
    qrX,
    qrY,
    qrSize: qrClamped,
    labelBaselineY,
    captionBaselineY,
    logoTopY,
    centerX,
  };
}

/**
 * A4 with 4 QRs per page (2×2 grid). Used for bulk sticker sheets.
 *
 * Grid index 0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right.
 * Consistent reading order when the sheet is held portrait.
 */
export function a4QuadSlot(gridIndex: 0 | 1 | 2 | 3): QrSlot {
  const page = A4;
  const cellWidth = page.width / 2;
  const cellHeight = page.height / 2;

  // Top-row cells have y-base at cellHeight; bottom row has y-base at 0.
  const col = gridIndex % 2; // 0 or 1
  const row = gridIndex < 2 ? 0 : 1; // 0 = top, 1 = bottom (in y-down terms)
  const cellX0 = col * cellWidth;
  // pdf-lib is y-up, so top row starts at page.height/2 and goes to page.height.
  const cellY0 = row === 0 ? cellHeight : 0;
  const cellY1 = row === 0 ? page.height : cellHeight;

  // Within the cell: same vertical composition as A5, scaled down.
  const qrSize = Math.min(cellWidth * 0.6, 180); // ≈ 6.3 cm
  const centerX = cellX0 + cellWidth / 2;
  const qrX = centerX - qrSize / 2;
  // Cell midline-ish, slightly lower so logo band fits above.
  const qrY = cellY0 + cellHeight * 0.3;
  const labelBaselineY = qrY - 22;
  const captionBaselineY = labelBaselineY - 16;
  // Logo sits ~24pt below the cell's top edge.
  const logoTopY = cellY1 - 24;

  return {
    qrX,
    qrY,
    qrSize,
    labelBaselineY,
    captionBaselineY,
    logoTopY,
    centerX,
  };
}

/** Hex `#RRGGBB` or `RRGGBB` → normalised `{r,g,b}` in 0..1. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color "${hex}" — expected #RRGGBB.`);
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return { r, g, b };
}
