/**
 * SwishQR — the sanning-ögonblick component.
 *
 * Mock (screen 5): orange "S" chip with SWISH label + amount, a large
 * rounded QR card with the FlowPay F inset in the center, a caption,
 * a to/meddelande info card, and an orange CTA.
 *
 * iOS constraint: the "Öppna Swish" CTA MUST be a real <a href> so iOS
 * treats the tap as a user gesture — deep-link nav from timers/effects
 * silently fails on Safari.
 */

import { Card, buttonStyles, cn } from '@flowpay/ui';

import { FlowpayMark } from './Brand';
import { Amount } from './Amount';

interface SwishQRProps {
  qrDataUrl: string;
  swishUrl: string;
  reference: string;
  amount?: number;
  currency?: string;
  restaurantName?: string;
  tableLabel?: string;
}

export function SwishQR({
  qrDataUrl,
  swishUrl,
  reference,
  amount,
  currency = 'SEK',
  restaurantName,
  tableLabel,
}: SwishQRProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white font-serif text-[22px] font-semibold italic"
        >
          S
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-graphite">
            Swish
          </div>
          {typeof amount === 'number' ? (
            <div className="text-[17px] font-semibold">
              <Amount value={amount} currency={currency} size="lg" />
            </div>
          ) : null}
        </div>
      </div>

      <Card variant="paper" radius="xl" padding="lg" elevation="raised" className="bg-white">
        <div className="relative mx-auto w-full max-w-[280px]">
          <img
            src={qrDataUrl}
            alt="Swish-QR-kod — skanna med en annan mobil"
            width={280}
            height={280}
            className="block h-full w-full rounded-2xl bg-white"
            style={{ imageRendering: 'pixelated' }}
          />
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <FlowpayMark size={56} inverted className="shadow-paper ring-4 ring-white" />
          </div>
        </div>
        <p className="mt-4 text-center text-[13px] text-graphite">
          Skanna QR i Swish, eller tryck Öppna Swish om du betalar från samma telefon.
        </p>
      </Card>

      {restaurantName || tableLabel ? (
        <Card variant="paper" radius="lg" padding="sm">
          {restaurantName ? (
            <div className="flex items-baseline justify-between px-2 py-1">
              <span className="text-[12px] text-graphite">Till</span>
              <span className="text-[14px] font-semibold">{restaurantName}</span>
            </div>
          ) : null}
          {tableLabel ? (
            <div className="flex items-baseline justify-between border-t border-hairline px-2 py-1">
              <span className="text-[12px] text-graphite">Meddelande</span>
              <span className="text-[14px] font-medium tabular-nums">
                FP · {tableLabel}
              </span>
            </div>
          ) : null}
        </Card>
      ) : null}

      <a
        href={swishUrl}
        target="_self"
        rel="noopener"
        aria-label="Öppna Swish-appen för att betala"
        className={cn(buttonStyles({ variant: 'primary', size: 'lg', block: true }))}
      >
        Öppna Swish-appen
      </a>

      <p className="text-center text-[11px] text-graphite">
        Ref: <span className="font-mono tabular-nums">{reference}</span>
      </p>
    </div>
  );
}
