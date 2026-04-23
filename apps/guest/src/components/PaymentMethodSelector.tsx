/**
 * PaymentMethodSelector — which rail will the guest use?
 *
 * MVP: Swish only. Stripe (card) lands in KI-006, at which point this
 * renders as a two-item list. Keeping the component here (rather than
 * inlining into payment.tsx) means the card path slot-in is a pure add —
 * no churn to the route-level layout.
 *
 * UX notes:
 *  - Button, not radio + submit. On mobile the extra "continue" tap is
 *    friction; picking the method IS the confirmation.
 *  - 64px touch targets (size="lg") — thumb-first.
 *  - Future card row will be stacked below, hairline separator between.
 */

import { Button, Stack } from '@flowpay/ui';

import type { PaymentMethod } from '@flowpay/schemas';

interface PaymentMethodSelectorProps {
  /** Called with the chosen method. Triggers the initiate-payment mutation. */
  onSelect: (method: PaymentMethod) => void;
  /** Disable while a mutation is in flight — prevents double-initiation. */
  isSubmitting?: boolean;
  /**
   * External block on submission — e.g. the tip selector reports its
   * custom-input as over-cap (KI-005), or we haven't seeded tip state yet.
   * Kept separate from `isSubmitting` so the button label stays "Betala
   * med Swish" instead of "Startar…" when we're just gating on input.
   */
  disabled?: boolean;
}

export function PaymentMethodSelector({
  onSelect,
  isSubmitting = false,
  disabled = false,
}: PaymentMethodSelectorProps) {
  return (
    <Stack gap={3}>
      <Button
        variant="primary"
        size="lg"
        block
        onClick={() => onSelect('swish')}
        disabled={isSubmitting || disabled}
        aria-label="Betala med Swish"
      >
        {isSubmitting ? 'Startar…' : 'Betala med Swish'}
      </Button>

      {/*
        Card / Stripe placeholder slot — KI-006 will render a second button
        here. Comment kept so the next brief doesn't have to hunt.
      */}
    </Stack>
  );
}
