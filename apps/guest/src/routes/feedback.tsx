/**
 * /t/:slug/:tableId/feedback?payment=<id> — post-payment feedback flow.
 *
 * State machine (UI only — server is the source of truth on persistence):
 *
 *   rating:   none rated             → show StarRating
 *   decision: rating > 0 && no submit yet
 *             - rating ≥ 4  → GoogleReviewPrompt
 *             - rating ≤ 3  → PrivateFeedback
 *   sending:  request in flight      → forms disabled (in-place)
 *   redirect: high-rating + consent + redirect_url from API-006
 *               → window.location.href = redirect_url (we leave the app)
 *   done:     review submitted, no redirect → thank-you view with "klar"
 *   already:  server returned ALREADY_SUBMITTED → thank-you + gentle note
 *   missing:  no payment id in URL     → friendly fallback
 *
 * Hard rules this route enforces (from BRIEF-KI-007 anti-patterns):
 *   - Skip-knapp alltid synlig — the guest can leave at any point without
 *     penalty or guilt-trip copy.
 *   - NEVER pre-fill the private-feedback text. We render an empty textarea.
 *   - NEVER send low-rating text to Google. The route computes `consent`
 *     from the rating AND the explicit button press; the PrivateFeedback
 *     component never exposes a consent toggle.
 *   - Only ONE review per payment. We rely on the UNIQUE(payment_id)
 *     constraint server-side and gracefully render "du har redan svarat"
 *     when the server says ALREADY_SUBMITTED.
 *
 * Navigation:
 *   - On "klar" → back to root (guests don't have a persistent home in
 *     this PWA; the cleanest exit is "close tab" which the copy hints at).
 *   - On redirect → full `window.location.href` assignment so the browser
 *     owns the external navigation.
 */

