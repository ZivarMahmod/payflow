/**
 * SplitEqual — "Dela lika" picker.
 *
 * Audit-only fields: server computes nothing from `equal_parts`/
 * `equal_part_index`; they just tag `payment_splits.guest_identifier`
 * for reconciliation in the admin dashboard later.
 *
 * UX:
 *   - Parts slider 2..10 (audit max is 20 but the realistic restaurant
 *     case is ≤10; slider length is a UX constraint, not a DB one).
 *   - "Min del" selector visually shows how the parts will divide.
 *   - We clamp the amount to the remaining balance — if the bill has
 *     already been partly paid and per-person > remaining, warn and
 *     disable submit. Stateful partial-pay awareness is the whole point
 *     of KI-004's parallel-splitter safety.
 *
 * Rounding: öre-crumbs (1 kr total / 3 parts = 0.33 each) are *not*
 * collected here — each splitter pays `round(total/N, 2)`. The remainder
 * rides on the last splitter, whom the server reconciles when the
 * /splits call hits the `amount_remaining` check. No clever client code;
 * the server is authoritative.
 */

import { useEffect, useMemo } from 'react';
import { Card, Stack } from '@flowpay/ui';

import { formatAmount } from '../lib/format';

interface SplitEqualProps {
  /** Gross bill total. Shown for context. */
  total: number;
  /** What's still outstanding on the bill (after completed + pending). */
  remaining: number;
  currency: string;
  /** Number of people splitting. 2..10 for the UI, 2..20 accepted server-side. */
  parts: number;
  /** 1-based part the caller claims. */
  partIndex: number;
  onChangeParts: (value: number) => void;
  onChangePartIndex: (value: number) => void;
  /** Caller uses this to wire the final amount into the submit button. */
  onComputedAmount: (amount: number) => void;
}

export const SPLIT_EQUAL_MIN_PARTS = 2;
export const SPLIT_EQUAL_MAX_PARTS = 10;

export function SplitEqual({
  total,
  remaining,
  currency,
  parts,
  partIndex,
  onChangeParts,
  onChangePartIndex,
  onComputedAmount,
}: SplitEqualProps) {
  // Divide the WHOLE total among `parts` people. Each part is round(total/parts, 2).
  // This ignores already-paid portions on purpose — "lika" means equal share
  // of the total bill, not of what's left. The server still rejects if the
  // computed amount exceeds `amount_remaining`.
  const perPerson = useMemo(() => {
    if (parts <= 0) return 0;
    return Math.round((total / parts) * 100) / 100;
  }, [total, parts]);

  // Mirror the computed amount up to the parent when it changes — enables/
  // disables the submit button and populates the POST body.
  useEffect(() => {
    onComputedAmount(perPerson);
  }, [perPerson, onComputedAmount]);

  const wouldOverpay = perPerson > remaining + 0.005;

  return (
    <Stack gap={4}>
      <Card padding="md">
        <Stack gap={3}>
          <label className="block" htmlFor="split-equal-parts">
            <span className="text-sm text-graphite">Antal personer</span>
            <div className="mt-1 flex items-center justify-between gap-3">
              <input
                id="split-equal-parts"
                type="range"
                min={SPLIT_EQUAL_MIN_PARTS}
                max={SPLIT_EQUAL_MAX_PARTS}
                step={1}
                value={parts}
                onChange={(e) => onChangeParts(Number(e.target.value))}
                className="flex-1 accent-accent"
                aria-valuemin={SPLIT_EQUAL_MIN_PARTS}
                aria-valuemax={SPLIT_EQUAL_MAX_PARTS}
                aria-valuenow={parts}
              />
              <span className="min-w-8 text-right text-lg font-semibold tabular-nums">
                {parts}
              </span>
            </div>
          </label>

          <div>
            <p className="text-sm text-graphite">Min del</p>
            <div
              role="radiogroup"
              aria-label="Välj vilken del du är"
              className="mt-2 flex flex-wrap gap-2"
            >
              {Array.from({ length: parts }, (_, i) => i + 1).map((i) => {
                const active = i === partIndex;
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChangePartIndex(i)}
                    className={
                      active
                        ? 'rounded-md border border-ink bg-ink px-3 py-2 text-sm font-semibold text-paper'
                        : 'rounded-md border border-hairline px-3 py-2 text-sm text-ink hover:border-ink'
                    }
                  >
                    {i}/{parts}
                  </button>
                );
              })}
            </div>
          </div>
        </Stack>
      </Card>

      <Card padding="md">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-graphite">Din del</p>
          <p className="text-3xl font-semibold tabular-nums">
            {formatAmount(perPerson, currency)}
          </p>
        </div>
        {wouldOverpay ? (
          <p role="alert" className="mt-2 text-xs text-graphite">
            Din del överstiger det som är kvar att betala
            ({formatAmount(remaining, currency)}). Minska antalet personer
            eller välj &quot;Betala en del&quot; istället.
          </p>
        ) : null}
      </Card>
    </Stack>
  );
}

/** Submit-button disabled-state helper. */
export function isEqualValid(perPerson: number, remaining: number): boolean {
  return (
    Number.isFinite(perPerson) &&
    perPerson > 0 &&
    perPerson <= remaining + 0.005
  );
}
