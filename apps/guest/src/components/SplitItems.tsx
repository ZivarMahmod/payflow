/**
 * SplitItems — "Välj mina rätter" picker.
 *
 * UX:
 *   - List of every line on the bill, each a tap-target toggle.
 *   - Per-line quantity display stays identical to the bill view so the
 *     guest recognises the layout.
 *   - Selected lines are sum-displayed as the "Din del" big number.
 *
 * Server re-validation:
 *   - The POST body carries `item_indexes` + `amount`. The server re-sums
 *     from the cached `items[]` and rejects mismatches. We still send
 *     `amount` because it's the client's "this is what I think I owe"
 *     intent — useful both as a client-side guard and as a tamper signal
 *     for the server-side log.
 *
 * Accessibility:
 *   - Each row is a button with aria-pressed (see SplitModeSelector for
 *     rationale on choosing buttons over checkboxes).
 *   - High-contrast border when selected; checkmark glyph only as a hint.
 */

import { useEffect, useMemo } from 'react';
import { Card, Stack } from '@flowpay/ui';

import type { OrderResponseItem } from '@flowpay/schemas';

import { formatAmount } from '../lib/format';

interface SplitItemsProps {
  items: OrderResponseItem[];
  currency: string;
  /** Selected 0-based indexes into `items`. Order-independent set. */
  selected: number[];
  onChange: (selected: number[]) => void;
  remaining: number;
  /** Mirror the sum up to the parent so the submit button can show it. */
  onComputedAmount: (amount: number) => void;
}

export function SplitItems({
  items,
  currency,
  selected,
  onChange,
  remaining,
  onComputedAmount,
}: SplitItemsProps) {
  // Use a set for O(1) membership; order doesn't matter server-side
  // because the server sorts before summing.
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
    // Keep ascending order so the POST body is deterministic in logs.
    onChange([...next].sort((a, b) => a - b));
  };

  return (
    <Stack gap={4}>
      <Card padding="none">
        <ul
          role="group"
          aria-label="Välj vilka rader du betalar för"
          className="divide-y divide-hairline"
        >
          {items.map((line, idx) => {
            const active = selectedSet.has(idx);
            return (
              <li key={`${line.name}-${idx}`}>
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  aria-pressed={active}
                  className={
                    active
                      ? 'flex w-full items-center gap-3 bg-ink/5 px-4 py-3 text-left transition-colors'
                      : 'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/5'
                  }
                >
                  <span
                    aria-hidden
                    className={
                      active
                        ? 'flex h-6 w-6 flex-none items-center justify-center rounded-md bg-ink text-paper'
                        : 'flex h-6 w-6 flex-none items-center justify-center rounded-md border border-hairline'
                    }
                  >
                    {active ? '✓' : ''}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{line.name}</span>
                    {line.qty > 1 ? (
                      <span className="block text-sm text-graphite">
                        {line.qty} × {formatAmount(line.unitPrice, currency)}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatAmount(line.lineTotal, currency)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card padding="md">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-graphite">Din del</p>
          <p className="text-3xl font-semibold tabular-nums">
            {formatAmount(computedAmount, currency)}
          </p>
        </div>
        {selected.length === 0 ? (
          <p className="mt-2 text-xs text-graphite">
            Markera minst en rad för att fortsätta.
          </p>
        ) : null}
        {wouldOverpay ? (
          <p role="alert" className="mt-2 text-xs text-graphite">
            Summan överstiger det som är kvar ({formatAmount(remaining, currency)}).
            Avmarkera några rader.
          </p>
        ) : null}
      </Card>
    </Stack>
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
