/**
 * OrderError — error state with retry + copy tuned per error code.
 *
 * The component maps `ApiError.code` values to user-facing copy. We
 * intentionally keep copy warm and actionable, even when the root cause
 * is our fault — a guest mid-meal doesn't care about HTTP status codes.
 */

import { Button, Card, Stack } from '@flowpay/ui';

import type { ApiError, ApiErrorCode } from '../api/client';

interface OrderErrorProps {
  error: unknown;
  onRetry?: () => void;
  /** When true, the retry button shows a spinner and is disabled. */
  isRetrying?: boolean;
}

interface ErrorCopy {
  title: string;
  body: string;
  /** Some errors (410, 404) cannot be fixed by retry. Hide the button. */
  retryable: boolean;
}

const COPY: Record<ApiErrorCode, ErrorCopy> = {
  NETWORK: {
    title: 'Ingen uppkoppling',
    body: 'Vi når inte internet just nu. Kolla Wi-Fi:n eller mobildata och försök igen.',
    retryable: true,
  },
  TIMEOUT: {
    title: 'Det tog för lång tid',
    body: 'Servern svarar långsamt. Prova igen om en stund.',
    retryable: true,
  },
  NOT_FOUND: {
    title: 'Notan hittades inte',
    body: 'Vi kan inte hitta den här beställningen. Den kan ha stängts — ropa på personalen om du tror det är fel.',
    retryable: false,
  },
  GONE: {
    title: 'Notan är redan avslutad',
    body: 'Det ser ut som att den här notan redan har betalats eller stängts.',
    retryable: false,
  },
  BAD_REQUEST: {
    title: 'Ogiltig QR-kod',
    body: 'Koden verkar skadad. Be personalen skriva ut en ny.',
    retryable: false,
  },
  RATE_LIMITED: {
    title: 'För många försök',
    body: 'Vänta en stund och försök igen.',
    retryable: true,
  },
  UPSTREAM: {
    title: 'Något strular hos oss',
    body: 'Vi jobbar på det. Försök igen om en liten stund.',
    retryable: true,
  },
  INTERNAL: {
    title: 'Något gick fel',
    body: 'Vi hann inte hämta din nota just nu. Försök igen.',
    retryable: true,
  },
  SHAPE: {
    title: 'Oväntat svar',
    body: 'Notan gick inte att läsa. Ropa på personalen och be oss fixa det.',
    retryable: false,
  },
};

const FALLBACK: ErrorCopy = {
  title: 'Något gick fel',
  body: 'Försök igen, eller ropa på personalen om det fortsätter.',
  retryable: true,
};

function pickCopy(error: unknown): ErrorCopy {
  const code = extractCode(error);
  if (code && code in COPY) return COPY[code];
  return FALLBACK;
}

function extractCode(error: unknown): ApiErrorCode | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const maybe = error as Partial<ApiError>;
  return maybe.code;
}

export function OrderError({ error, onRetry, isRetrying = false }: OrderErrorProps) {
  const copy = pickCopy(error);

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md items-center bg-paper px-4 py-10 text-ink"
      role="alert"
      aria-live="assertive"
    >
      <Card padding="md" className="w-full">
        <Stack gap={4}>
          <div>
            <h1 className="text-xl font-semibold">{copy.title}</h1>
            <p className="mt-2 text-graphite">{copy.body}</p>
          </div>

          {copy.retryable && onRetry ? (
            <Button
              variant="primary"
              size="md"
              block
              onClick={onRetry}
              disabled={isRetrying}
              aria-label="Försök hämta nota igen"
            >
              {isRetrying ? 'Försöker igen…' : 'Försök igen'}
            </Button>
          ) : null}
        </Stack>
      </Card>
    </main>
  );
}
