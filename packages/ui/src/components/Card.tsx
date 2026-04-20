import { type VariantProps, cva } from 'class-variance-authority';
import { type HTMLAttributes, forwardRef } from 'react';

import { cn } from '../cn';

/**
 * Surface primitive.
 *
 * Used for the bill, payment confirmation, feedback form, etc.
 * Keep the visual language restrained — Awwwards-level means the
 * hierarchy is established by typography and spacing, not by
 * aggressive shadows or gradients.
 */
const cardStyles = cva(['bg-paper text-ink', 'border border-hairline', 'rounded-lg'], {
  variants: {
    padding: {
      none: 'p-0',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    },
    elevation: {
      flat: '',
      raised: 'shadow-[0_1px_2px_0_rgb(0_0_0_/_0.04),_0_4px_12px_-4px_rgb(0_0_0_/_0.06)]',
    },
  },
  defaultVariants: {
    padding: 'md',
    elevation: 'flat',
  },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardStyles> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, padding, elevation, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn(cardStyles({ padding, elevation }), className)} {...rest}>
      {children}
    </div>
  );
});

export { cardStyles };
