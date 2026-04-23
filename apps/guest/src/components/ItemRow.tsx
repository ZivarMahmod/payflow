import type { ReactNode } from 'react';
import { cn } from '@flowpay/ui';
import { formatAmount } from '../lib/format';

/**
 * A single bill line as shown on the mocks.
 *
 *   [1×]   Item name              185,00 kr
 *          (optional continuation)
 *   ----dotted divider----
 *
 * The qty chip is rendered as plain text in a fixed-width column so long
 * item names wrap underneath without pushing the price.
 */
export function ItemRow({
  qty,
  name,
  amount,
  subtle,
  leading,
}: {
  qty: number;
  name: string;
  amount: number;
  subtle?: boolean;
  leading?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-4 py-3.5',
        subtle && 'opacity-55',
      )}
    >
      {leading ? <div className="mt-0.5 shrink-0">{leading}</div> : null}

      <div
        aria-hidden="true"
        className="mt-0.5 w-7 shrink-0 text-sm font-medium text-graphite"
      >
        {qty}×
      </div>

      <div className="min-w-0 flex-1 text-[15px] font-semibold leading-tight text-ink">
        {name}
      </div>

      <div className="shrink-0 whitespace-nowrap text-[15px] font-medium tabular-nums text-ink">
        <span>{formatAmount(amount, 'SEK', { omitCurrency: true })}</span>
        <span className="ml-0.5 text-[11px] font-normal text-graphite">kr</span>
      </div>
    </div>
  );
}
