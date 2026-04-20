import { type VariantProps, cva } from 'class-variance-authority';
import {
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactElement,
  type Ref,
  forwardRef,
} from 'react';

import { cn } from '../cn';

/**
 * Flex/grid layout wrapper.
 *
 * Consumes tokens only via utilities — no hardcoded gaps. Accepts a
 * polymorphic `as` so screens can render a semantic `<section>`,
 * `<ul>`, `<nav>` etc. without wrapping.
 */
const stackStyles = cva('flex', {
  variants: {
    direction: {
      row: 'flex-row',
      column: 'flex-col',
      'row-reverse': 'flex-row-reverse',
      'column-reverse': 'flex-col-reverse',
    },
    align: {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      stretch: 'items-stretch',
      baseline: 'items-baseline',
    },
    justify: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
      around: 'justify-around',
      evenly: 'justify-evenly',
    },
    wrap: {
      true: 'flex-wrap',
      false: 'flex-nowrap',
    },
    gap: {
      0: 'gap-0',
      1: 'gap-1',
      2: 'gap-2',
      3: 'gap-3',
      4: 'gap-4',
      5: 'gap-5',
      6: 'gap-6',
      8: 'gap-8',
      10: 'gap-10',
      12: 'gap-12',
      16: 'gap-16',
    },
  },
  defaultVariants: {
    direction: 'column',
    align: 'stretch',
    justify: 'start',
    wrap: false,
    gap: 4,
  },
});

type StackVariants = VariantProps<typeof stackStyles>;

export type StackOwnProps<E extends ElementType> = StackVariants & {
  as?: E;
} & Omit<ComponentPropsWithoutRef<E>, keyof StackVariants | 'as'>;

type StackComponent = <E extends ElementType = 'div'>(
  props: StackOwnProps<E> & { ref?: Ref<HTMLElement> },
) => ReactElement | null;

export const Stack = forwardRef(function Stack<E extends ElementType = 'div'>(
  { as, className, direction, align, justify, wrap, gap, ...rest }: StackOwnProps<E>,
  ref: Ref<HTMLElement>,
) {
  const Component = (as ?? 'div') as ElementType;
  return (
    <Component
      ref={ref}
      className={cn(stackStyles({ direction, align, justify, wrap, gap }), className)}
      {...rest}
    />
  );
}) as unknown as StackComponent;

export { stackStyles };