import { useMutation } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { useMemo, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { Button, Card, Stack } from '@flowpay/ui';

import type { ReviewSubmitRequest, ReviewSubmitResponse } from '@flowpay/schemas';

import { ApiError } from '../api/client';
import { reviewMutationKey, submitReview } from '../api/reviews';
import { GoogleReviewPrompt } from '../components/GoogleReviewPrompt';
import { PrivateFeedback } from '../components/PrivateFeedback';
import { StarRating } from '../components/StarRating';

/** Router-state shape forwarded from SuccessRoute — optional. */
interface FeedbackLocationState {
  restaurantName?: string;
}

function isFeedbackState(x: unknown): x is FeedbackLocationState {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as FeedbackLocationState;
  return s.restaurantName === undefined || typeof s.restaurantName === 'string';
}

type Phase = 'rating' | 'decision' | 'done' | 'already';

export function FeedbackRoute() {
  const { slug, tableId } = useParams<{ slug: string; tableId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const paymentId = searchParams.get('payment');
  const hydrated = isFeedbackState(location.state) ? location.state : null;
  const restaurantName = hydrated?.restaurantName ?? '';

  const [rating, setRating] = useState<number>(0);
  const [phase, setPhase] = useState<Phase>('rating');

  const mutation = useMutation<
    ReviewSubmitResponse,
    unknown,
    ReviewSubmitRequest
  >({
    mutationKey: paymentId ? reviewMutationKey(paymentId) : ['review', 'none'],
    mutationFn: (body) => submitReview(body),
    onSuccess: (data, variables) => {
      // High-rating + explicit consent + API returned a redirect → leave app.
      if (variables.consent && data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }
      setPhase('done');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        // 409-ish: the server recognised the payment but saw a duplicate.
        // `payload.error.code === 'ALREADY_SUBMITTED'` from API-006.
        const maybeCode = extractErrorCode(err.payload);
        if (maybeCode === 'ALREADY_SUBMITTED') {
          setPhase('already');
          return;
        }
        if (err.code === 'NOT_FOUND') {
          // API-006 not deployed yet → still thank the guest. Their
          // feedback is lost in this state; the night-run sprint plan
          // has API-006 landing immediately after this brief so the
          // window is narrow. Never block the UX on infra readiness.
          setPhase('done');
          return;
        }
      }
      // Any other error — fail soft. The guest has already paid; we don't
      // want to turn feedback into a pit of despair. Log, show done.
      setPhase('done');
    },
  });

  const onGoHome = () => {
    navigate(`/t/${slug ?? ''}/${tableId ?? ''}`, { replace: true });
  };

  // Missing payment id → friendly fallback. Must precede any interactive UI.
  if (!paymentId) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center bg-paper px-4 py-10 text-ink">
        <Card padding="md" className="w-full">
          <Stack gap={4}>
            <h1 className="text-xl font-semibold">Vi saknar ditt kvitto</h1>
            <p className="text-graphite">
              Vi hittar ingen betalning att koppla feedback till. Du kan
              stänga fliken.
            </p>
            <Button variant="ghost" size="md" block onClick={onGoHome}>
              Gå tillbaka
            </Button>
          </Stack>
        </Card>
      </main>
    );
  }

  // ── Main flow ──────────────────────────────────────────────────────────

  const headerCopy = useMemo(() => {
    if (phase === 'done' || phase === 'already') return null;
    if (rating === 0) {
      return {
        title: restaurantName
          ? `Hur var det hos ${restaurantName}?`
          : 'Hur var det?',
        sub: 'Tap-rating, 30 sekunder.',
      };
    }
    return null;
  }, [phase, rating, restaurantName]);

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-paper px-4 py-10 text-ink">
      <Stack gap={6}>
        {headerCopy ? (
          <motion.header
            className="text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <h1 className="text-2xl font-semibold tracking-tight">
              {headerCopy.title}
            </h1>
            <p className="mt-1 text-sm text-graphite">{headerCopy.sub}</p>
          </motion.header>
        ) : null}

        {phase === 'rating' || (phase === 'decision' && rating > 0) ? (
          <StarRating
            value={rating}
            onChange={(r) => {
              setRating(r);
              setPhase('decision');
            }}
            disabled={mutation.isPending}
          />
        ) : null}

        {phase === 'decision' && rating >= 4 ? (
          <GoogleReviewPrompt
            restaurantName={restaurantName}
            submitting={mutation.isPending}
            onConsent={() =>
              mutation.mutate({
                payment_id: paymentId,
                rating: rating as 4 | 5,
                consent: true,
              })
            }
            onDecline={() =>
              mutation.mutate({
                payment_id: paymentId,
                rating: rating as 4 | 5,
                consent: false,
              })
            }
          />
        ) : null}

        {phase === 'decision' && rating > 0 && rating <= 3 ? (
          <PrivateFeedback
            submitting={mutation.isPending}
            onSubmit={({ text, email, phone }) =>
              mutation.mutate({
                payment_id: paymentId,
                rating: rating as 1 | 2 | 3,
                // Low-rating path NEVER ships consent=true.
                consent: false,
                ...(text ? { text } : {}),
                ...(email ? { email } : {}),
                ...(phone ? { phone } : {}),
              })
            }
            onSkip={() =>
              mutation.mutate({
                payment_id: paymentId,
                rating: rating as 1 | 2 | 3,
                consent: false,
              })
            }
          />
        ) : null}

        {phase === 'done' ? (
          <ThankYouCard onDone={onGoHome} title="Tack för att du hörde av dig!" />
        ) : null}

        {phase === 'already' ? (
          <ThankYouCard
            onDone={onGoHome}
            title="Tack, du har redan svarat"
            body="Vi har redan tagit emot din feedback för det här kvittot."
          />
        ) : null}

        {/*
          Skip / close button — always present, never intrusive. Hidden
          on the terminal phases because the card there already owns the
          primary action.
        */}
        {phase === 'rating' || phase === 'decision' ? (
          <Button
            variant="ghost"
            size="md"
            block
            onClick={onGoHome}
            disabled={mutation.isPending}
          >
            Hoppa över
          </Button>
        ) : null}
      </Stack>
    </main>
  );
}

function ThankYouCard({
  title,
  body,
  onDone,
}: {
  title: string;
  body?: string;
  onDone: () => void;
}) {
  return (
    <Card padding="md">
      <Stack gap={4}>
        <header className="text-center">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {body ? <p className="mt-1 text-sm text-graphite">{body}</p> : null}
        </header>
        <Button variant="ghost" size="md" block onClick={onDone}>
          Klar
        </Button>
      </Stack>
    </Card>
  );
}

/**
 * Best-effort extraction of the error-code key from an `ApiError.payload`.
 * The server's envelope is `{ error: { code, message } }` but we're
 * defensive — older handlers and future additions can and will vary.
 */
function extractErrorCode(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const err = (payload as { error?: unknown }).error;
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
