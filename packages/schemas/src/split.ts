/**
 * FlowPay split schemas — wire shapes for POST /splits/:order_token and
 * GET /splits/:order_token.
 *
 * Brief: BRIEF-KI-004 (guest) and the server-side companion route.
 *
 * Split model (mirrors the brief):
 *   - **equal**   — N people, the caller pays 1 portion. Server only cares
 *                   about the resulting amount; `equal_parts` /
 *                   `equal_part_index` are audit metadata.
 *   - **portion** — caller picks an arbitrary SEK amount between the floor
 *                   (MIN_PORTION_SEK) and the remaining balance.
 *   - **items**   — caller selects a subset of order_items (by 0-based
 *                   index into the cached `items[]`). Server re-computes
 *                   the amount from the indexes and rejects if it doesn't
 *                   match what the client sent (within the decimal epsilon).
 *
 * Rules:
 *  - Amount is DECIMAL SEK (NUMERIC(10,2)), matching paymentInitiateRequestSchema.
 *  - Never overpay — server compares against `total - completed - pending`.
 *  - Tip is optional and additive (same as /payments/initiate).
 *  - Response shape on create is the Swish initiate shape — the split route
 *    writes the pending payment row itself, so the guest PWA continues to
 *    the existing payment.tsx flow without a second /initiate round-trip.
 */

import { z } from 'zod';

import {
  paymentInitiateSwishResponseSchema,
  paymentMethodSchema,
  paymentStatusSchema,
} from './payment.js';

/** UI-level split modes. Stored as audit on `payment_splits.guest_identifier`. */
export const splitTypeSchema = z.enum(['equal', 'portion', 'items']);
export type SplitType = z.infer<typeof splitTypeSchema>;

/**
 * Request body for POST /splits/:order_token.
 *
 * `amount` is computed client-side but re-validated server-side against
 * the chosen mode (items must match selected indexes; equal must match
 * `total / equal_parts` within epsilon).
 */
export const splitCreateRequestSchema = z.object({
  type: splitTypeSchema,
  /** Amount the guest intends to pay, excluding tip. Decimal SEK. */
  amount: z.number().positive().multipleOf(0.01),
  /** Optional tip. Defaults to 0 (matches paymentInitiateRequestSchema). */
  tip_amount: z.number().nonnegative().multipleOf(0.01).default(0),
  /** Payment method — only 'swish' is supported until KI-006. */
  method: paymentMethodSchema.default('swish'),
  /** 0-based indexes into orders_cache.items[] when `type === 'items'`. */
  item_indexes: z.array(z.number().int().nonnegative()).optional(),
  /** For `type === 'equal'`: how many people. 2..20 inclusive. Audit-only. */
  equal_parts: z.number().int().min(2).max(20).optional(),
  /** For `type === 'equal'`: 1-based part index the caller claims. Audit. */
  equal_part_index: z.number().int().min(1).max(20).optional(),
});
export type SplitCreateRequest = z.infer<typeof splitCreateRequestSchema>;

/**
 * Create-split response — identical to the Swish-initiate shape so the
 * existing payment.tsx UI can take over without a second round-trip.
 */
export const splitCreateResponseSchema = paymentInitiateSwishResponseSchema;
export type SplitCreateResponse = z.infer<typeof splitCreateResponseSchema>;

/**
 * One entry in the active-splits list the live-update poll returns.
 * Only the coarse fields the split UI needs — no payment ids or PII.
 */
export const splitStatusEntrySchema = z.object({
  amount: z.number().nonnegative(),
  status: paymentStatusSchema,
  created_at: z.string().datetime(),
});
export type SplitStatusEntry = z.infer<typeof splitStatusEntrySchema>;

/**
 * GET /splits/:order_token response — powers the "X kr av Y kr kvar" line
 * plus the auto-redirect when the full bill is covered.
 */
export const splitStatusResponseSchema = z.object({
  order_token: z.string().min(1),
  total: z.number().nonnegative(),
  currency: z.string().min(3).max(3),
  /** Sum of completed payments on this order. */
  amount_completed: z.number().nonnegative(),
  /** Sum of pending (reserved but not yet settled) payments. */
  amount_pending: z.number().nonnegative(),
  /** total − completed − pending, floored at 0. */
  amount_remaining: z.number().nonnegative(),
  /** Lifecycle state from orders_cache — open | paying | paid | closed. */
  order_status: z.enum(['open', 'paying', 'paid', 'closed']),
  /** Active pending splits — sized list only, no payment ids leak out. */
  active_splits: z.array(splitStatusEntrySchema),
});
export type SplitStatusResponse = z.infer<typeof splitStatusResponseSchema>;
