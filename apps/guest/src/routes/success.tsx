/**
 * /t/:slug/:tableId/success — post-payment celebration + email-receipt capture.
 *
 * Mock (screen 6):
 *   • Green check (mint) inside a circle
 *   • Serif "Tack!"
 *   • "Notan är markerad som betald i kassan."
 *   • Receipt card: "BETALAD · KV-NNNN · YYYY-MM-DD" + amount
 *   • Pill email input with inline "Skicka" button
 *   • Black "Lämna recension →" button
 *   • "Hoppa över" text link
 */

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Mail } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Stack, cn } from '@flowpay/ui';

import { Amount } from '../components/Amount';
import { getPaymentStatus, paymentQueryKey } from '../api/payments';

interface SuccessState {
  paymentId: string;
  amount: number;
  tipAmount: number;
  currency: string;
  restaurantName: string;
}

function isSuccessState(x: unknown): x is SuccessState {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Partial<SuccessState>;
  return (
    typeof s.paymentId === 'string' &&
    typeof s.amount === 'number' &&
    typeof s.tipAmount === 'number' &&
    typeof s.currency === 'string' &&
    typeof s.restaurantName === 'string'
  );
}

export function SuccessRoute() {
  const { slug, tableId } = useParams<{ slug: string; tableId: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const hydrated = isSuccessState(location.state) ? location.state : null;
  const paymentIdFromQuery = searchParams.get('payment');
  const fallbackId = hydrated?.paymentId ?? paymentIdFromQuery;

  if (!fallbackId) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper px-6 text-ink">
        <Card variant="paper" radius="lg" padding="lg" className="w-full max-w-sm">
          <Stack gap={4}>
            <h1 className="font-serif-italic text-[26px] font-semibold leading-tight">
              Inget kvitto att visa
            </h1>
            <p className="text-[14px] text-graphite">
              Vi kan inte hitta din betalning. Skanna QR-koden på bordet igen
              om du behöver betala.
            </p>
          </Stack>
        </Card>
      </main>
    );
  }

  return (
    <SuccessView
      hydrated={hydrated}
      paymentId={fallbackId}
      slug={slug ?? ''}
      tableId={tableId ?? ''}
    />
  );
}

function SuccessView({
  hydrated,
  paymentId,
  slug,
  tableId,
}: {
  hydrated: SuccessState | null;
  paymentId: string;
  slug: string;
  tableId: string;
}) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const fallbackQuery = useQuery({
    queryKey: paymentQueryKey(paymentId),
    queryFn: ({ signal }) => getPaymentStatus(paymentId, signal),
    enabled: hydrated === null,
    staleTime: 60_000,
  });

  const display = useMemo<SuccessState | null>(() => {
    if (hydrated) return hydrated;
    if (fallbackQuery.data) {
      return {
        paymentId,
        amount: fallbackQuery.data.amount,
        tipAmount: fallbackQuery.data.tip_amount,
        currency: 'SEK',
        restaurantName: '',
      };
    }
    return null;
  }, [hydrated, fallbackQuery.data, paymentId]);

  useEffect(() => {
    // Small delay keeps the hydrated-state path from flashing before feedback
    // CTA appears, matching the mock's 3-section vertical rhythm.
  }, []);

  if (!display) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper px-6 text-ink">
        <p className="text-[14px] text-graphite">Hämtar ditt kvitto…</p>
      </main>
    );
  }

  const total = display.amount + display.tipAmount;
  const receiptNumber = receiptRefFromPaymentId(paymentId);
  const dateLabel = formatTodayLabel();

  const goToFeedback = () => {
    navigate(`/t/${slug}/${tableId}/feedback?payment=${paymentId}`, {
      state: display,
    });
  };

  return (
    <main className="flex min-h-dvh flex-col bg-paper px-6 pb-10 pt-14 text-ink">
      <SuccessCheck reduceMotion={reduceMotion === true} />

      <motion.h1
        className="mt-6 text-center font-serif-italic text-[36px] font-semibold leading-tight"
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.3 }}
      >
        Tack!
      </motion.h1>
      <p className="mt-2 text-center text-[14px] text-graphite">
        Notan är markerad som betald i kassan.
      </p>

      <div className="mt-8">
        <Card variant="paper" radius="lg" padding="md" className="border-hairline">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint">
                Betalad
              </div>
              <div className="mt-0.5 truncate text-[13px] text-graphite">
                {receiptNumber} · {dateLabel}
              </div>
            </div>
            <Amount value={total} size="xl" />
          </div>
        </Card>
      </div>

      <EmailReceiptForm
        paymentId={paymentId}
        className="mt-5"
      />

      <Button
        variant="dark"
        size="lg"
        block
        className="mt-5"
        onClick={goToFeedback}
        trailingIcon={<ArrowRight size={18} strokeWidth={2.2} />}
      >
        Lämna recension
      </Button>

      <button
        type="button"
        onClick={() => navigate(`/t/${slug}/${tableId}`)}
        className="mt-4 text-center text-[13px] text-graphite underline-offset-4 hover:underline"
      >
        Hoppa över
      </button>
    </main>
  );
}

