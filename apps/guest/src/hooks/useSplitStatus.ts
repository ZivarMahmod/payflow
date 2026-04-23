/**
 * useSplitStatus — poll GET /splits/:order_token every 3s.
 *
 * Why 3s (not 2s like payments)?
 *  - This is the BILL-level view, not a per-payment dial. The numbers
 *    barely move relative to the human eye, and we may have several guests
 *    on the same bill all polling in parallel.
 *  - The brief's floor is 2s; we stay above it.
 *
 * Lifecycle:
 *  1. order_status is 'open' or 'paying' → keep polling
 *  2. order_status flips to 'paid' or 'closed' → stop polling (terminal)
 *  3. server returns 404/410 (token is gone)   → stop polling
 *
 * Implementation mirrors `usePaymentStatus` so future readers don't have
 * to learn two polling idioms.
 */

import { useQuery } from '@tanstack/react-query';

import { getSplitStatus, splitStatusQueryKey } from '../api/splits';
import type { ApiError } from '../api/client';

/** Milliseconds between polls. 3000ms > brief's 2s floor, cheaper under load. */
export const SPLIT_POLL_INTERVAL_MS = 3000;

/** Order-status values at which we stop polling — nothing more to show. */
const TERMINAL_ORDER_STATUSES = new Set(['paid', 'closed']);

interface UseSplitStatusOptions {
  /** Stops polling entirely. Useful while the pay-phase has taken over. */
  enabled?: boolean;
}

export function useSplitStatus(
  orderToken: string | null,
  options: UseSplitStatusOptions = {},
) {
  const enabled = (options.enabled ?? true) && orderToken !== null;

  return useQuery({
    queryKey: splitStatusQueryKey(orderToken ?? 'noop'),
    queryFn: ({ signal }) => {
      if (orderToken === null) {
        throw new Error('orderToken is null — query should not have run.');
      }
      return getSplitStatus(orderToken, signal);
    },
    enabled,
    // `staleTime: 0` — every poll must actually hit the network.
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return SPLIT_POLL_INTERVAL_MS;
      if (TERMINAL_ORDER_STATUSES.has(data.order_status)) return false;
      return SPLIT_POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      const code = (error as Partial<ApiError> | null)?.code;
      if (
        code === 'NOT_FOUND' ||
        code === 'GONE' ||
        code === 'SHAPE' ||
        code === 'BAD_REQUEST'
      ) {
        return false;
      }
      return failureCount < 1;
    },
  });
}

/** Convenience: has the bill been paid in full (terminal state)? */
export function isSplitTerminal(
  orderStatus: string | undefined,
): boolean {
  return orderStatus !== undefined && TERMINAL_ORDER_STATUSES.has(orderStatus);
}
