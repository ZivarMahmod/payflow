import { type VariantProps, cva } from 'class-variance-authority';
import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';

import { cn } from '../cn';

/**
 * Button variants.
 *
 * Touch-targets: `md` and `lg` are >= 56px tall — the gäst-PWA is used
 * one-handed at a restaurant table so we never ship buttons that fail
 * Apple HIG 44pt minimum. `sm` is reserved for admin/desktop surfaces.
 */
const buttonStyles = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'font-sans font-medium tracking-tight',
    'rounded-md',
    'transition-[transform,background-color,color,box-shadow] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
    'disabled:pointer-events-none disabled:opacity-50',
    'select-none',
    'active:translate-y-px',
  ],
  {
    variants: {
      variant: {
        primary: ['bg-accent text-paper', 'hover:brightness-110'],
        secondary: ['bg-ink text-paper', 'hover:brightness-125'],
        ghost: ['bg-transparent text-ink', 'hover:bg-hairline/60'],
      },
      size: {
        sm: 'h-11 min-h-[44px] px-4 text-sm',
        md: 'h-14 min-h-[56px] px-6 text-base',
        lg: 'h-16 min-h-[64px] px-8 text-lg',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      block: false,
    },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonStyles>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonStyles>['size']>;

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  /** Optional icon slot rendered before the label. */
  leadingIcon?: ReactNode;
  /** Optional icon slot rendered after the label. */
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, leadingIcon, trailingIcon, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(buttonStyles({ variant, size, block }), className)}
      {...rest}
    >
      {leadingIcon ? <span aria-hidden="true">{leadingIcon}</span> : null}
      <span>{children}</span>
      {trailingIcon ? <span aria-hidden="true">{trailingIcon}</span> : null}
    </button>
  );
});

export { buttonStyles };
