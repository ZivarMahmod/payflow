/**
 * SplitEqual — "Lika" picker.
 *
 * Parts chips (2..10) + "Min del" chip row. Consistent visual language
 * with SplitPortion: pill quick-selects, dark selected state, cream
 * summary card with serif per-person amount.
 */

import { useEffect, useMemo } from 'react';
import { Card, cn } from '@flowpay/ui';

import { formatAmount } from '../lib/format';

interface SplitEqualProps {
  total: number;
  remaining: number;
  currency: string;
  parts: number;
  partIndex: number;
  onChangeParts: (value: number) => void;
  onChangePartIndex: (value: number) => void;
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
  const perPerson = useMemo(() => {
    if (parts <= 0) return 0;
    return Math.round((total / parts) * 100) / 100;
  }, [total, parts]);

  useEffect(() => {
    onComputedAmount(perPerson);
  }, [perPerson, onComputedAmount]);

  const wouldOverpay = perPerson > remaining + 0.005;
  const partsOptions = Array.from(
    { length: SPLIT_EQUAL_MAX_PARTS - SPLIT_EQUAL_MIN_PARTS + 1 },
    (_, i) => i + SPLIT_EQUAL_MIN_PARTS,
  );

  return (
    <div className="space-y-4">
      <Card variant="paper" radius="lg" padding="lg" elevation="raised">
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-graphite">
            Din del
          </div>
          <div className="mt-2 whitespace-nowrap tabular-nums">
            <span className="font-serif text-[48px] font-semibold leading-none text-ink">
              {formatAmount(perPerson, currency, { omitCurrency: true })}
            </span>
            <span className="ml-1 text-[18px] font-normal text-graphite">kr</span>
          </div>
          <div className="mt-2 text-[13px] text-graphite">
            {formatAmount(total, currency)} / {parts} personer
          </div>
        </div>
      </Card>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
          Antal personer
        </div>
        <div
          role="radiogroup"
          aria-label="Antal personer"
          className="flex flex-wrap gap-2"
        >
          {partsOptions.map((n) => {
            const active = n === parts;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChangeParts(n)}
                className={cn(
                  'min-w-11 rounded-full border px-4 py-1.5 text-[13px] font-medium tabular-nums transition-colors',
                  active
                    ? 'border-ink bg-ink text-paper'
                    : 'border-hairline bg-paper text-ink hover:bg-shell',
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
          Min del
        </div>
        <div
          role="radiogroup"
          aria-label="Välj vilken del du är"
          className="flex flex-wrap gap-2"
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
                className={cn(
                  'rounded-full border px-4 py-1.5 text-[13px] font-medium tabular-nums transition-colors',
                  active
                    ? 'border-ink bg-ink text-paper'
                    : 'border-hairline bg-paper text-ink hover:bg-shell',
                )}
              >
                {i}/{parts}
              </button>
            );
          })}
        </div>
      </div>

      {wouldOverpay ? (
        <p role="alert" className="text-xs text-graphite">
          Din del överstiger det som är kvar att betala
          ({formatAmount(remaining, currency)}).
        </p>
      ) : null}
    </div>
  );
}

export function isEqualValid(perPerson: number, remaining: number): boolean {
  return (
    Number.isFinite(perPerson) &&
    perPerson > 0 &&
    perPerson <= remaining + 0.005
  );
}
