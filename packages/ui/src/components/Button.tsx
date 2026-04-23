import { type VariantProps, cva } from 'class-variance-authority';
import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';

import { cn } from '../cn';

/**
 * Button variants.
 *
 * Touch-targets: `md` and `lg` are >= 56px tall — the gäst-PWA is used
 * one-handed at a restaurant table so we never ship buttons that fail
 * Apple HIG 44pt minimum. `sm` is reserved for admin/desktop surfaces.
 *
 * Variants map to the guest-flow mocks:
 *  - primary  : orange CTA pill, full-bleed, shadow (Betala hela, Fortsätt)
 *  - dark     : black pill (Lämna recension, Dela på Google)
 *  - outline  : white pill with hairline border (Splitta notan)
 *  - ghost    : link-style text (Hoppa över)
 *  - soft     : pale beige chip (quick-select pills 1/4, 1/3, 1/2)
 */
const buttonStyles = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'font-sans font-medium tracking-tight',
    'transition-[transform,background-color,color,box-shadow] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
    'disabled:pointer-events-none disabled:opacity-50',
    'select-none',
    'active:translate-y-px',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-accent text-white rounded-full',
          'shadow-[0_10px_24px_-6px_rgba(244,100,36,0.55)]',
          'hover:brightness-105',
        ],
        dark: [
          'bg-dark text-white rounded-full',
          'hover:brightness-125',
        ],
        outline: [
          'bg-paper text-ink rounded-full',
          'border border-hairline',
          'hover:bg-shell',
        ],
        ghost: [
          'bg-transparent text-graphite rounded-full',
          'hover:bg-hairline/60',
        ],
        soft: [
          'bg-shell text-ink rounded-full',
          'hover:bg-hairline/60',
        ],
      },
      size: {
        sm: 'h-11 min-h-[44px] px-4 text-sm',
        md: 'h-14 min-h-[56px] px-6 text-base',
        lg: 'h-[60px] min-h-[60px] px-8 text-base',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'lg',
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
