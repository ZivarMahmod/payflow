/**
 * Splits API bindings for the guest PWA.
 *
 * Mirrors `packages/schemas/src/split.ts`:
 *  - POST /splits/:order_token  — create one pending split-payment
 *  - GET  /splits/:order_token  — live status (remaining, active pending, order)
 *
 * Design notes:
 *  - `createSplit` returns the SAME shape as `initiatePayment` (a Swish-initiate
 *    response). This lets the existing `payment.tsx` UI pick up from here
 *    without a second round-trip — the server has already written the
 *    pending payment row.
 *  - `getSplitStatus` is polled every ~3s by `useSplitStatus`. It never
 *    leaks payment ids or PII, just the coarse "X kr kvar" figure and a
 *    sized list of active pending splits.
 *  - Errors are normalised via `ApiError` (see `./client`). `splitRoute`
 *    pattern-matches on the code to render 410 / 422 / 429 copy.
 *  - No AbortController wiring here — React Query owns the signal.
 */

import {
  type SplitCreateRequest,
  type SplitCreateResponse,
  splitCreateResponseSchema,
  type SplitStatusResponse,
  splitStatusResponseSchema,
} from '@flowpay/schemas';

import { apiGet, apiPost } from './client';

/**
 * POST /splits/:order_token
 *
 * Server validates the amount against (total − completed − pending) before
 * inserting the payment row. Client-side we only guard the obvious "amount
 * > remaining" up-front so we don't send a request we know will 422.
 */
export async function createSplit(
  orderToken: string,
  body: SplitCreateRequest,
  signal?: AbortSignal,
): Promise<SplitCreateResponse> {
  return apiPost<SplitCreateResponse>(
    `/splits/${encodeURIComponent(orderToken)}`,
    body,
    {
      schema: splitCreateResponseSchema,
      ...(signal ? { signal } : {}),
    },
  );
}

/**
 * GET /splits/:order_token
 *
 * Used by the split route's live "X kr av Y kr kvar" line. Response also
 * tells us when `amount_remaining === 0`, at which point the split UI
 * flips into a "Notan är betald" celebration and auto-bounces to the bill.
 */
export async function getSplitStatus(
  orderToken: string,
  signal?: AbortSignal,
): Promise<SplitStatusResponse> {
  return apiGet<SplitStatusResponse>(
    `/splits/${encodeURIComponent(orderToken)}`,
    {
      schema: splitStatusResponseSchema,
      ...(signal ? { signal } : {}),
    },
  );
}

/**
 * Cache keys. Using the order_token (not a payment id) because the split
 * view is per-bill, not per-payment. Multiple splitters share this key,
 * which is the whole point — when one completes, the others see the
 * updated remaining amount on their next poll.
 */
export const splitStatusQueryKey = (orderToken: string) =>
  ['split', orderToken, 'status'] as const;
export const splitCreateKey = (orderToken: string) =>
  ['split', orderToken, 'create'] as const;
