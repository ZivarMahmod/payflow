/**
 * /t/:slug/:tableId/pay?order=<token> — the payment flow.
 *
 * State machine (driven by `phase`):
 *  1. 'select'   → PaymentMethodSelector. Guest picks Swish.
 *  2. 'initiate' → POST /payments/initiate mutation pending. Transient.
 *  3. 'await'    → SwishQR + polling. Waits for completed/expired.
 *  4. 'expired'  → timer hit 3 min. Offer retry or back-to-bill.
 *  5. 'error'    → initiate or status failed irrecoverably.
 *
 * On `completed` we navigate to /success with receipt data passed as
 * router-state (no refetch needed — the poll response already has it).
 *
 * Why a local state machine instead of multiple nested routes?
 *  - All phases share the same order-context (slug/table/token).
 *  - Browser-back from a sub-route back into a live Swish flow would be
 *    confusing; a single route keeps the journey linear.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button, Card, Stack } from '@flowpay/ui';
import type {
  PaymentInitiateSwishResponse,
  PaymentMethod,
} from '@flowpay/schemas';

import { initiatePayment } from '../api/payments';
import { getOrder, orderQueryKey } from '../api/orders';
import { OrderError } from '../components/OrderError';
import { OrderSkeleton } from '../components/OrderSkeleton';
import { PaymentMethodSelector } from '../components/PaymentMethodSelector';
import { SwishQR } from '../components/SwishQR';
import {
  TipSelector,
  computeInitialTipAmount,
} from '../components/TipSelector';
import { useOrderToken } from '../hooks/useOrderToken';
import { usePaymentStatus } from '../hooks/usePaymentStatus';
import { formatAmount } from '../lib/format';

type Phase =
  | { kind: 'select' }
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
  // KI-004 hand-off — when the guest comes from /split, the split route
  // has already written a pending payment row server-side and returned
  // the Swish-initiate shape as `state.preInitiated`. Skip our own
  // initiate mutation and go straight to the await phase. `useState`'s
  // initialiser runs once, so we can't accidentally re-start a Swish
  // flow on route re-mount.
  const preInitiated = readPreInitiated(location.state);
  const [phase, setPhase] = useState<Phase>(() =>
    preInitiated ? { kind: 'await', init: preInitiated } : { kind: 'select' },
  );

  // Re-read the order so this route is resilient to direct-nav (someone
  // opens /pay?order=… in a new tab). React Query caches it, so if we
  // came from the /t/:slug/:tableId route it's already warm.
  const orderQuery = useQuery({
    queryKey: orderQueryKey(token),
    queryFn: ({ signal }) => getOrder(token, signal),
  });

  // KI-005 — tip state. Owned by the route (not TipSelector) so the
  // "Försök igen" path after an expiry keeps the guest's tip instead of
  // silently resetting it to the admin default. Seeded lazily once the
  // order has loaded: `null` means "not yet seeded" (we show a spinner),
  // `number` means "ready to pay with this tip". The seed uses
  // `computeInitialTipAmount`, the same pure helper TipSelector uses to
  // derive its initial selection, so both agree on first paint.
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

  // Track whether the custom-input is in an invalid state — we can't
  // derive this from `tipAmount` alone (the component clamps) so the
  // component reports back via this callback. Blocks "Betala" while red.
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

  // Redirect to /success when the payment completes — use a reducer-style
  // effect so we only fire navigation once (React strict-mode double-invokes
  // effects in dev, but navigation is idempotent).
  useEffect(() => {
    if (phase.kind !== 'await') return;
    const status = statusQuery.data?.status;
    if (status === 'completed') {
      // Haptic feedback on success — wrapped in typeof-check so SSR / older
      // iOS Safari doesn't trip a TypeError.
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate?.(50);
        } catch {
          // Some browsers throw if the feature is blocked by permissions.
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

  // Explicit expiry watcher so we don't show a spinny dial once the deep
  // link is dead. Two triggers:
  //   (a) server returned `status: 'expired'` (preferred — wall-clock authority)
  //   (b) client reached `expires_at` before the server flipped the row
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
    // Bill was closed while the guest was on this screen — bounce them
    // back to the bill view which shows the "redan betald" state.
    return (
      <FallbackShell>
        <p className="text-graphite">
          Den här notan är redan avslutad. Ingenting mer att betala.
        </p>
        <Button
          variant="secondary"
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
  const amountLabel = formatAmount(order.total, order.currency);

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-paper px-4 py-6 text-ink">
      <header className="mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm text-graphite underline-offset-4 hover:underline"
          aria-label="Tillbaka till notan"
        >
          ← Tillbaka
        </button>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Betala</h1>
        <p className="mt-1 text-sm text-graphite">
          {order.restaurant.name} · Bord {order.table.number ?? '—'}
        </p>
      </header>

      <Card padding="md">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-graphite">Att betala</p>
          <p className="text-3xl font-semibold tabular-nums">{amountLabel}</p>
        </div>
      </Card>

      <div className="mt-6">
        {phase.kind === 'select' ? (
          <Stack gap={4}>
            {initiate.isError ? (
              <PaymentInitiateErrorNotice error={initiate.error} />
            ) : null}
            {/*
             * KI-005 — tip selector sits BETWEEN the amount card above and
             * the payment-method selector below (brief: "Placera mellan
             * summa-sida och betalningsmetod-val"). We only render it when
             * the tip state has been seeded from the order response (i.e.
             * `tipAmount !== null`); the rest of the 'select' phase is
             * quick enough to render without a skeleton.
             */}
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
            <PaymentMethodSelector
              onSelect={(method) => initiate.mutate(method)}
              /*
               * Block "Betala" while:
               *   - a mutation is in flight (existing behaviour),
               *   - the tip hasn't been seeded yet (shouldn't happen post
               *     load but the null-guard in `mutationFn` throws if it
               *     does; being defensive at the UI too avoids a flash of
               *     an error toast on a very cold cache),
               *   - the custom tip input is out of range
               *     (> TIP_CUSTOM_MAX_PERCENT or NaN). The component still
               *     flags it inline; this stops the guest from tapping
               *     Betala past the red error.
               */
              isSubmitting={initiate.isPending}
              disabled={tipAmount === null || tipInvalid}
            />
          </Stack>
        ) : null}

        {phase.kind === 'await' ? (
          <AwaitingSwish
            init={phase.init}
            pollError={statusQuery.isError ? statusQuery.error : null}
          />
        ) : null}

        {phase.kind === 'expired' ? (
          <ExpiredState
            onRetry={() => {
              initiate.reset();
              setPhase({ kind: 'select' });
            }}
            onBack={() => navigate(`/t/${slug}/${tableId}?order=${token}`)}
          />
        ) : null}
      </div>
    </main>
  );
}

