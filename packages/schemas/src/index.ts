/**
 * FlowPay shared Zod schemas — consumed by guest PWA, admin dashboard, and API.
 *
 * These types are intentionally minimal at this sprint stage. Only what the
 * guest app's dummy-nota view needs (KI-001) + forward-compatible shape for
 * the real `/orders/:token` endpoint (API-002 / KI-002).
 *
 * Rules:
 *  - Amounts are in ÖRE (integer, SEK × 100) — never floats.
 *  - Dates are ISO 8601 strings — parsed once at the edge if a Date is needed.
 *  - All schemas are exported alongside their inferred TS types.
 */

import { z } from 'zod';

/** SEK amount in öre (integer). 12500 = 125,00 kr. */
export const amountOre = z.number().int().nonnegative();

/** A single line item on a restaurant bill. */
export const orderItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceOre: amountOre,
  /** quantity × unitPriceOre, pre-computed by the adapter. */
  totalOre: amountOre,
});
export type OrderItem = z.infer<typeof orderItemSchema>;

/**
 * Opaque POS-order token handed to the guest via QR (`?order=<token>`).
 * Validated but not parsed — POS-adapters own the format.
 */
export const orderTokenSchema = z.string().min(1).max(256);
export type OrderToken = z.infer<typeof orderTokenSchema>;

/** Status of an order as observed via POS adapter. */
export const orderStatusSchema = z.enum(['open', 'paid', 'closed', 'cancelled']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * A restaurant bill view. The guest app reads this shape; the API composes
 * it from the POS-adapter + `orders_cache` row.
 */
export const orderSchema = z.object({
  token: orderTokenSchema,
  tenantSlug: z.string().min(1),
  tableId: z.string().min(1),
  currency: z.literal('SEK'),
  status: orderStatusSchema,
  items: z.array(orderItemSchema).min(1),
  /** Sum of item totals — duplicated for safety; clients MUST NOT trust-compute. */
  subtotalOre: amountOre,
  /** Subtotal + tax/service/tip — the amount to pay. */
  totalOre: amountOre,
  /** Already-paid portion (e.g. after a split) — 0 for a fresh bill. */
  paidOre: amountOre,
  /** ISO-8601 — when the POS last updated this snapshot. */
  updatedAt: z.string().datetime(),
});
export type Order = z.infer<typeof orderSchema>;

/** Handy re-exports so consumers can `import { z } from '@flowpay/schemas'`. */
export { z };
