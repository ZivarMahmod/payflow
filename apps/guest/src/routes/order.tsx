/**
 * /t/:slug/:tableId?order=<token> — the guest's bill view.
 *
 * Two visual states share this route:
 *   1. <WelcomeView />   — first-touch landing after QR scan
 *   2. <BillView />      — full itemised bill, shown after the guest taps
 *                          "Visa min nota". Refresh resets to welcome.
 *
 * Data:
 *   - Token comes from the search param (`useOrderToken`).
 *   - If token missing/invalid → `NoOrderState` (no fetch).
 *   - If token present → `useQuery` against `getOrder`.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, Stack } from '@flowpay/ui';
import type { OrderByTokenResponse } from '@flowpay/schemas';

import { getOrder, orderQueryKey } from '../api/orders';
import { BillView } from '../components/BillView';
import { OrderError } from '../components/OrderError';
import { OrderSkeleton } from '../components/OrderSkeleton';
import { WelcomeView } from '../components/WelcomeView';
import { useOrderToken } from '../hooks/useOrderToken';

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
  const [opened, setOpened] = useState(false);
  const query = useQuery({
    queryKey: orderQueryKey(token),
    queryFn: ({ signal }) => getOrder(token, signal),
    retry: (failureCount, error) => {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'NOT_FOUND' || code === 'GONE' || code === 'BAD_REQUEST') {
        return false;
      }
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
    <OrderSurface
      order={query.data}
      opened={opened}
      onOpen={() => setOpened(true)}
      onBack={() => setOpened(false)}
      slugFromUrl={slugFromUrl}
      tableIdFromUrl={tableIdFromUrl}
    />
  );
}

function OrderSurface({
  order,
  opened,
  onOpen,
  onBack,
  slugFromUrl,
  tableIdFromUrl,
}: {
  order: OrderByTokenResponse;
  opened: boolean;
  onOpen: () => void;
  onBack: () => void;
  slugFromUrl: string | null;
  tableIdFromUrl: string | null;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tableNumber = order.table.number ?? tableIdFromUrl ?? '—';
  const tableLabel = `Bord ${tableNumber}`;
  const tokenParam = searchParams.get('order') ?? '';
  const slugSeg = encodeURIComponent(slugFromUrl ?? '');
  const tableSeg = encodeURIComponent(tableIdFromUrl ?? '');

  const canPay = order.status === 'open' || order.status === 'paying';
  const goToPay = () => {
    if (!canPay) return;
    navigate(`/t/${slugSeg}/${tableSeg}/pay?order=${encodeURIComponent(tokenParam)}`);
  };
  const goToSplit = () => {
    if (!canPay) return;
    navigate(`/t/${slugSeg}/${tableSeg}/split?order=${encodeURIComponent(tokenParam)}`);
  };

  if (!opened) {
    return <WelcomeView order={order} tableLabel={tableLabel} onOpen={onOpen} />;
  }

  return (
    <BillView
      order={order}
      tableLabel={tableLabel}
      onBack={onBack}
      onPayFull={goToPay}
      onSplit={goToSplit}
    />
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
    <main className="flex min-h-dvh items-center justify-center bg-paper px-6 text-ink">
      <Card variant="paper" radius="lg" padding="lg" className="max-w-sm">
        <Stack gap={3}>
          <h1 className="font-serif-italic text-[28px] font-semibold leading-tight">
            {copy.title}
          </h1>
          <p className="text-[15px] text-graphite">{copy.body}</p>
        </Stack>
      </Card>
    </main>
  );
}
