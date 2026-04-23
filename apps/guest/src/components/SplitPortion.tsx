/**
 * SplitPortion — "Eget belopp" picker.
 *
 * Layout matches the mock:
 *   • White card shows "DIN DEL" label + hero serif amount + slider
 *   • Quick-select pills: 1/4, 1/3, 1/2, 2/3 of the remaining
 *   • "Kvar efter din del" helper line
 */

import { useEffect } from 'react';
import { Card, cn } from '@flowpay/ui';

import { formatAmount } from '../lib/format';

export const MIN_PORTION_SEK = 50;
const SLIDER_STEP_SEK = 10;

interface SplitPortionProps {
  remaining: number;
  currency: string;
  value: number;
  onChange: (value: number) => void;
}

export function SplitPortion({
  remaining,
  currency,
  value,
  onChange,
}: SplitPortionProps) {
  useEffect(() => {
    if (value > remaining) {
      onChange(Math.max(MIN_PORTION_SEK, round2(remaining)));
    }
  }, [remaining, value, onChange]);

  const floor = Math.min(MIN_PORTION_SEK, remaining);
  const ceiling = Math.max(MIN_PORTION_SEK, round2(remaining));
  const sliderValue = Math.min(
    Math.max(Math.round(value / SLIDER_STEP_SEK) * SLIDER_STEP_SEK, floor),
    ceiling,
  );

  const presets = [
    { label: '¼', value: round2(remaining / 4) },
    { label: '⅓', value: round2(remaining / 3) },
    { label: '½', value: round2(remaining / 2) },
    { label: '⅔', value: round2((remaining * 2) / 3) },
  ].filter((p) => p.value >= MIN_PORTION_SEK && p.value <= ceiling);

  const leftover = Math.max(0, round2(remaining - value));

  return (
    <div className="space-y-4">
      <Card variant="paper" radius="lg" padding="lg" elevation="raised">
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-graphite">
            Din del
          </div>
          <div className="mt-2 whitespace-nowrap tabular-nums">
            <span className="font-serif text-[48px] font-semibold leading-none text-ink">
              {formatAmount(value, currency, { omitCurrency: true })}
            </span>
            <span className="ml-1 text-[18px] font-normal text-graphite">kr</span>
          </div>
        </div>

        <input
          type="range"
          min={floor}
          max={ceiling}
          step={SLIDER_STEP_SEK}
          value={sliderValue}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-6 w-full accent-ink"
          aria-label="Justera belopp med reglage"
          aria-valuemin={floor}
          aria-valuemax={ceiling}
          aria-valuenow={sliderValue}
        />

        <div className="mt-2 flex justify-between text-[12px] text-graphite">
          <span>{formatAmount(floor, currency)}</span>
          <span>{formatAmount(ceiling, currency)}</span>
        </div>
      </Card>

      {presets.length > 0 ? (
        <div
          role="group"
          aria-label="Snabbval för belopp"
          className="flex flex-wrap gap-2"
        >
          {presets.map(({ label, value: chipValue }) => {
            const active = Math.abs(chipValue - value) < 0.5;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onChange(chipValue)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-[13px] font-medium tabular-nums',
                  'transition-colors',
                  active
                    ? 'border-ink bg-ink text-paper'
                    : 'border-hairline bg-paper text-ink hover:bg-shell',
                )}
              >
                <span className="font-serif mr-1.5 text-[15px]">{label}</span>
                <span>{formatAmount(chipValue, currency, { omitCurrency: true })}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <Card variant="shell" radius="lg" padding="md">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-graphite">Kvar efter din del</span>
          <span className="whitespace-nowrap tabular-nums">
            <span className="text-[15px] font-medium text-ink">
              {formatAmount(leftover, currency, { omitCurrency: true })}
            </span>
            <span className="ml-0.5 text-[11px] font-normal text-graphite">kr</span>
          </span>
        </div>
      </Card>

      {value > remaining + 0.005 ? (
        <p role="alert" className="text-xs text-graphite">
          Beloppet är högre än det som är kvar ({formatAmount(remaining, currency)}).
        </p>
      ) : null}
      {value < MIN_PORTION_SEK && remaining >= MIN_PORTION_SEK ? (
        <p role="alert" className="text-xs text-graphite">
          Minsta belopp är {formatAmount(MIN_PORTION_SEK, currency)}.
        </p>
      ) : null}
    </div>
  );
}

export function isPortionValid(
  value: number,
  remaining: number,
): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (value > remaining + 0.005) return false;
  if (remaining >= MIN_PORTION_SEK && value < MIN_PORTION_SEK) return false;
  return true;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
