import type { ReactNode } from 'react';
import { cn } from '@flowpay/ui';
import { Amount } from './Amount';

/**
 * A single row inside a cream summary box: label on the left, amount on
 * the right. Variants cover the "din del / dricks / att betala" pattern
 * where the last row is the emphasis.
 */
export function SummaryRow({
  label,
  sublabel,
  value,
  emphasis,
  className,
}: {
  label: ReactNode;
  sublabel?: ReactNode;
  value: number;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between', className)}>
      <div className={cn('min-w-0', emphasis && 'text-[17px] font-semibold')}>
        <span className={cn(emphasis ? 'text-ink' : 'text-graphite')}>{label}</span>
        {sublabel ? (
          <span className="ml-2 text-[13px] font-normal text-graphite">{sublabel}</span>
        ) : null}
      </div>
      <Amount value={value} size={emphasis ? 'xl' : 'md'} />
    </div>
  );
}
