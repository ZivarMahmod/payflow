import type { ReactElement } from 'react';

import { Button, type ButtonSize, type ButtonVariant } from './components/Button';
import { Card } from './components/Card';
import { Input } from './components/Input';
import { Stack } from './components/Stack';

/**
 * Minimal showcase / smoke page for the design system.
 *
 * Not a full Storybook (yet). This file gives consumer apps one
 * import they can mount at `/__showcase` during development to
 * eyeball every variant the library ships with.
 *
 *   // apps/guest-pwa/app/__showcase/page.tsx
 *   import { Showcase } from '@flowpay/ui/showcase';
 *   export default function Page() { return <Showcase />; }
 */

const variants: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost'];
const sizes: readonly ButtonSize[] = ['sm', 'md', 'lg'];

export function Showcase(): ReactElement {
  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <Stack as="main" gap={10} className="mx-auto max-w-3xl px-6 py-12">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">FlowPay design system</h1>
          <p className="mt-2 text-graphite">
            Smoke page — every variant rendered once so we notice regressions.
          </p>
        </header>

        <Card>
          <Stack gap={6}>
            <h2 className="text-xl font-semibold">Button — 3 variants × 3 sizes</h2>
            {variants.map((variant) => (
              <Stack key={variant} direction="row" align="center" gap={4} wrap>
                {sizes.map((size) => (
                  <Button key={`${variant}-${size}`} variant={variant} size={size}>
                    {variant} / {size}
                  </Button>
                ))}
              </Stack>
            ))}
          </Stack>
        </Card>

        <Card>
          <Stack gap={4}>
            <h2 className="text-xl font-semibold">Input</h2>
            <Input placeholder="Mobilnummer" inputMode="tel" />
            <Input placeholder="Mejl" type="email" />
            <Input placeholder="Med fel" aria-invalid="true" defaultValue="Fel" />
            <Input placeholder="Inaktiverad" disabled />
          </Stack>
        </Card>

        <Card elevation="raised">
          <Stack gap={3}>
            <h2 className="text-xl font-semibold">Card (raised)</h2>
            <p className="text-graphite">
              Subtil höjning — används sällan. Mest för overlays och betalningsbekräftelser.
            </p>
          </Stack>
        </Card>

        <Card>
          <Stack gap={4}>
            <h2 className="text-xl font-semibold">Stack — row / justify-between</h2>
            <Stack direction="row" justify="between" align="center" gap={4}>
              <span>Delsumma</span>
              <span className="font-mono">429,00 kr</span>
            </Stack>
            <Stack direction="row" justify="between" align="center" gap={4}>
              <span>Moms (12 %)</span>
              <span className="font-mono">46,00 kr</span>
            </Stack>
            <Stack direction="row" justify="between" align="center" gap={4}>
              <span className="font-semibold">Totalt</span>
              <span className="font-mono font-semibold">475,00 kr</span>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </div>
  );
}
