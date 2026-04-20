import { type VariantProps, cva } from 'class-variance-authority';
import { type InputHTMLAttributes, forwardRef } from 'react';

import { cn } from '../cn';

/**
 * Baseline text input.
 *
 * - Min height 56px (same as Button md) so forms line up visually.
 * - Focus-ring uses `--flow-accent`; the border stays hairline so the
 *   focus state reads as the strongest signal on the screen.
 * - No label/helper/error wrappers yet — consumers compose those.
 *   We'll add a `<Field>` primitive when a second input type needs it.
 */
const inputStyles = cva(
  [
    'w-full',
    'bg-paper text-ink',
    'border border-hairline rounded-md',
    'font-sans placeholder:text-graphite',
    'transition-[border-color,box-shadow] duration-150',
    'focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'aria-[invalid=true]:border-accent aria-[invalid=true]:focus-visible:ring-accent/40',
  ],
  {
    variants: {
      size: {
        sm: 'h-11 min-h-[44px] px-3 text-sm',
        md: 'h-14 min-h-[56px] px-4 text-base',
        lg: 'h-16 min-h-[64px] px-5 text-lg',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

type NativeInputSize = InputHTMLAttributes<HTMLInputElement>['size'];
type InputVariantProps = VariantProps<typeof inputStyles>;

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    InputVariantProps {
  /** HTML `size` attribute is renamed to avoid collision with variant size. */
  htmlSize?: NativeInputSize;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, size, htmlSize, ...rest },
  ref,
) {
  return (
    <input ref={ref} size={htmlSize} className={cn(inputStyles({ size }), className)} {...rest} />
  );
});

export { inputStyles };
