/**
 * Orders API bindings.
 *
 * Owns the mapping between the API's wire shape (`orderByTokenResponseSchema`
 * from `@flowpay/schemas`) and the guest PWA's call sites. Keep this file
 * narrow: one function per endpoint, typed in, typed out.
 */

import {
  type OrderByTokenResponse,
  orderByTokenResponseSchema,
} from '@flowpay/schemas';

import { apiGet } from './client';

/**
 * GET /orders/:token
 *
 * The token is URL-encoded defensively — the upstream RPC accepts any
 * non-empty string, but the Fastify route path-segment matches greedily so
 * any stray `/` in the token would break routing. In practice our tokens
 * are 16 hex chars (see DB-002), but encode anyway as a cheap defence.
 */
export async function getOrder(
  token: string,
  signal?: AbortSignal,
): Promise<OrderByTokenResponse> {
  return apiGet<OrderByTokenResponse>(`/orders/${encodeURIComponent(token)}`, {
    schema: orderByTokenResponseSchema,
    ...(signal ? { signal } : {}),
  });
}

/** Stable cache key for React Query. Exported so tests + invalidators agree. */
export const orderQueryKey = (token: string) => ['order', token] as const;
