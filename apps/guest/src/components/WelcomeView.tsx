import { ArrowRight, Receipt } from 'lucide-react';
import { Button, Card } from '@flowpay/ui';
import type { OrderByTokenResponse } from '@flowpay/schemas';

import { BrandLockup } from './Brand';

/**
 * First-touch bill view. Shown when the guest lands from a QR scan —
 * a warm welcome with the bill summary teased behind a CTA.
 *
 * Clicking "Visa min nota" swaps to the full <BillView /> in the same
 * route (no URL change, so refresh brings them back here).
 */
export function WelcomeView({
  order,
  tableLabel,
  onOpen,
}: {
  order: OrderByTokenResponse;
  tableLabel: string;
  onOpen: () => void;
}) {
  const lineCount = order.items.reduce((n, it) => n + Math.max(1, it.qty), 0);
  const opened = formatTimeOfDay(order.updatedAt);
  return (
    <main className="relative flex min-h-dvh flex-col bg-paper px-6 pb-10 pt-6 text-ink">
      {/* Peach radial glow, upper right. */}
      <div
        aria-hidden="true"
        className="glow-blush pointer-events-none absolute inset-0 -z-0"
      />

      <div className="relative z-10">
        <BrandLockup subline={tableLabel.toUpperCase()} />

        <h1 className="mt-10 font-serif text-[40px] font-light leading-[1.05] text-ink">
          Välkommen till
          <br />
          <span className="font-serif-italic font-semibold">
            {order.restaurant.name}
          </span>
        </h1>

        <p className="mt-4 text-[15px] text-graphite">
          {tableLabel} · Din nota är öppen
        </p>

        <Card variant="paper" radius="lg" padding="md" className="mt-10">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Receipt size={20} strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">
                Din nota
              </div>
              <div className="truncate text-[15px] font-medium text-ink">
                Öppnad {opened} · {lineCount} rader
              </div>
            </div>
            <ArrowRight size={18} className="text-graphite" strokeWidth={1.8} />
          </div>
        </Card>

        <Button
          variant="primary"
          size="lg"
          block
          className="mt-5"
          onClick={onOpen}
          trailingIcon={<ArrowRight size={18} strokeWidth={2.2} />}
        >
          Visa min nota
        </Button>

        <p className="mt-5 text-center text-[13px] text-graphite">
          Inga appar. Inget konto. Bara Swish.
        </p>
      </div>
    </main>
  );
}

/** Render a timestamp as "HH:MM" in Stockholm local time. */
function formatTimeOfDay(iso: string): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Stockholm',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}
