/**
 * FlowPay order schemas — wire shapes for the public `/orders/:token` endpoint.
 *
 * Two parallel shapes live in this package for historical reasons:
 *
 *   1. `orderSchema` (in ./index.ts) — an öre-integer shape built for the
 *      KI-001 dummy-nota view before we had real POS data. Still used by
 *      the guest PWA's fixture fallback. Do NOT wire it to /orders/:token.
 *
 *   2. `orderByTokenResponseSchema` (THIS FILE) — the real API shape, matching
 *      exactly what the RPC `public.get_order_by_token` returns after shaping
 *      in apps/api/src/routes/orders.ts. Amounts are decimal SEK (NUMERIC(10,2)
 *      in the DB) because the POS adapters speak decimals and the DB stores
 *      decimals. We can converge to öre later (KI-002 will decide), but for
 *      now the API contract mirrors the source of truth.
 *
 * RULES (from BRIEF-API-002 anti-patterns):
 *  - NEVER leak `pos_order_id`, `restaurant_id`, `table_id` UUIDs, or any
 *    POS credentials. The RPC already filters these server-side.
 *  - NEVER return the full restaurant row — only name, slug, logoUrl, swish.
 *  - NEVER cache responses in a CDN — bills mutate continuously mid-meal.
 */

import { z } from 'zod';

/** Tokens handed out via QR + `?order=<token>` are short-lived opaque blobs. */
export const orderTokenParamSchema = z.string().min(8).max(256);
export type OrderTokenParam = z.infer<typeof orderTokenParamSchema>;

/** Status as observed via the POS adapter + cached in `orders_cache`. */
export const orderLiveStatusSchema = z.enum([
  'open', // bill is still being built
  'paying', // a payment is in flight (Swish pending / card auth)
  'paid', // fully paid — no further action
  'closed', // POS closed the bill (walk-out, void, manual override)
]);
export type OrderLiveStatus = z.infer<typeof orderLiveStatusSchema>;

/**
 * A single line on the bill as the guest sees it.
 *
 * `lineTotal` is computed server-side from the POS payload. We return it
 * rather than letting clients trust-compute from `qty × unitPrice`, because
 * POS systems sometimes attach per-line discounts that we need to honour.
 */
export const orderResponseItemSchema = z.object({
  name: z.string().min(1),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
});
export type OrderResponseItem = z.infer<typeof orderResponseItemSchema>;

/**
 * Preset tip percents surfaced by the admin (KI-005 / TA-004).
 *
 * Stored DB-side as a jsonb array. Each element is a non-negative number
 * capped at 30% — the same ceiling the guest's custom-tip input enforces,
 * so we never hand the client a preset it would itself reject. The array
 * MAY be empty (in which case the guest PWA degrades to custom-only), but
 * the application default is `[0, 5, 10]`.
 *
 * Anti-pattern (from BRIEF-KI-005): `0` must always be present and visually
 * equal to the others. That invariant is enforced at the admin UI level —
 * not here — because the schema should stay a pure wire-shape, and admins
 * occasionally need to prune options during a concept change.
 */
export const tipPercentSchema = z.number().nonnegative().max(30);
export const tipOptionsSchema = z.array(tipPercentSchema);
export type TipPercent = z.infer<typeof tipPercentSchema>;
export type TipOptions = z.infer<typeof tipOptionsSchema>;

export const orderRestaurantPublicSchema = z.object({
  name: z.string().min(1),
  /** Slug present for SEO + deep-linking; public info. */
  slug: z.string().min(1),
  logoUrl: z.string().url().nullable(),
  /**
   * Swish number shown to the guest as a "Pay to" reference. Public by
   * nature — it's printed on the shop window — but we still keep it
   * inside the RPC projection so the shape is explicit.
   */
  swishNumber: z.string().nullable(),
  /**
   * Preset tip percent pre-selected when the guest opens /pay. 0 is the
   * "conservative Swedish" default. Admin-editable via TA-004.
   */
  defaultTipPercent: tipPercentSchema,
  /**
   * Preset % buttons shown by TipSelector. The guest PWA renders these in
   * order; the admin owns the ordering.
   */
  tipOptions: tipOptionsSchema,
});
export type OrderRestaurantPublic = z.infer<typeof orderRestaurantPublicSchema>;

export const orderTablePublicSchema = z.object({
  number: z.string().nullable(),
});
export type OrderTablePublic = z.infer<typeof orderTablePublicSchema>;

/**
 * GET /orders/:token response body.
 *
 * Field names use the brief's shape (camelCase), not the SQL column names
 * (snake_case). Mapping happens in apps/api/src/routes/orders.ts.
 */
export const orderByTokenResponseSchema = z.object({
  /** The opaque token itself — lets the client cross-check. */
  id: z.string().min(1),
  total: z.number().nonnegative(),
  currency: z.string().min(3).max(3),
  status: orderLiveStatusSchema,
  items: z.array(orderResponseItemSchema),
  restaurant: orderRestaurantPublicSchema,
  table: orderTablePublicSchema,
  /** ISO-8601 — when the POS last updated this snapshot. */
  updatedAt: z.string().datetime(),
});
export type OrderByTokenResponse = z.infer<typeof orderByTokenResponseSchema>;

/**
 * Raw shape of one item inside the cached `items` jsonb column.
 *
 * The POS adapter writes this (see packages/pos-adapters/src/onslip/mapper.ts)
 * with decimal SEK numbers. We parse defensively at the route boundary because
 * the jsonb column is typed as `unknown` in TS.
 */
export const cachedOrderItemSchema = z.object({
  name: z.string().min(1),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  /** Optional — some adapters include a pre-computed line total. */
  lineTotal: z.number().nonnegative().optional(),
});
export type CachedOrderItem = z.infer<typeof cachedOrderItemSchema>;

/** Returned when the bill is fully paid or closed — guest should not see it. */
export const orderGoneSchema = z.object({
  error: z.object({
    code: z.literal('ORDER_GONE'),
    message: z.string(),
    status: orderLiveStatusSchema,
  }),
});
export type OrderGone = z.infer<typeof orderGoneSchema>;
