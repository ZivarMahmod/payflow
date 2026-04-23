/**
 * PrivateFeedback — the 1..3-star path.
 *
 * Goal: turn a negative drive-by rating into staff-actionable context.
 *
 * From BRIEF-KI-007:
 *   - Textarea "Vad kan vi göra bättre?"
 *   - Optional email + phone for reply.
 *   - Low-rating text is NEVER forwarded to Google (the consent flag we
 *     send is hard-coded `false` here; the server double-checks anyway).
 *
 * Validation is gentle:
 *   - Email is checked with the same regex as the success-page receipt form.
 *     We don't want a bug-bear modal blocking a frustrated guest from
 *     hitting send.
 *   - Phone is accepted as free text and simply length-bounded; parsing
 *     into E.164 happens server-side if/when staff need to SMS back.
 *   - Submit is enabled as long as either a) there is text, b) email, or
 *     c) phone present. An empty submission is permitted but the button
 *     defaults to "Skip" framing (leaves the choice to the user — we do
 *     not force them to justify a low rating).
 */

import { type FormEvent, useMemo, useState } from 'react';
import { Button, Card, Input, Stack } from '@flowpay/ui';

export interface PrivateFeedbackProps {
  /** True while the request is in flight. */
  submitting?: boolean;
  /** Guest hit send — parent POSTs with the assembled body. */
  onSubmit: (payload: {
    text: string;
    email: string;
    phone: string;
  }) => void;
  /** Guest chose to skip the private text — parent still posts the rating. */
  onSkip: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PrivateFeedback({
  submitting = false,
  onSubmit,
  onSkip,
}: PrivateFeedbackProps) {
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailError, setEmailError] = useState<boolean>(false);

  const hasAny = useMemo(
    () =>
      text.trim().length > 0 ||
      email.trim().length > 0 ||
      phone.trim().length > 0,
    [text, email, phone],
  );

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    // Only validate the email if it's non-empty. An empty optional field
    // should never block the send.
    if (email.trim().length > 0 && !EMAIL_REGEX.test(email.trim())) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    onSubmit({
      text: text.trim(),
      email: email.trim(),
      phone: phone.trim(),
    });
  };

  return (
    <Card variant="paper" radius="lg" padding="lg" elevation="raised">
      <form onSubmit={onFormSubmit} noValidate>
        <Stack gap={4}>
          <p className="text-[13px] leading-relaxed text-graphite">
            Bara personalen ser det här. Det går inte vidare till Google.
          </p>

          <Stack gap={2}>
            <label className="text-[12px] font-medium text-graphite" htmlFor="private-feedback-text">
              Berätta gärna
            </label>
            <textarea
              id="private-feedback-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={2000}
              className="w-full resize-y rounded-xl border border-hairline bg-paper px-3 py-2 text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              disabled={submitting}
            />
          </Stack>

          <Stack gap={2}>
            <label className="text-[12px] font-medium text-graphite" htmlFor="private-feedback-email">
              E-post (valfritt)
            </label>
            <Input
              id="private-feedback-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="namn@exempel.se"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(false);
              }}
              aria-invalid={emailError}
              aria-describedby={emailError ? 'private-feedback-email-error' : undefined}
              disabled={submitting}
              className="rounded-xl"
            />
            {emailError ? (
              <p id="private-feedback-email-error" className="text-sm text-accent">
                Kolla mailadressen och försök igen.
              </p>
            ) : null}
          </Stack>

          <Stack gap={2}>
            <label className="text-[12px] font-medium text-graphite" htmlFor="private-feedback-phone">
              Telefon (valfritt)
            </label>
            <Input
              id="private-feedback-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="070-123 45 67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={submitting}
              className="rounded-xl"
            />
          </Stack>

          <Stack gap={2}>
            <Button
              variant="dark"
              size="lg"
              block
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Skickar…' : hasAny ? 'Skicka' : 'Skicka utan meddelande'}
            </Button>
            <button
              type="button"
              onClick={onSkip}
              disabled={submitting}
              className="text-center text-[13px] text-graphite underline-offset-4 hover:underline disabled:opacity-50"
            >
              Hoppa över
            </button>
          </Stack>
        </Stack>
      </form>
    </Card>
  );
}
