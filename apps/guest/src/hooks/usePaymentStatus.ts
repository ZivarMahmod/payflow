/**
 * usePaymentStatus — poll GET /payments/:id/status every 2s until terminal.
 *
 * Lifecycle:
 *  1. `pending`            → keep polling
 *  2. `completed`/`failed` → stop polling, expose the terminal state
 *  3. `expired`            → stop polling, expose `expired` state
 *  4. server 404/410       → treat as terminal (payment is gone), stop
 *
 * Implementation:
 *  - We use React Query's `refetchInterval` with a function that returns
 *    `false` once terminal. This is the canonical no-memory-leak way to
 *    stop polling; RQ tears down the timer on its own.
 *  - `refetchIntervalInBackground: false` — if the guest tabs away, stop
 *    spending their battery. They'll resume on focus.
 *  - Anti-pattern from the brief: "Polla ALDRIG snabbare än 2s." — the
 *    interval is hard-coded to 2000ms so a future dev doesn't wire a
 *    slider into it.
 *
 * Hard failures (404, 410, SHAPE, BAD_REQUEST) don't retry; payment is
 * either gone or the id is wrong — retrying doesn't help the guest.
 */

import { useQuery } from '@tanstack/react-query';

import { getPaymentStatus, paymentQueryKey } from '../api/payments';
import type { ApiError } from '../api/client';

/** Lifecycle values the UI needs to pattern-match on. */
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'expired', 'refunded']);

/** Milliseconds between polls. 2000ms is the brief's explicit floor. */
export const PAYMENT_POLL_INTERVAL_MS = 2000;

interface UsePaymentStatusOptions {
  /** Stops polling entirely — useful when caller knows the payment is done. */
  enabled?: boolean;
}

export function usePaymentStatus(
  paymentId: string | null,
  options: UsePaymentStatusOptions = {},
) {
  const enabled = (options.enabled ?? true) && paymentId !== null;

  return useQuery({
    queryKey: paymentQueryKey(paymentId ?? 'noop'),
    queryFn: ({ signal }) => {
      if (paymentId === null) {
        throw new Error('paymentId is null — query should not have run.');
      }
      return getPaymentStatus(paymentId, signal);
    },
    enabled,
    // `staleTime: 0` so every poll actually hits the network — the whole
    // point here is "has the server changed its mind yet?".
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return PAYMENT_POLL_INTERVAL_MS;
      if (TERMINAL_STATUSES.has(data.status)) return false;
      return PAYMENT_POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      const code = (error as Partial<ApiError> | null)?.code;
      // Gone / not-found / client-shape — not retryable. Everything else
      // gets one retry to smooth over blip-level flakiness.
      if (code === 'NOT_FOUND' || code === 'GONE' || code === 'SHAPE' || code === 'BAD_REQUEST') {
        return false;
      }
      return failureCount < 1;
    },
  });
}

/** Convenience type-guard for the UI: is this payment in a terminal state? */
export function isPaymentTerminal(status: string | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.has(status);
}
