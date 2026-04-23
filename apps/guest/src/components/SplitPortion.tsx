/**
 * SplitPortion — "Betala en del" picker.
 *
 * Guest picks an arbitrary SEK amount between a floor (MIN_PORTION_SEK)
 * and the current `remaining`. Brief keeps the floor at 50 kr to avoid
 * "1 kr splits" gumming up the Swish queue.
 *
 * UX:
 *   - A range slider snapping to 10 kr plus an editable number input
 *     (`inputmode="decimal"`) for precise amounts.
 *   - Quick-chip shortcuts: 100 / 200 / "kvar/2" / "kvar" so the common
 *     cases don't need the slider at all.
 *   - Overpay protection is belt-and-braces: the slider can't exceed
 *     `remaining`, and we disable submit if the input goes over.
 */

import { useEffect } from 'react';
import { Card, Stack } from '@flowpay/ui';

import { formatAmount } from '../lib/format';

export const MIN_PORTION_SEK = 50;
const SLIDER_STEP_SEK = 10;

interface SplitPortionProps {
  remaining: number;
  currency: string;
  /** Controlled value (decimal SEK). */
  value: number;
  onChange: (value: number) => void;
}

export function SplitPortion({
  remaining,
  currency,
  value,
  onChange,
}: SplitPortionProps) {
  // If the `remaining` drops below the current input (another splitter paid
  // in parallel while this guest was tinkering), nudge the value down.
  useEffect(() => {
    if (value > remaining) {
      onChange(Math.max(MIN_PORTION_SEK, round2(remaining)));
    }
  }, [remaining, value, onChange]);

  const floor = Math.min(MIN_PORTION_SEK, remaining);
  const ceiling = Math.max(MIN_PORTION_SEK, round2(remaining));
  // Snap slider to step, but never above `remaining`.
  const sliderValue = Math.min(
    Math.max(Math.round(value / SLIDER_STEP_SEK) * SLIDER_STEP_SEK, floor),
    ceiling,
  );

  const half = Math.max(MIN_PORTION_SEK, round2(remaining / 2));
  const chips = [100, 200, half, ceiling].filter(
    (v, idx, arr) => v >= MIN_PORTION_SEK && v <= ceiling && arr.indexOf(v) === idx,
  );

  return (
    <Stack gap={4}>
      <Card padding="md">
        <Stack gap={4}>
          <label className="block" htmlFor="split-portion-input">
            <span className="text-sm text-graphite">Belopp</span>
            <div className="mt-1 flex items-baseline gap-2">
              <input
                id="split-portion-input"
                type="number"
                inputMode="decimal"
                min={floor}
                max={ceiling}
                step="0.01"
                value={Number.isFinite(value) ? value : ''}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  if (Number.isFinite(parsed)) {
                    onChange(round2(parsed));
                  }
                }}
                className="w-32 border-b-2 border-hairline bg-transparent pb-1 text-3xl font-semibold tabular-nums outline-none focus:border-accent"
                aria-label="Belopp att betala"
              />
              <span className="text-lg text-graphite">kr</span>
            </div>
          </label>

          <input
            type="range"
            min={floor}
            max={ceiling}
            step={SLIDER_STEP_SEK}
            value={sliderValue}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-accent"
            aria-label="Justera belopp med reglage"
          />

          <div
            role="group"
            aria-label="Snabbval för belopp"
            className="flex flex-wrap gap-2"
          >
            {chips.map((chip) => {
              const active = Math.abs(chip - value) < 0.01;
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onChange(chip)}
                  className={
                    active
                      ? 'rounded-full border border-ink bg-ink px-4 py-1.5 text-xs font-semibold text-paper'
                      : 'rounded-full border border-hairline px-4 py-1.5 text-xs text-ink hover:border-ink'
                  }
                >
                  {formatAmount(chip, currency)}
                </button>
              );
            })}
          </div>
        </Stack>
      </Card>

      {value > remaining + 0.005 ? (
        <p role="alert" className="text-xs text-graphite">
          Beloppet är högre än det som är kvar ({formatAmount(remaining, currency)}).
          Minska beloppet för att fortsätta.
        </p>
      ) : null}
      {value < MIN_PORTION_SEK && remaining >= MIN_PORTION_SEK ? (
        <p role="alert" className="text-xs text-graphite">
          Minsta belopp är {formatAmount(MIN_PORTION_SEK, currency)}.
        </p>
      ) : null}
    </Stack>
  );
}

export function isPortionValid(
  value: number,
  remaining: number,
): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (value > remaining + 0.005) return false;
  // Only enforce the floor when `remaining` itself is above the floor.
  // If the remaining balance is e.g. 37 kr the guest MUST be allowed to
  // pay that final 37 kr even though it's below the 50 kr minimum.
  if (remaining >= MIN_PORTION_SEK && value < MIN_PORTION_SEK) return false;
  return true;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
