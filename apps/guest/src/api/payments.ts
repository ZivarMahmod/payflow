/**
 * Payments API bindings for the guest PWA.
 *
 * Mirrors `packages/schemas/src/payment.ts` — initiate + status poll. Card /
 * Stripe confirm endpoints land with KI-006; keep this file narrow until then.
 *
 * Design notes:
 *  - `initiatePayment` is a one-shot POST. Backend writes an audit-trail
 *    row BEFORE issuing the deep-link, so a failed request never leaves a
 *    half-committed payment. Client just surfaces the ApiError.
 *  - `getPaymentStatus` returns the full `paymentStatusResponseSchema` — we
 *    don't narrow it here because both `payment.tsx` (polling) and
 *    `success.tsx` (kvitto display) need different subsets.
 *  - React Query owns caching. We export a query-key factory so invalidators
 *    in future briefs can match without re-stringing.
 */

import {
  type PaymentInitiateRequest,
  type PaymentInitiateSwishResponse,
  paymentInitiateSwishResponseSchema,
  type PaymentStatusResponse,
  paymentStatusResponseSchema,
} from '@flowpay/schemas';

import { apiGet, apiPost } from './client';

/**
 * POST /payments/initiate
 *
 * Only Swish is wired in MVP. When Stripe lands (KI-006) the response
 * becomes a discriminated union on `method` — at that point replace the
 * Zod schema with a discriminatedUnion and widen this return type.
 */
export async function initiatePayment(
  body: PaymentInitiateRequest,
  signal?: AbortSignal,
): Promise<PaymentInitiateSwishResponse> {
  return apiPost<PaymentInitiateSwishResponse>('/payments/initiate', body, {
    schema: paymentInitiateSwishResponseSchema,
    ...(signal ? { signal } : {}),
  });
}

/**
 * GET /payments/:id/status
 *
 * Called every 2s by `usePaymentStatus` until the response is terminal
 * (completed / failed / expired). 404 from the server is a hard stop —
 * the caller should NOT retry (see hook implementation).
 */
export async function getPaymentStatus(
  paymentId: string,
  signal?: AbortSignal,
): Promise<PaymentStatusResponse> {
  return apiGet<PaymentStatusResponse>(
    `/payments/${encodeURIComponent(paymentId)}/status`,
    {
      schema: paymentStatusResponseSchema,
      ...(signal ? { signal } : {}),
    },
  );
}

/** Cache keys — shared by mutation, poll hook, invalidators. */
export const paymentQueryKey = (paymentId: string) =>
  ['payment', paymentId, 'status'] as const;
export const paymentInitiateKey = (orderToken: string) =>
  ['payment', 'initiate', orderToken] as const;
