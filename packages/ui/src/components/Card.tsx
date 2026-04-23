import { type VariantProps, cva } from 'class-variance-authority';
import { type HTMLAttributes, forwardRef } from 'react';

import { cn } from '../cn';

/**
 * Surface primitive.
 *
 * Variants map to the guest-flow mocks:
 *  - paper    : default cream card with hairline border (bill, split options)
 *  - dark     : black selected state (chosen tip card, split summary "DIN DEL")
 *  - shell    : slightly warmer tint for the footer summary (Din del / Att betala)
 */
const cardStyles = cva(
  ['text-ink'],
  {
    variants: {
      variant: {
        paper: ['bg-paper', 'border border-hairline'],
        dark: ['bg-dark text-white', 'border border-dark'],
        shell: ['bg-shell', 'border border-hairline'],
      },
      padding: {
        none: 'p-0',
        sm: 'p-4',
        md: 'p-5',
        lg: 'p-6',
      },
      elevation: {
        flat: '',
        raised: 'shadow-paper',
        floating: 'shadow-raised',
      },
      radius: {
        md: 'rounded-xl',
        lg: 'rounded-2xl',
        xl: 'rounded-[28px]',
      },
    },
    defaultVariants: {
      variant: 'paper',
      padding: 'md',
      elevation: 'flat',
      radius: 'lg',
    },
  },
);

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardStyles> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant, padding, elevation, radius, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(cardStyles({ variant, padding, elevation, radius }), className)}
      {...rest}
    >
      {children}
    </div>
  );
});

export { cardStyles };
