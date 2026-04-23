/**
 * /t/:slug/:tableId?order=<token> — the guest's bill view.
 *
 * Wiring:
 *  - Token comes from the search param (`useOrderToken`).
 *  - If token is missing/invalid → `NoOrderState` (no fetch).
 *  - If token is present → `useQuery` against `getOrder`. React Query owns
 *    stale/retry; we handle render states.
 *
 * Staleness: default `staleTime: 30_000` is set in main.tsx; we don't
 * override here. `refetchOnWindowFocus: true` means the bill refreshes
 * when the guest tabs back — essential during a long meal.
 *
 * Animations: items fade+slide in staggered on FIRST render only. On
 * cache hits (tab-refocus), the presence animation is skipped by keying
 * on `data-first-mount`. Motion respects `prefers-reduced-motion` via
 * Framer's baseline.
 */

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Card, Stack } from '@flowpay/ui';
import type { OrderByTokenResponse, OrderResponseItem } from '@flowpay/schemas';

import { getOrder, orderQueryKey } from '../api/orders';
import { OrderError } from '../components/OrderError';
import { OrderSkeleton } from '../components/OrderSkeleton';
import { useOrderToken } from '../hooks/useOrderToken';
import { formatAmount } from '../lib/format';

export function OrderRoute() {
  const { slug, tableId } = useParams<{ slug: string; tableId: string }>();
  const tokenState = useOrderToken();

  if (tokenState.status !== 'ok') {
    return <NoOrderState reason={tokenState.status} />;
  }

  return (
    <OrderView
      token={tokenState.token}
      slugFromUrl={slug ?? null}
      tableIdFromUrl={tableId ?? null}
    />
  );
}

function OrderView({
  token,
  slugFromUrl,
  tableIdFromUrl,
}: {
  token: string;
  slugFromUrl: string | null;
  tableIdFromUrl: string | null;
}) {
  const query = useQuery({
    queryKey: orderQueryKey(token),
    queryFn: ({ signal }) => getOrder(token, signal),
    // Don't retry 404/410/400 — they won't recover.
    retry: (failureCount, error) => {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'NOT_FOUND' || code === 'GONE' || code === 'BAD_REQUEST') {
        return false;
      }
      // Back off to max 2 retries for everything else (matches main.tsx default).
      return failureCount < 2;
    },
  });

  if (query.isPending) {
    return <OrderSkeleton />;
  }

  if (query.isError) {
    return (
      <OrderError
        error={query.error}
        onRetry={() => void query.refetch()}
        isRetrying={query.isRefetching}
      />
    );
  }

  return (
    <OrderBill
      order={query.data}
      slugFromUrl={slugFromUrl}
      tableIdFromUrl={tableIdFromUrl}
      isFirstRender={query.isFetchedAfterMount}
    />
  );
}

/**
 * Present the bill. Split out so the animation container only remounts when
 * the token changes, not when the query re-settles.
 */