function AwaitingSwish({
  init,
  pollError,
}: {
  init: PaymentInitiateSwishResponse;
  pollError: unknown;
}) {
  return (
    <Stack gap={4}>
      <SwishQR
        qrDataUrl={init.qr_data_url}
        swishUrl={init.swish_url}
        reference={init.reference}
      />

      <motion.div
        className="rounded-md bg-hairline/30 px-4 py-3 text-center text-sm text-graphite"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <PulsingDot /> Väntar på bekräftelse från Swish…
      </motion.div>

      {pollError ? (
        // Polling errors are usually blips — surface them quietly without
        // yanking the QR off the screen.
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
    <Card padding="md">
      <Stack gap={4}>
        <div>
          <h2 className="text-xl font-semibold">Tiden gick ut</h2>
          <p className="mt-2 text-graphite">
            Swish-begäran har gått ut. Starta om för att försöka igen.
          </p>
        </div>
        <Button variant="primary" size="md" block onClick={onRetry}>
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
      className="rounded-md border border-hairline bg-paper px-4 py-3 text-sm text-ink"
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
    <main className="mx-auto flex min-h-dvh max-w-md items-center bg-paper px-4 py-10 text-ink">
      <Card padding="md" className="w-full">
        <Stack gap={4}>{children}</Stack>
      </Card>
    </main>
  );
}

/**
 * Minimal structural guard — we only trust router-state from our own
 * /split route, but the browser can stuff anything in here across a
 * hard refresh, so duck-type the shape rather than cast-and-pray.
 */
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

