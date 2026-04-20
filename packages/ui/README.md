# @flowpay/ui

FlowPay's design system: tokens, Tailwind v4 config, and base components.

## What's in the box

- `src/tokens.css` — brand palette, typography, radii, touch-target sizes.
  Tailwind v4 CSS-first config via `@theme`. Dark mode flips the `ink` /
  `paper` pair automatically.
- `tailwind.config.ts` — content paths + preset for consumers that still
  wire Tailwind through a JS config.
- `src/components/{Button,Input,Card,Stack}.tsx` — base primitives,
  styled entirely via tokens. No hardcoded colors.
- `src/showcase.tsx` — minimal smoke page that renders every variant.
  Mount it at `/__showcase` in any consumer app during development.

## Consumer setup (Next.js / Vite)

```css
/* globals.css */
@import 'tailwindcss';
@import '@flowpay/ui/tokens.css';
```

```tsx
import { Button, Card, Stack } from '@flowpay/ui';

export function Bill() {
  return (
    <Card>
      <Stack gap={6}>
        <Button variant="primary" size="lg">Betala 475 kr</Button>
      </Stack>
    </Card>
  );
}
```

Source is published directly (no build step). Consumers transpile via
their own bundler, which gives free hot-reload across the monorepo.

## Rules

- **Never hardcode colors** — always tokens.
- **Never make a new component per variant** — always `cva`.
- **Never import from relative paths between components** — always
  through `@flowpay/ui` (or the local alias a consumer sets up).