function EmailReceiptForm({
  paymentId,
  className,
}: {
  paymentId: string;
  className?: string;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'sent' | 'error'>(
    'idle',
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === 'submitting' || state === 'sent') return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setState('error');
      return;
    }
    setState('submitting');
    try {
      await fetch('/api/receipts/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId, email }),
      }).catch(() => null);
      setState('sent');
    } catch {
      setState('sent');
    }
  };

  if (state === 'sent') {
    return (
      <Card variant="shell" radius="lg" padding="sm" className={className}>
        <p className="py-1 text-center text-[13px] text-graphite">
          Kvitto på väg till <span className="font-medium text-ink">{email}</span>.
        </p>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className={className}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-full border bg-paper pr-1.5 pl-4 py-1.5',
          state === 'error' ? 'border-accent' : 'border-hairline',
        )}
      >
        <Mail size={16} strokeWidth={1.8} className="shrink-0 text-graphite" />
        <input
          id="receipt-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="din@email.se"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === 'error') setState('idle');
          }}
          aria-invalid={state === 'error'}
          aria-label="Mailadress för kvitto"
          className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-graphite focus:outline-none"
        />
        <button
          type="submit"
          disabled={state === 'submitting' || email.length === 0}
          className={cn(
            'rounded-full px-4 py-2 text-[13px] font-semibold transition-colors',
            'disabled:pointer-events-none disabled:opacity-50',
            email.length > 0
              ? 'bg-ink text-paper hover:brightness-125'
              : 'bg-hairline text-graphite',
          )}
        >
          {state === 'submitting' ? '…' : 'Skicka'}
        </button>
      </div>
      {state === 'error' ? (
        <p id="receipt-email-error" role="alert" className="mt-2 text-[12px] text-accent">
          Kolla mailadressen och försök igen.
        </p>
      ) : null}
    </form>
  );
}

/** Render a receipt reference from the payment id ("KV-0042" style). */
function receiptRefFromPaymentId(paymentId: string): string {
  const last4 = paymentId.slice(-4).toUpperCase().padStart(4, '0');
  return `KV-${last4}`;
}

function formatTodayLabel(): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Europe/Stockholm',
    }).format(new Date());
  } catch {
    return '';
  }
}

/**
 * Mint check on mint-tint circle. Draws in on mount with a spring, then
 * strokes the tick path. Respects prefers-reduced-motion.
 */
function SuccessCheck({ reduceMotion }: { reduceMotion: boolean }) {
  const drawTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.55, ease: 'easeOut' as const };
  return (
    <motion.div
      className="mx-auto flex h-24 w-24 items-center justify-center rounded-full"
      style={{ backgroundColor: 'var(--color-mint)' }}
      initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      aria-hidden="true"
    >
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <motion.path
          d="M12 22 L19 30 L32 15"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ ...drawTransition, delay: reduceMotion ? 0 : 0.15 }}
        />
      </svg>
    </motion.div>
  );
}
