import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { orderTokenSchema, type OrderToken } from '@flowpay/schemas';

/**
 * Result of parsing `?order=<token>` from the URL.
 *
 * - `status: 'ok'` — token is present and passes Zod validation (length bounds).
 *   It's still opaque; the API/POS-adapter is the final arbiter of validity.
 * - `status: 'missing'` — query param absent (or empty string).
 * - `status: 'invalid'` — present but fails validation (e.g. >256 chars).
 *
 * We don't surface the raw Zod error to the view — the guest never needs to
 * read it, and keeping it internal discourages leaking validator details into
 * user copy.
 */
export type OrderTokenState =
  | { status: 'ok'; token: OrderToken }
  | { status: 'missing' }
  | { status: 'invalid' };

/**
 * Read and validate the `?order=<token>` query param.
 *
 * Memoized on the raw string so a re-render without a URL change doesn't
 * re-run Zod. We only re-parse when the search string actually changes.
 */
export function useOrderToken(): OrderTokenState {
  const [params] = useSearchParams();
  const raw = params.get('order');

  return useMemo<OrderTokenState>(() => {
    if (raw === null || raw === '') {
      return { status: 'missing' };
    }
    const parsed = orderTokenSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: 'invalid' };
    }
    return { status: 'ok', token: parsed.data };
  }, [raw]);
}
