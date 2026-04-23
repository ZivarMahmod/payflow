/**
 * SplitItems — "Välj rader" picker.
 *
 * Checkbox list of bill rows; unselected rows fade to 55%, selected rows
 * stay full-opacity with an orange filled checkbox. A dark "DIN DEL"
 * summary bar hugs the bottom with the running sum.
 */

import { Check } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Card, cn } from '@flowpay/ui';

import type { OrderResponseItem } from '@flowpay/schemas';

import { Amount } from './Amount';
import { formatAmount } from '../lib/format';

interface SplitItemsProps {
  items: OrderResponseItem[];
  currency: string;
  selected: number[];
  onChange: (selected: number[]) => void;
  remaining: number;
  onComputedAmount: (amount: number) => void;
  total?: number;
}

export function SplitItems({
  items,
  currency,
  selected,
  onChange,
  remaining,
  onComputedAmount,
  total,
}: SplitItemsProps) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const computedAmount = useMemo(() => {
    let sum = 0;
    for (const idx of selectedSet) {
      const line = items[idx];
      if (!line) continue;
      sum += line.lineTotal;
    }
    return Math.round(sum * 100) / 100;
  }, [items, selectedSet]);

  useEffect(() => {
    onComputedAmount(computedAmount);
  }, [computedAmount, onComputedAmount]);

  const wouldOverpay = computedAmount > remaining + 0.005;

  const toggle = (idx: number) => {
    const next = new Set(selectedSet);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    onChange([...next].sort((a, b) => a - b));
  };

  return (
    <div className="space-y-4">
      <Card variant="paper" padding="none" radius="lg">
        <ul
          role="group"
          aria-label="Välj vilka rader du betalar för"
          className="px-5"
        >
          {items.map((line, idx) => {
            const active = selectedSet.has(idx);
            return (
              <li
                key={`${line.name}-${idx}`}
                className={idx > 0 ? 'border-t border-dashed border-hairline' : ''}
              >
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  aria-pressed={active}
                  className={cn(
                    'flex w-full items-start gap-4 py-3.5 text-left',
                    'transition-[opacity,background-color] duration-150',
                    !active && 'opacity-55',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                      active
                        ? 'border-accent bg-accent text-white'
                        : 'border-hairline bg-paper',
                    )}
                  >
                    {active ? <Check size={13} strokeWidth={3} /> : null}
                  </span>
                  <span className="mt-0.5 w-7 shrink-0 text-sm font-medium text-graphite">
                    {line.qty}×
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] font-semibold leading-tight text-ink">
                    {line.name}
                  </span>
                  <Amount value={line.lineTotal} size="md" className="shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card variant="dark" padding="md" radius="lg">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Din del
            </div>
            {typeof total === 'number' ? (
              <div className="mt-0.5 text-[12px] text-white/55">
                av {formatAmount(total, currency)}
              </div>
            ) : null}
          </div>
          <span className="whitespace-nowrap tabular-nums">
            <span className="text-[22px] font-serif font-semibold text-white">
              {formatAmount(computedAmount, currency, { omitCurrency: true })}
            </span>
            <span className="ml-0.5 text-[13px] font-normal text-white/60">kr</span>
          </span>
        </div>
        {selected.length === 0 ? (
          <p className="mt-2 text-[12px] text-white/60">
            Markera minst en rad för att fortsätta.
          </p>
        ) : null}
        {wouldOverpay ? (
          <p role="alert" className="mt-2 text-[12px] text-white/80">
            Summan överstiger det som är kvar ({formatAmount(remaining, currency)}).
          </p>
        ) : null}
      </Card>
    </div>
  );
}

export function isItemsValid(
  selected: number[],
  amount: number,
  remaining: number,
): boolean {
  if (selected.length === 0) return false;
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (amount > remaining + 0.005) return false;
  return true;
}
