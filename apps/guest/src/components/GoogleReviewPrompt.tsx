/**
 * GoogleReviewPrompt — shown when the guest rates 4 or 5.
 *
 * The copy is deliberately short. If we ask "Skulle du dela detta på
 * Google?" in too many words the conversion drops. The guest already
 * made the high-rating decision; we only need to capture their consent
 * to be redirected to Google's own review form (we NEVER post on their
 * behalf — that would violate Google's TOS).
 *
 * Path after consent:
 *   onConsent() → parent calls submitReview({ consent: true })
 *               → API-006 returns redirect_url
 *               → parent `window.location.href = redirect_url`
 *
 * Path without consent:
 *   onDecline() → parent calls submitReview({ consent: false })
 *               → guest sees the thank-you.
 *
 * Anti-patterns this component enforces (from BRIEF-KI-007):
 *   - Nothing is pre-checked. Consent is an explicit action.
 *   - The "Nej tack" button is equal-weight to the consent one, not
 *     buried in a subtle link.
 */

import { Button, Card, Stack } from '@flowpay/ui';

export interface GoogleReviewPromptProps {
  /** Defaults to an empty string — if set, we personalise the copy. */
  restaurantName?: string;
  /** True while the request is in flight — disables both buttons. */
  submitting?: boolean;
  /** User accepted — parent POSTs with consent=true. */
  onConsent: () => void;
  /** User declined — parent POSTs with consent=false. */
  onDecline: () => void;
}

export function GoogleReviewPrompt({
  restaurantName,
  submitting = false,
  onConsent,
  onDecline,
}: GoogleReviewPromptProps) {
  const name = restaurantName?.trim();
  const title = name
    ? `Skulle du dela detta om ${name} på Google?`
    : 'Skulle du dela detta på Google?';
  return (
    <Card padding="md">
      <Stack gap={4}>
        <header className="text-center">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-graphite">
            Hjälper små restauranger enormt. Du skriver själv på Google — vi
            skickar dig bara vidare.
          </p>
        </header>

        <Stack gap={2}>
          <Button
            variant="primary"
            size="md"
            block
            onClick={onConsent}
            disabled={submitting}
            aria-label="Ja, dela min recension på Google"
          >
            {submitting ? 'Skickar…' : 'Ja, dela på Google'}
          </Button>
          <Button
            variant="ghost"
            size="md"
            block
            onClick={onDecline}
            disabled={submitting}
            aria-label="Nej tack, dela inte på Google"
          >
            Nej tack
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
