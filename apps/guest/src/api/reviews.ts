/**
 * Reviews API bindings for the guest PWA.
 *
 * Mirrors `packages/schemas/src/review.ts` — a single POST /reviews endpoint
 * owned by API-006. In this sprint the API-006 route may not exist yet; the
 * UI (KI-007) must therefore degrade cleanly:
 *
 *   - `submitReview` resolves → caller uses `response.redirect_url`.
 *   - `submitReview` rejects with `ApiError('NOT_FOUND')` → caller treats
 *     it as "feedback received, just thank the guest" (the row can't have
 *     been written yet, but the UX pillar says feedback must be painless
 *     and we never block the guest on infrastructure readiness).
 *
 * Design notes:
 *  - We build a *trimmed* body — the RPC treats empty strings as NULL, but
 *    we avoid sending them on the wire at all so telemetry / server logs
 *    don't fill with noise.
 *  - `consent` defaults to FALSE on the server as well; we send it
 *    explicitly so the intent is never inferred from omission.
 */

import {
  type ReviewSubmitRequest,
  type ReviewSubmitResponse,
  reviewSubmitResponseSchema,
} from '@flowpay/schemas';

import { apiPost } from './client';

/**
 * POST /reviews
 *
 * @param body  — fully-formed submission. Call sites should always set
 *                `consent` explicitly (even to `false`) rather than relying
 *                on the default.
 * @param signal — React Query's abort signal when used via `useMutation`.
 */
export async function submitReview(
  body: ReviewSubmitRequest,
  signal?: AbortSignal,
): Promise<ReviewSubmitResponse> {
  return apiPost<ReviewSubmitResponse>('/reviews', stripEmpty(body), {
    schema: reviewSubmitResponseSchema,
    ...(signal ? { signal } : {}),
  });
}

/**
 * Drop empty-string / undefined optional fields. Keeps the request body
 * minimal and avoids shipping "" for fields the user didn't fill in. The
 * server handles missing keys identically to explicit nulls.
 */
function stripEmpty(body: ReviewSubmitRequest): ReviewSubmitRequest {
  const out: ReviewSubmitRequest = {
    payment_id: body.payment_id,
    rating: body.rating,
    consent: body.consent,
  };
  if (body.text && body.text.trim().length > 0) out.text = body.text.trim();
  if (body.email && body.email.trim().length > 0) out.email = body.email.trim();
  if (body.phone && body.phone.trim().length > 0) out.phone = body.phone.trim();
  return out;
}

/** Stable React Query key — one review per payment, so we key on payment_id. */
export const reviewMutationKey = (paymentId: string) =>
  ['review', paymentId] as const;
