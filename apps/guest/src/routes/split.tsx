/**
 * /t/:slug/:tableId/split?order=<token> — split-flow.
 *
 * Three modes (BRIEF-KI-004): `equal`, `portion`, `items`.
 *
 * State machine:
 *   1. Load the order (`orderQuery`) + poll the live split status
 *      (`useSplitStatus`) → show the "X kr av Y kr kvar" line.
 *   2. Guest picks a mode → we render the matching sub-component.
 *   3. Guest taps "Betala X kr" → POST /splits/:order_token. The server
 *      writes the pending payment row itself, so the response is already
 *      in the Swish-initiate shape.
 *   4. We navigate to /pay with `state: { preInitiated }` — PaymentRoute
 *      picks it up, skips its own initiate mutation, and goes straight
 *      to the 'await' phase (QR + poll).
 *   5. If, while the guest was picking, another splitter finished and
 *      `amount_remaining === 0`, we show a "Notan är betald, tack!"
 *      card and auto-bounce back to the bill view.
 *
 * Parallel-splitter safety:
 *   - The live-poll response reflects `completed + pending`, not just
 *     completed, so two guests tinkering simultaneously can't both max
 *     out the remaining balance.
 *   - The server does the authoritative check on POST. Our client-side
 *     guard is belt-and-braces.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button, Card, Stack } from '@flowpay/ui';

import type {
  SplitCreateRequest,
  SplitType,
} from '@flowpay/schemas';

import { getOrder, orderQueryKey } from '../api/orders';
import { createSplit } from '../api/splits';
import { OrderError } from '../components/OrderError';
import { OrderSkeleton } from '../components/OrderSkeleton';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  SplitEqual,
  SPLIT_EQUAL_MAX_PARTS,
  SPLIT_EQUAL_MIN_PARTS,
  isEqualValid,
} from '../components/SplitEqual';
import {
  SplitItems,
  isItemsValid,
} from '../components/SplitItems';
import {
  MIN_PORTION_SEK,
  SplitPortion,
  isPortionValid,
} from '../components/SplitPortion';
import { SplitModeSelector } from '../components/SplitModeSelector';
import { useOrderToken } from '../hooks/useOrderToken';
import { useSplitStatus } from '../hooks/useSplitStatus';
import { formatAmount } from '../lib/format';

export function SplitRoute() {
  const tokenState = useOrderToken();
  const { slug, tableId } = useParams<{ slug: string; tableId: string }>();

  if (tokenState.status !== 'ok') {
    return (
      <FallbackShell>
        <p className="text-graphite">
          Ingen aktiv beställning. Skanna QR-koden på bordet igen.
        </p>
      </FallbackShell>
    );
  }

  return (
    <SplitView
      token={tokenState.token}
      slug={slug ?? ''}
      tableId={tableId ?? ''}
    />
  );
}

function SplitView({
  token,
  slug,
  tableId,
}: {
  token: string;
  slug: string;
  tableId: string;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<SplitType | null>(null);

  // Equal-mode state. Defaults pick the second slot so "1/2" reads naturally.
  const [equalParts, setEqualParts] = useState<number>(2);
  const [equalPartIndex, setEqualPartIndex] = useState<number>(1);
  const [equalAmount, setEqualAmount] = useState<number>(0);

  // Portion-mode state. Initial value is recomputed lazily once we know
  // the remaining (see useEffect below).
  const [portionAmount, setPortionAmount] = useState<number>(MIN_PORTION_SEK);

  // Items-mode state. Indexes are 0-based into orderQuery.data.items.
  const [itemIndexes, setItemIndexes] = useState<number[]>([]);
  const [itemsAmount, setItemsAmount] = useState<number>(0);

  const orderQuery = useQuery({
    queryKey: orderQueryKey(token),
    queryFn: ({ signal }) => getOrder(token, signal),
  });

  const statusQuery = useSplitStatus(token);

  // Safe remaining balance — prefer the live poll, fall back to the order's
  // own `total` if the poll hasn't come back yet. Both are decimal SEK.
  const remaining = useMemo(() => {
    if (statusQuery.data) return statusQuery.data.amount_remaining;
    if (orderQuery.data) return orderQuery.data.total;
    return 0;
  }, [statusQuery.data, orderQuery.data]);

  // Clamp portion default once we know the actual remaining.
  useEffect(() => {
    if (!statusQuery.data) return;
    const r = statusQuery.data.amount_remaining;
    setPortionAmount((prev) => {
      if (prev <= 0 || prev > r) {
        const target = Math.min(Math.max(prev, MIN_PORTION_SEK), Math.max(r, 0));
        return Math.round(target * 100) / 100;
      }
      return prev;
    });
  }, [statusQuery.data]);

  // Clamp equal-part index when parts count shrinks below it.
  useEffect(() => {
    setEqualPartIndex((prev) => Math.min(prev, equalParts));
  }, [equalParts]);

  const createMutation = useMutation({
    mutationFn: (body: SplitCreateRequest) => createSplit(token, body),
    onSuccess: (data, vars) => {
      // Hand off to /pay with pre-initiated state so PaymentRoute skips its
      // own initiate step.
      navigate(`/t/${slug}/${tableId}/pay?order=${encodeURIComponent(token)}`, {
        state: {
          preInitiated: data,
          splitAmount: vars.amount,
          tipAmount: vars.tip_amount ?? 0,
        },
      });
    },
  });

  // Lift the UI into "terminal" mode when the bill is fully paid while we
  // were tinkering. Auto-bounce after 2s so nobody can re-submit.
  useEffect(() => {
    const status = statusQuery.data?.order_status;
    if (status === 'paid' || status === 'closed') {
      const t = window.setTimeout(() => {
        navigate(`/t/${slug}/${tableId}?order=${encodeURIComponent(token)}`, {
          replace: true,
        });
      }, 2000);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [statusQuery.data?.order_status, navigate, slug, tableId, token]);

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

  const order = orderQuery.data;

  const orderIsTerminal =
    statusQuery.data?.order_status === 'paid' ||
    statusQuery.data?.order_status === 'closed' ||
    order.status === 'paid' ||
    order.status === 'closed';

  if (orderIsTerminal) {
    return (
      <FallbackShell>
        <Stack gap={3}>
          <h1 className="font-serif-italic text-[28px] font-semibold leading-tight">
            Notan är betald
          </h1>
          <p className="text-graphite">
            Någon vid bordet betalade medan du var på den här sidan.
            Vi skickar dig tillbaka.
          </p>
        </Stack>
      </FallbackShell>
    );
  }

  // Which amount is the submit-active one?
  const activeAmount =
    mode === 'equal'
      ? equalAmount
      : mode === 'portion'
        ? portionAmount
        : mode === 'items'
          ? itemsAmount
          : 0;

  const canSubmit =
    mode !== null &&
    !createMutation.isPending &&
    (mode === 'equal'
      ? isEqualValid(equalAmount, remaining) &&
        equalPartIndex >= 1 &&
        equalPartIndex <= equalParts &&
        equalParts >= SPLIT_EQUAL_MIN_PARTS &&
        equalParts <= SPLIT_EQUAL_MAX_PARTS
      : mode === 'portion'
        ? isPortionValid(portionAmount, remaining)
        : mode === 'items'
          ? isItemsValid(itemIndexes, itemsAmount, remaining)
          : false);

  const buildBody = (): SplitCreateRequest | null => {
    if (mode === null) return null;
    if (mode === 'equal') {
      return {
        type: 'equal',
        amount: equalAmount,
        tip_amount: 0,
        method: 'swish',
        equal_parts: equalParts,
        equal_part_index: equalPartIndex,
      };
    }
    if (mode === 'portion') {
      return {
        type: 'portion',
        amount: portionAmount,
        tip_amount: 0,
        method: 'swish',
      };
    }
    // items
    return {
      type: 'items',
      amount: itemsAmount,
      tip_amount: 0,
      method: 'swish',
      item_indexes: itemIndexes,
    };
  };

  const submit = () => {
    const body = buildBody();
    if (!body) return;
    createMutation.mutate(body);
  };

  // The number of OTHER active splitters, just for a friendly copy line.
  const otherActiveCount = Math.max(
    0,
    (statusQuery.data?.active_splits.length ?? 0) - (createMutation.isPending ? 1 : 0),
  );

  const modeTitle =
    mode === null
      ? 'Hur vill ni splitta?'
      : mode === 'equal'
        ? 'Lika'
        : mode === 'items'
          ? 'Välj det du beställde'
          : 'Eget belopp';
  const modeSubtitle =
    mode === null
      ? `Att betala: ${formatAmount(remaining, order.currency)}`
      : mode === 'items'
        ? `${itemIndexes.length} rader valda`
        : mode === 'portion'
          ? 'Dra för att välja din del'
          : `${formatAmount(remaining, order.currency)} totalt · ${otherActiveCount > 0 ? `${otherActiveCount} annan betalning pågår` : 'dela jämnt'}`;

  return (
    <main className="flex min-h-dvh flex-col bg-paper pb-10 text-ink">
      <ScreenHeader
        onBack={() =>
          mode === null
            ? navigate(`/t/${slug}/${tableId}?order=${encodeURIComponent(token)}`)
            : setMode(null)
        }
        totalSteps={5}
        step={mode === null ? 1 : 2}
      />

      <div className="px-6 pt-5">
        <h1 className="font-serif-italic text-[30px] font-semibold leading-tight text-ink">
          {modeTitle}
        </h1>
        <p className="mt-1 text-[13px] text-graphite">{modeSubtitle}</p>
      </div>

      <div className="mt-6 px-5">
        {mode === null ? (
          <SplitModeSelector
            value={mode}
            onChange={setMode}
            disabled={createMutation.isPending}
          />
        ) : (
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            {mode === 'equal' ? (
              <SplitEqual
                total={order.total}
                remaining={remaining}
                currency={order.currency}
                parts={equalParts}
                partIndex={equalPartIndex}
                onChangeParts={setEqualParts}
                onChangePartIndex={setEqualPartIndex}
                onComputedAmount={setEqualAmount}
              />
            ) : null}
            {mode === 'portion' ? (
              <SplitPortion
                remaining={remaining}
                currency={order.currency}
                value={portionAmount}
                onChange={setPortionAmount}
              />
            ) : null}
            {mode === 'items' ? (
              <SplitItems
                items={order.items}
                currency={order.currency}
                selected={itemIndexes}
                onChange={setItemIndexes}
                remaining={remaining}
                onComputedAmount={setItemsAmount}
                total={order.total}
              />
            ) : null}
          </motion.div>
        )}
      </div>

      {createMutation.isError ? (
        <div className="mt-6 px-5">
          <SplitErrorNotice error={createMutation.error} />
        </div>
      ) : null}

      {mode !== null ? (
        <div className="mt-8 px-5">
          <Button
            variant="primary"
            size="lg"
            block
            onClick={submit}
            disabled={!canSubmit}
            trailingIcon={<ArrowRight size={18} strokeWidth={2.2} />}
            aria-label={
              activeAmount > 0
                ? `Fortsätt till betalning ${formatAmount(activeAmount, order.currency)}`
                : 'Justera för att fortsätta'
            }
          >
            {createMutation.isPending
              ? 'Startar…'
              : 'Fortsätt'}
          </Button>
        </div>
      ) : null}
    </main>
  );
}

function SplitErrorNotice({ error }: { error: unknown }) {
  const code = (error as { code?: string } | null)?.code;
  // Server returns 422 with BAD_REQUEST when amount > remaining — this is
  // the parallel-splitter collision. Surface it plainly.
  const message =
    code === 'GONE'
      ? 'Notan är redan avslutad.'
      : code === 'NOT_FOUND'
        ? 'Vi hittar inte den här beställningen.'
        : code === 'BAD_REQUEST'
          ? 'Beloppet stämmer inte med det som är kvar på notan. Prova igen — någon annan kan ha betalat samtidigt.'
          : code === 'RATE_LIMITED'
            ? 'För många försök — vänta några sekunder.'
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

function FallbackShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-6 text-ink">
      <Card variant="paper" radius="lg" padding="lg" className="w-full max-w-sm">
        <Stack gap={4}>{children}</Stack>
      </Card>
    </main>
  );
}
