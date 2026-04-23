/**
 * /t/:slug/:tableId/pay?order=<token> — payment flow.
 *
 * Phases (local state machine):
 *   'tip'     → dricks step (serif heading, 2×2 grid, summary)
 *   'await'   → Swish QR + poll
 *   'expired' → timer hit 3 min
 *
 * We collapse the mocks' "payment-method picker" into the dricks-CTA:
 * tapping "Fortsätt till betalning" starts a Swish flow directly. Card
 * payments remain a discoverable fallback link under the CTA until
 * BRIEF-API-005 (Stripe) ships.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CreditCard } from 'lucide-react';
import { Button, Card, Stack } from '@flowpay/ui';
import type {
  PaymentInitiateSwishResponse,
  PaymentMethod,
} from '@flowpay/schemas';

import { initiatePayment } from '../api/payments';
import { getOrder, orderQueryKey } from '../api/orders';
import { OrderError } from '../components/OrderError';
import { OrderSkeleton } from '../components/OrderSkeleton';
import { ScreenHeader } from '../components/ScreenHeader';
import { SwishQR } from '../components/SwishQR';
import {
  TipSelector,
  computeInitialTipAmount,
} from '../components/TipSelector';
import { useOrderToken } from '../hooks/useOrderToken';
import { usePaymentStatus } from '../hooks/usePaymentStatus';
import { formatAmount } from '../lib/format';

type Phase =
  | { kind: 'tip' }
  | { kind: 'await'; init: PaymentInitiateSwishResponse }
  | { kind: 'expired'; init: PaymentInitiateSwishResponse };

export function PaymentRoute() {
  const tokenState = useOrderToken();
  const { slug, tableId } = useParams<{ slug: string; tableId: string }>();

  if (tokenState.status !== 'ok') {
    return (
      <FallbackShell>
        <p className="text-graphite">
          Vi hittar ingen aktiv beställning. Skanna QR-koden på bordet igen.
        </p>
      </FallbackShell>
    );
  }

  return (
    <PaymentView
      token={tokenState.token}
      slug={slug ?? ''}
      tableId={tableId ?? ''}
    />
  );
}

function PaymentView({
  token,
  slug,
  tableId,
}: {
  token: string;
  slug: string;
  tableId: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const preInitiated = readPreInitiated(location.state);

  const [phase, setPhase] = useState<Phase>(() =>
    preInitiated ? { kind: 'await', init: preInitiated } : { kind: 'tip' },
  );

  const orderQuery = useQuery({
    queryKey: orderQueryKey(token),
    queryFn: ({ signal }) => getOrder(token, signal),
  });

  const [tipAmount, setTipAmount] = useState<number | null>(() =>
    preInitiated ? 0 : null,
  );

  useEffect(() => {
    if (tipAmount !== null) return;
    if (!orderQuery.data) return;
    setTipAmount(
      computeInitialTipAmount(
        orderQuery.data.total,
        orderQuery.data.restaurant.defaultTipPercent,
        orderQuery.data.restaurant.tipOptions,
      ),
    );
  }, [tipAmount, orderQuery.data]);

  const [tipInvalid, setTipInvalid] = useState(false);

  const initiate = useMutation({
    mutationFn: async (method: PaymentMethod) => {
      if (!orderQuery.data) {
        throw new Error('Order not loaded — cannot initiate payment.');
      }
      if (tipAmount === null) {
        throw new Error('Tip amount not ready — order still loading.');
      }
      return initiatePayment({
        order_token: token,
        amount: orderQuery.data.total,
        tip_amount: tipAmount,
        method,
      });
    },
    onSuccess: (data) => {
      setPhase({ kind: 'await', init: data });
    },
  });

  const statusQuery = usePaymentStatus(
    phase.kind === 'await' ? phase.init.payment_id : null,
    { enabled: phase.kind === 'await' },
  );

  useEffect(() => {
    if (phase.kind !== 'await') return;
    const status = statusQuery.data?.status;
    if (status === 'completed') {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate?.(50);
        } catch {
          // ignore
        }
      }
      navigate(`/t/${slug}/${tableId}/success`, {
        replace: true,
        state: {
          paymentId: phase.init.payment_id,
          amount: statusQuery.data?.amount ?? 0,
          tipAmount: statusQuery.data?.tip_amount ?? 0,
          currency: orderQuery.data?.currency ?? 'SEK',
          restaurantName: orderQuery.data?.restaurant.name ?? '',
        },
      });
    }
  }, [
    phase,
    statusQuery.data,
    slug,
    tableId,
    navigate,
    orderQuery.data?.currency,
    orderQuery.data?.restaurant.name,
  ]);

  useEffect(() => {
    if (phase.kind !== 'await') return;
    if (statusQuery.data?.status === 'expired') {
      setPhase({ kind: 'expired', init: phase.init });
      return;
    }
    const expiresAt = new Date(phase.init.expires_at).getTime();
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      setPhase({ kind: 'expired', init: phase.init });
      return;
    }
    const timer = window.setTimeout(() => {
      setPhase((prev) =>
        prev.kind === 'await' ? { kind: 'expired', init: prev.init } : prev,
      );
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [phase, statusQuery.data?.status]);

  if (orderQuery.isPending) {
    return <OrderSkeleton />;
  }
  if (orderQuery.isError) {
    return (
      <OrderError
        error={orderQuery.error}
        onRetry={() => void orderQuery.refetch()}
        isRetrying={orderQuery.isRefetching}
      />
    );
  }
  if (orderQuery.data.status === 'paid' || orderQuery.data.status === 'closed') {
    return (
      <FallbackShell>
        <p className="text-graphite">
          Den här notan är redan avslutad. Ingenting mer att betala.
        </p>
        <Button
          variant="outline"
          size="md"
          block
          onClick={() => navigate(`/t/${slug}/${tableId}?order=${token}`)}
        >
          Tillbaka till notan
        </Button>
      </FallbackShell>
    );
  }

  const { data: order } = orderQuery;
  const tableLabel = `Bord ${order.table.number ?? '—'}`;
  const totalWithTip =
    tipAmount !== null ? Math.round((order.total + tipAmount) * 100) / 100 : order.total;

  const onBack = () => {
    if (phase.kind === 'tip') {
      navigate(`/t/${slug}/${tableId}?order=${encodeURIComponent(token)}`);
    } else {
      setPhase({ kind: 'tip' });
    }
  };

  return (
    <main className="flex min-h-dvh flex-col bg-paper pb-10 text-ink">
      <ScreenHeader
        onBack={onBack}
        totalSteps={5}
        step={phase.kind === 'tip' ? 3 : 4}
      />

      {phase.kind === 'tip' ? (
        <div className="px-6 pt-5">
          <h1 className="font-serif-italic text-[32px] font-semibold leading-tight text-ink">
            Dricks till köket?
          </h1>
          <p className="mt-2 text-[14px] text-graphite">
            Hela dricksen går direkt till teamet.
          </p>
        </div>
      ) : null}

      <div className="mt-6 px-5">
        {phase.kind === 'tip' ? (
          <Stack gap={4}>
            {initiate.isError ? (
              <PaymentInitiateErrorNotice error={initiate.error} />
            ) : null}

            {tipAmount !== null ? (
              <TipSelector
                orderTotal={order.total}
                tipOptions={order.restaurant.tipOptions}
                defaultTipPercent={order.restaurant.defaultTipPercent}
                tipAmount={tipAmount}
                onTipChange={setTipAmount}
                onInvalidChange={setTipInvalid}
                currency={order.currency}
                disabled={initiate.isPending}
              />
            ) : null}

            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => initiate.mutate('swish')}
              disabled={initiate.isPending || tipAmount === null || tipInvalid}
              trailingIcon={<ArrowRight size={18} strokeWidth={2.2} />}
              aria-label={`Fortsätt till Swish — ${formatAmount(totalWithTip, order.currency)}`}
            >
              {initiate.isPending ? 'Startar Swish…' : 'Fortsätt till betalning'}
            </Button>

            <Button
              variant="ghost"
              size="md"
              block
              onClick={() => initiate.mutate('card')}
              disabled={initiate.isPending || tipAmount === null || tipInvalid}
              leadingIcon={<CreditCard size={16} strokeWidth={1.8} />}
            >
              Betala med kort istället
            </Button>
          </Stack>
        ) : null}

        {phase.kind === 'await' ? (
          <AwaitingSwish
            init={phase.init}
            amount={useMemoAmount(statusQuery.data, order.total + (tipAmount ?? 0))}
            currency={order.currency}
            restaurantName={order.restaurant.name}
            tableLabel={tableLabel}
            pollError={statusQuery.isError ? statusQuery.error : null}
          />
        ) : null}

        {phase.kind === 'expired' ? (
          <ExpiredState
            onRetry={() => {
              initiate.reset();
              setPhase({ kind: 'tip' });
            }}
            onBack={() => navigate(`/t/${slug}/${tableId}?order=${token}`)}
          />
        ) : null}
      </div>
    </main>
  );
}

function useMemoAmount(
  statusData: { amount?: number; tip_amount?: number } | undefined,
  fallback: number,
): number {
  return useMemo(() => {
    if (!statusData) return fallback;
    const a = statusData.amount ?? 0;
    const t = statusData.tip_amount ?? 0;
    return a + t || fallback;
  }, [statusData, fallback]);
}

function AwaitingSwish({
  init,
  amount,
  currency,
  restaurantName,
  tableLabel,
  pollError,
}: {
  init: PaymentInitiateSwishResponse;
  amount: number;
  currency: string;
  restaurantName?: string;
  tableLabel?: string;
  pollError: unknown;
}) {
  return (
    <Stack gap={4}>
      <SwishQR
        qrDataUrl={init.qr_data_url}
        swishUrl={init.swish_url}
        reference={init.reference}
        amount={amount}
        currency={currency}
        restaurantName={restaurantName}
        tableLabel={tableLabel}
      />

      <motion.div
        className="rounded-2xl border border-hairline bg-shell/60 px-4 py-3 text-center text-[13px] text-graphite"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <PulsingDot /> Väntar på bekräftelse från Swish…
      </motion.div>

      {pollError ? (
        <p role="status" className="text-center text-xs text-graphite">
          Tappat uppkoppling till servern. Försöker igen…
        </p>
      ) : null}
    </Stack>
  );
}

function ExpiredState({
  onRetry,
  onBack,
}: {
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <Card variant="paper" radius="lg" padding="lg">
      <Stack gap={4}>
        <div>
          <h2 className="font-serif-italic text-[26px] font-semibold leading-tight">
            Tiden gick ut
          </h2>
          <p className="mt-2 text-[14px] text-graphite">
            Swish-begäran har gått ut. Starta om för att försöka igen.
          </p>
        </div>
        <Button variant="primary" size="lg" block onClick={onRetry}>
          Försök igen
        </Button>
        <Button variant="ghost" size="md" block onClick={onBack}>
          Tillbaka till notan
        </Button>
      </Stack>
    </Card>
  );
}

function PaymentInitiateErrorNotice({ error }: { error: unknown }) {
  const code = (error as { code?: string } | null)?.code;
  const message =
    code === 'GONE'
      ? 'Notan är redan avslutad.'
      : code === 'NOT_FOUND'
        ? 'Vi hittar inte den här beställningen.'
        : code === 'BAD_REQUEST'
          ? 'Något i begäran var fel — ropa på personalen.'
          : 'Det gick inte att starta betalningen. Försök igen.';
  return (
    <div
      role="alert"
      className="rounded-2xl border border-hairline bg-paper px-4 py-3 text-sm text-ink"
    >
      {message}
    </div>
  );
}

function PulsingDot() {
  return (
    <motion.span
      className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle"
      animate={{ opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

function FallbackShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-6 text-ink">
      <Card variant="paper" radius="lg" padding="lg" className="w-full max-w-sm">
        <Stack gap={4}>{children}</Stack>
      </Card>
    </main>
  );
}

function readPreInitiated(
  state: unknown,
): PaymentInitiateSwishResponse | null {
  if (!state || typeof state !== 'object') return null;
  const candidate = (state as { preInitiated?: unknown }).preInitiated;
  if (!candidate || typeof candidate !== 'object') return null;
  const c = candidate as Record<string, unknown>;
  if (
    typeof c['payment_id'] === 'string' &&
    typeof c['swish_url'] === 'string' &&
    typeof c['qr_data_url'] === 'string' &&
    typeof c['reference'] === 'string' &&
    typeof c['expires_at'] === 'string'
  ) {
    return candidate as PaymentInitiateSwishResponse;
  }
  return null;
}
