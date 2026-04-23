/**
 * FlowPay review schemas — wire shapes for guest feedback submission
 * (BRIEF-KI-007) and the Google review redirect service (BRIEF-API-006).
 *
 * Lifecycle recap (the why behind these shapes):
 *
 *   1. Guest lands on /feedback?payment=<id> after a successful payment.
 *   2. They tap 1..5 stars.
 *   3. If rating ≥ 4 they MAY opt in to publishing on Google.
 *   4. If rating ≤ 3 they MAY leave private text + contact details so
 *      staff can reach them. That text is NEVER forwarded to Google.
 *   5. Client POSTs /reviews once. The API calls the `submit_review`
 *      SECURITY DEFINER RPC (DB-003) which validates the payment is
 *      `completed` and enforces UNIQUE(payment_id).
 *   6. API-006 owns the Google deep link. When the response carries a
 *      `redirect_url`, the guest is immediately sent there.
 *
 * RULES (anti-patterns from BRIEF-KI-007 / BRIEF-API-006):
 *  - NEVER mirror free-form text fields when rating ≥ 4 + consent — the
 *    guest writes on Google directly. We only persist the rating for audit.
 *  - NEVER forward low-rating text to Google.
 *  - NEVER trust `consent=true` without also seeing `rating >= 4` — the
 *    server gates the redirect on both independently.
 *
 * This file is the shared contract; the guest PWA and the API both import
 * from it so the request/response shape can never drift.
 */

import { z } from 'zod';

/** 1..5 — enforced by the DB CHECK constraint and on the wire here. */
export const reviewRatingSchema = z.number().int().min(1).max(5);
export type ReviewRating = z.infer<typeof reviewRatingSchema>;

/** Opaque UUID of the reviews row returned by submit_review. */
export const reviewIdSchema = z.string().uuid();
export type ReviewId = z.infer<typeof reviewIdSchema>;

/**
 * Guest submission payload.
 *
 * Semantics of the optional fields:
 *  - `text` is only persisted when rating is 1..3 (private feedback path).
 *    We still allow it through for rating 4..5 in case a future flow wants
 *    to capture it client-side; the server is the authority on what's
 *    stored (see `submit_review` RPC — it takes the raw value and the
 *    UI path decides whether to send it).
 *  - `email` / `phone` are only meaningful on the low-rating path. They
 *    land in `reviews.guest_email` / `reviews.guest_phone` for staff reply.
 *  - `consent` is a boolean explicit opt-in to Google publication. The
 *    API-006 backend gates the redirect on consent AND rating ≥ 4 AND
 *    restaurant.google_place_id being configured.
 */
export const reviewSubmitRequestSchema = z.object({
  payment_id: z.string().uuid(),
  rating: reviewRatingSchema,
  /** Free-form private text. Empty string normalises to null server-side. */
  text: z.string().max(2000).optional(),
  /** Reply email. Lightly validated on the wire; server re-checks. */
  email: z.string().email().max(320).optional(),
  /** Reply phone. Loose on the wire — locale-aware parsing is server-side. */
  phone: z.string().min(3).max(32).optional(),
  /** Explicit opt-in to Google publication. Default FALSE, never inferred. */
  consent: z.boolean().default(false),
});
export type ReviewSubmitRequest = z.infer<typeof reviewSubmitRequestSchema>;

/**
 * API-006 response envelope.
 *
 * `redirect_url` is populated ONLY when:
 *   - rating ≥ 4
 *   - consent === true
 *   - restaurants.google_place_id is set
 *
 * In every other case it is `null`. The frontend must be ready for both —
 * we never force a redirect when the guest said no.
 */
export const reviewSubmitResponseSchema = z.object({
  review_id: reviewIdSchema,
  /** Google Business Profile "write review" deep link, or null. */
  redirect_url: z.string().url().nullable(),
});
export type ReviewSubmitResponse = z.infer<typeof reviewSubmitResponseSchema>;

/**
 * Error codes the API surfaces to the guest PWA. Shared so the client can
 * branch on known-bad states (already-submitted, payment-not-completed)
 * without parsing error messages.
 */
export const reviewErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  /** UNIQUE(payment_id) violated — guest already left a review. */
  'ALREADY_SUBMITTED',
  /** Payment row not found for the given id. */
  'PAYMENT_NOT_FOUND',
  /** Payment exists but isn't `completed` — can't leave a review yet. */
  'PAYMENT_NOT_COMPLETED',
  'UPSTREAM_ERROR',
  'RATE_LIMITED',
]);
export type ReviewErrorCode = z.infer<typeof reviewErrorCodeSchema>;

export const reviewErrorResponseSchema = z.object({
  error: z.object({
    code: reviewErrorCodeSchema,
    message: z.string().min(1),
  }),
});
export type ReviewErrorResponse = z.infer<typeof reviewErrorResponseSchema>;
