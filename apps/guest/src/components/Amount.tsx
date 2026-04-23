import { cn } from '@flowpay/ui';
import { formatAmount } from '../lib/format';

/**
 * Amount renderer that keeps the "kr" suffix in a smaller, muted weight
 * — the pattern used on every total in the mocks.
 *
 *   1 234,00 kr    ← "kr" is ~60% the size of the number
 */
export function Amount({
  value,
  currency = 'SEK',
  size = 'md',
  mono = true,
  className,
}: {
  value: number;
  currency?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  mono?: boolean;
  className?: string;
}) {
  const sizeClasses: Record<typeof size, string> = {
    xs: 'text-[11px]',
    sm: 'text-[13px]',
    md: 'text-[15px]',
    lg: 'text-[17px] font-semibold',
    xl: 'text-[22px] font-serif font-semibold',
    hero: 'text-[34px] font-serif font-semibold leading-none',
  } as const;

  const suffixClasses: Record<typeof size, string> = {
    xs: 'text-[9px]',
    sm: 'text-[10px]',
    md: 'text-[11px]',
    lg: 'text-[12px]',
    xl: 'text-[13px]',
    hero: 'text-[15px]',
  } as const;

  return (
    <span className={cn('whitespace-nowrap', mono && 'tabular-nums', className)}>
      <span className={sizeClasses[size]}>
        {formatAmount(value, currency, { omitCurrency: true })}
      </span>
      <span className={cn('ml-0.5 font-normal text-graphite', suffixClasses[size])}>
        kr
      </span>
    </span>
  );
}