function OrderBill({
  order,
  slugFromUrl,
  tableIdFromUrl,
  isFirstRender,
}: {
  order: OrderByTokenResponse;
  slugFromUrl: string | null;
  tableIdFromUrl: string | null;
  /** True when data came from the network on this mount; false on cache hits. */
  isFirstRender: boolean;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Prefer the canonical values from the API over the URL — slug in the URL
  // could be human-edited or out of date.
  const displayName = order.restaurant.name || slugFromUrl || '—';
  const tableNumber = order.table.number ?? tableIdFromUrl ?? '—';
  // Bills that are already paid/closed must never expose the pay CTA.
  const canPay = order.status === 'open' || order.status === 'paying';
  const tokenParam = searchParams.get('order') ?? '';
  const slugSeg = encodeURIComponent(slugFromUrl ?? '');
  const tableSeg = encodeURIComponent(tableIdFromUrl ?? '');
  const goToPay = () => {
    if (!canPay) return;
    navigate(
      `/t/${slugSeg}/${tableSeg}/pay?order=${encodeURIComponent(tokenParam)}`,
    );
  };
  const goToSplit = () => {
    if (!canPay) return;
    navigate(
      `/t/${slugSeg}/${tableSeg}/split?order=${encodeURIComponent(tokenParam)}`,
    );
  };

  const container = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.04 },
    },
  };
  const item = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28 } },
  };

  // Skip animation on cache-hit renders — feels sluggish when the data was
  // already there. `isFetchedAfterMount` is false for cache hits.
  const animate = isFirstRender ? 'visible' : undefined;
  const initial = isFirstRender ? 'hidden' : 'visible';

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-paper px-4 py-6 pb-40 text-ink">
      <header className="mb-6">
        <p className="text-sm text-graphite">
          {displayName} · Bord {tableNumber}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Din nota</h1>
      </header>

      <Card padding="none">
        <motion.ul
          className="divide-y divide-hairline"
          variants={container}
          initial={initial}
          animate={animate}
        >
          {order.items.map((line, idx) => (
            <motion.li
              key={`${line.name}-${idx}`}
              variants={item}
              className="flex items-baseline justify-between gap-3 px-4 py-3"
            >
              <BillLine line={line} currency={order.currency} />
            </motion.li>
          ))}
        </motion.ul>

        <div className="flex items-baseline justify-between gap-3 border-t border-hairline px-4 py-4">
          <p className="text-sm text-graphite">Att betala</p>
          <p className="text-3xl font-semibold tabular-nums">
            {formatAmount(order.total, order.currency)}
          </p>
        </div>
      </Card>

      {/*
        Sticky "pay" CTA — lives at viewport bottom so the guest never needs
        to scroll to the end of a 20-line bill to pay. `pb-40` on <main>
        guarantees content isn't hidden beneath it.
      */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-paper via-paper/95 to-transparent pb-[env(safe-area-inset-bottom)] pt-6">
        <div className="pointer-events-auto mx-auto max-w-md px-4">
          <Stack gap={2}>
            <Button
              variant="primary"
              size="lg"
              block
              onClick={goToPay}
              disabled={!canPay || tokenParam === ''}
              aria-describedby={canPay ? undefined : 'pay-hint'}
            >
              Betala {formatAmount(order.total, order.currency)}
            </Button>
            <Button
              variant="secondary"
              size="md"
              block
              onClick={goToSplit}
              disabled={!canPay || tokenParam === ''}
              aria-label="Splitta notan"
            >
              Splitta notan
            </Button>
            {!canPay ? (
              <p id="pay-hint" className="text-center text-xs text-graphite">
                Notan är redan avslutad.
              </p>
            ) : null}
          </Stack>
        </div>
      </div>
    </main>
  );
}

function BillLine({
  line,
  currency,
}: {
  line: OrderResponseItem;
  currency: string;
}) {
  return (
    <>
      <div className="min-w-0">
        <p className="truncate font-medium">{line.name}</p>
        {line.qty > 1 ? (
          <p className="text-sm text-graphite">
            {line.qty} × {formatAmount(line.unitPrice, currency)}
          </p>
        ) : null}
      </div>
      <p className="tabular-nums font-medium">
        {formatAmount(line.lineTotal, currency)}
      </p>
    </>
  );
}

function NoOrderState({ reason }: { reason: 'missing' | 'invalid' }) {
  const copy =
    reason === 'invalid'
      ? {
          title: 'Ogiltig QR-kod',
          body: 'Koden verkar skadad. Be personalen skriva ut en ny, eller försök skanna igen.',
        }
      : {
          title: 'Ingen aktiv beställning',
          body: 'Vi hittar ingen pågående beställning för det här bordet. Ropa på personalen om du tror det är fel.',
        };

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-paper px-4 py-10 text-ink">
      <Card padding="md">
        <Stack gap={4}>
          <h1 className="text-xl font-semibold">{copy.title}</h1>
          <p className="text-graphite">{copy.body}</p>
        </Stack>
      </Card>
    </main>
  );
}
