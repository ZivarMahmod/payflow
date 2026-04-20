/**
 * Import-surface smoke test.
 *
 * This file intentionally touches every symbol exported from the
 * package so that running `tsc --noEmit` over `src/` catches any
 * type-level regression in the public API. It's not a runtime test —
 * it never renders — but it means a consumer app can't be broken by
 * a rename in this package without this file screaming first.
 */

import type { ReactElement } from 'react';

import {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  Card,
  type CardProps,
  Input,
  type InputProps,
  Stack,
  type StackOwnProps,
  buttonStyles,
  cardStyles,
  cn,
  inputStyles,
  stackStyles,
} from '..';
import { Showcase } from '../showcase';

// Type-level surface: force TS to materialize each exported type.
export type _AssertTypes = [
  ButtonProps,
  ButtonVariant,
  ButtonSize,
  InputProps,
  CardProps,
  StackOwnProps<'section'>,
];

// Use every runtime export to verify it's callable in its expected shape.
export function useEverything(): ReactElement {
  const classes = cn(
    'a',
    ['b', 'c'],
    false && 'd',
    buttonStyles({ variant: 'primary', size: 'md' }),
    inputStyles({ size: 'lg' }),
    cardStyles({ padding: 'sm', elevation: 'raised' }),
    stackStyles({ direction: 'row', gap: 4 }),
  );

  return (
    <Stack as="section" className={classes}>
      <Card>
        <Button variant="ghost" size="sm">
          Hi
        </Button>
        <Input placeholder="x" />
      </Card>
      <Showcase />
    </Stack>
  );
}
