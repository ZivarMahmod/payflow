/**
 * GoogleReviewPrompt — shown when the guest rates 4 or 5.
 *
 * Mock (screen 8):
 *  • 5 orange filled stars (drawn by parent route)
 *  • Serif heading "Vill du dela detta på Google?"
 *  • "Ett tryck. Hjälper små restauranger enormt."
 *  • White card with Google G + tagline + BLACK "Dela på Google" CTA
 *  • "Hoppa över" text link handled by parent
 *
 * We NEVER post on the guest's behalf (Google TOS). Consent redirects them
 * to Google's own review form via `window.location` in the parent.
 */

import { Button, Card, Stack } from '@flowpay/ui';

export interface GoogleReviewPromptProps {
  restaurantName?: string;
  submitting?: boolean;
  onConsent: () => void;
  onDecline: () => void;
}

export function GoogleReviewPrompt({
  submitting = false,
  onConsent,
  onDecline,
}: GoogleReviewPromptProps) {
  return (
    <Stack gap={4}>
      <Card variant="paper" radius="lg" padding="lg" elevation="raised">
        <Stack gap={3}>
          <div className="flex items-center gap-2.5">
            <GoogleGlyph size={22} />
            <span className="text-[14px] font-medium text-ink">
              Google Business Profile
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-graphite">
            Publicerar med ditt namn i Swish. Du kan redigera senare.
          </p>
          <Button
            variant="dark"
            size="lg"
            block
            onClick={onConsent}
            disabled={submitting}
            aria-label="Dela min recension på Google"
            leadingIcon={<GoogleGlyph size={16} />}
          >
            {submitting ? 'Skickar…' : 'Dela på Google'}
          </Button>
        </Stack>
      </Card>

      <button
        type="button"
        onClick={onDecline}
        disabled={submitting}
        className="text-center text-[13px] text-graphite underline-offset-4 hover:underline disabled:opacity-50"
      >
        Hoppa över
      </button>
    </Stack>
  );
}

/** Multi-colour Google G. Small inline asset to avoid a new dep. */
export function GoogleGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.44c-.28 1.48-1.12 2.73-2.38 3.57v2.97h3.85c2.25-2.07 3.55-5.12 3.55-8.78z"
        fill="#4285F4"
      />
      <path
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.85-2.97c-1.07.72-2.44 1.15-4.08 1.15-3.13 0-5.79-2.12-6.74-4.96H1.29v3.07C3.26 21.3 7.31 24 12 24z"
        fill="#34A853"
      />
      <path
        d="M5.26 14.31c-.24-.72-.38-1.49-.38-2.31s.14-1.59.38-2.31V6.62H1.29A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.97-3.07z"
        fill="#FBBC05"
      />
      <path
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.97 3.07C6.21 6.87 8.87 4.75 12 4.75z"
        fill="#EA4335"
      />
    </svg>
  );
}
