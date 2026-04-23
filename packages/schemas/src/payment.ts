/**
 * FlowPay payment schemas — wire shapes for POST/GET /payments/* endpoints.
 *
 * Shared between:
 *   - apps/api        (request parsing + response self-validation)
 *   - apps/guest      (response parsing in KI-003 payment flow)
 *   - apps/admin      (payment-confirm UI, KI-003 fallback)
 *
 * Amounts use DECIMAL SEK (e.g. 42.50) to match orderByTokenResponseSchema
 * and the `payments.amount NUMERIC(10,2)` column. NOT öre — that migration
 * hasn't happened yet; see comment in packages/schemas/src/order.ts.
 *
 * RULES (BRIEF-API-003 anti-patterns):
 *  - NEVER initiate a payment without a `pending` row written first — no
 *    client can assume a deep link was issued without an audit-trail row.
 *  - NEVER trust client-provided status — server is the only writer for
 *    `completed` / `expired`.
 *  - Hand out a 3-minute `expires_at` so the guest UI has a definite
 *    "this is dead, restart" signal.
 */

import { z } from 'zod';

/** Payment methods we currently support. */
export const paymentMethodSchema = z.enum(['swish', 'card']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Lifecycle of a payment row. Mirrors the DB CHECK constraint. */
export const paymentStatusSchema = z.enum([
  'pending',
  'completed',
  'failed',
  'expired',
  'refunded',
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/** Opaque identifier for the payment row — UUID, not the Swish reference. */
export const paymentIdSchema = z.string().uuid();
export type PaymentId = z.infer<typeof paymentIdSchema>;

/** Path param for /payments/:id. Loose UUID so Fastify's routing matches first. */
export const paymentIdParamSchema = z.object({ id: paymentIdSchema });

// ─── POST /payments/initiate ──────────────────────────────────────────────

/**
 * Request body for starting a payment flow. `tip_amount` is optional — a
 * zero tip is implicit when omitted. `amount` is the non-tip portion so we
 * can report tips per-staff later.
 */
export const paymentInitiateRequestSchema = z.object({
  order_token: z.string().min(8).max(256),
  /** Non-tip portion the guest intends to pay. Decimal SEK. */
  amount: z.number().positive().multipleOf(0.01),
  /** Optional tip on top. Defaults to 0. */
  tip_amount: z.number().nonnegative().multipleOf(0.01).default(0),
  method: paymentMethodSchema,
});
export type PaymentInitiateRequest = z.infer<typeof paymentInitiateRequestSchema>;

/**
 * Response for a successful Swish initiation. For `method='swish'` only —
 * card flows (API-005, later) will use a different response shape.
 */
export const paymentInitiateSwishResponseSchema = z.object({
  payment_id: paymentIdSchema,
  method: z.literal('swish'),
  /** `swish://payment?data=...` deep link. Opens Swish app on mobile. */
  swish_url: z.string().startsWith('swish://'),
  /** data:image/png;base64,... (or svg+xml) — scannable QR for another phone. */
  qr_data_url: z.string().startsWith('data:'),
  /** ISO-8601 hard cut-off. Guest UI stops polling past this. */
  expires_at: z.string().datetime(),
  /** Short human-readable reference visible in the Swish app dialog. */
  reference: z.string().min(4).max(32),
});
export type PaymentInitiateSwishResponse = z.infer<typeof paymentInitiateSwishResponseSchema>;

// ─── GET /payments/:id/status ─────────────────────────────────────────────

/**
 * Status-poll response. Minimal shape — clients only need the lifecycle
 * state plus `paid_at` for the receipt-ish UI. No PII or internal ids.
 */
export const paymentStatusResponseSchema = z.object({
  payment_id: paymentIdSchema,
  status: paymentStatusSchema,
  amount: z.number().nonnegative(),
  tip_amount: z.number().nonnegative(),
  method: paymentMethodSchema,
  paid_at: z.string().datetime().nullable(),
  expires_at: z.string().datetime().nullable(),
});
export type PaymentStatusResponse = z.infer<typeof paymentStatusResponseSchema>;

// ─── POST /payments/:id/confirm ───────────────────────────────────────────

/**
 * Service-role-only endpoint. Called by the admin dashboard's "mark as
 * paid" button (MVP fallback until Tink Open Banking auto-confirmation
 * lands) or by the mock-Swish test endpoint when USE_MOCK_SWISH=true.
 *
 * The body is intentionally empty — confirmation is idempotent based on
 * the row id. If body fields are needed later (e.g. actual Swish tx id)
 * they go here; current flow has no such data.
 */
export const paymentConfirmRequestSchema = z.object({
  /** Optional real-world Swish transaction id for audit (future). */
  provider_tx_id: z.string().min(1).max(128).optional(),
});
export type PaymentConfirmRequest = z.infer<typeof paymentConfirmRequestSchema>;

export const paymentConfirmResponseSchema = z.object({
  payment_id: paymentIdSchema,
  status: paymentStatusSchema,
  paid_at: z.string().datetime().nullable(),
  /** TRUE if this confirmation flipped the underlying order to paid. */
  order_marked_paid: z.boolean(),
});
export type PaymentConfirmResponse = z.infer<typeof paymentConfirmResponseSchema>;

// ─── Errors ───────────────────────────────────────────────────────────────

/** Payment-specific error codes surfaced to the client. */
export const paymentErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'ORDER_NOT_FOUND',
  'ORDER_GONE',
  'AMOUNT_MISMATCH',
  'PAYMENT_NOT_FOUND',
  'PAYMENT_EXPIRED',
  'PAYMENT_ALREADY_COMPLETED',
  'METHOD_NOT_SUPPORTED',
  'UPSTREAM_ERROR',
  'UNAUTHORIZED',
  'RATE_LIMITED',
]);
export type PaymentErrorCode = z.infer<typeof paymentErrorCodeSchema>;

export const paymentErrorResponseSchema = z.object({
  error: z.object({
    code: paymentErrorCodeSchema,
    message: z.string().min(1),
  }),
});
export type PaymentErrorResponse = z.infer<typeof paymentErrorResponseSchema>;
