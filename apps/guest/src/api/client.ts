/**
 * Thin fetch wrapper for the guest PWA.
 *
 * Design notes:
 *  - Base URL comes from `VITE_API_URL`. In dev we expect
 *    `http://localhost:3001`; in prod a Fly.io hostname. We intentionally
 *    don't fall back to `location.origin` — the API is a separate origin
 *    in every environment and we want loud failures if the env is missing.
 *  - Response typing: callers pass a Zod schema they expect. Parse at the
 *    boundary so downstream code doesn't deal with `unknown`.
 *  - Errors: we throw a typed `ApiError` with a stable `code` the UI maps
 *    to copy. `fetch` itself only rejects for network failures, so we
 *    normalise response-level failures too.
 *  - No AbortController wiring here — React Query owns the signal and will
 *    pass one in via the optional `signal` option.
 */

import type { ZodType } from 'zod';

/** Read once at module load; stable for the lifetime of the tab. */
const BASE_URL = (import.meta.env['VITE_API_URL'] as string | undefined)?.replace(
  /\/$/,
  '',
);

if (!BASE_URL && import.meta.env['PROD']) {
  // Fail loud in prod. In dev this can be noise while setting up env files.
  console.error('VITE_API_URL is not set. Guest PWA cannot reach the API.');
}

/**
 * Stable error codes the UI pattern-matches on.
 *
 * - `NETWORK`      — fetch rejected (offline, DNS, CORS, etc.)
 * - `TIMEOUT`      — caller's signal aborted
 * - `NOT_FOUND`    — 404 from API (unknown token)
 * - `GONE`         — 410 (bill is paid/closed — don't keep polling)
 * - `BAD_REQUEST`  — 400 (token malformed — user action mistake)
 * - `RATE_LIMITED` — 429 (client should back off)
 * - `UPSTREAM`     — 502/503 (API is reachable but DB is sad)
 * - `INTERNAL`     — 500 or anything else
 * - `SHAPE`        — response parsed but failed Zod validation
 */
export type ApiErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'GONE'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'UPSTREAM'
  | 'INTERNAL'
  | 'SHAPE';

export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly status?: number;
  /** Opaque extra payload from the server — e.g. the `status` on a 410. */
  public readonly payload?: unknown;

  constructor(code: ApiErrorCode, message: string, status?: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    if (status !== undefined) this.status = status;
    if (payload !== undefined) this.payload = payload;
  }
}

interface RequestOptions<T> {
  /** Zod schema for the expected JSON body. Parsed before return. */
  schema: ZodType<T>;
  /** AbortSignal — React Query passes this automatically from useQuery. */
  signal?: AbortSignal;
  /** Optional request-scoped overrides (headers, etc.). */
  init?: Omit<RequestInit, 'signal'>;
}

const statusToCode = (status: number): ApiErrorCode => {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 404) return 'NOT_FOUND';
  if (status === 410) return 'GONE';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 502 || status === 503 || status === 504) return 'UPSTREAM';
  return 'INTERNAL';
};

export async function apiGet<T>(path: string, options: RequestOptions<T>): Promise<T> {
  return apiRequest<T>('GET', path, options);
}

/**
 * POST a JSON body. Separate function (vs. a verb param on apiGet) so
 * callers can't accidentally send a body on GET or forget it on POST.
 *
 * Contract:
 *  - `body` is serialised via `JSON.stringify`. `undefined` → no body.
 *  - `content-type: application/json` is added unless caller already set one.
 *  - Response envelope + error mapping matches `apiGet` exactly, so React
 *    Query `mutation.onError` handlers can rely on `ApiError.code`.
 */
export async function apiPost<T>(
  path: string,
  body: unknown,
  options: RequestOptions<T>,
): Promise<T> {
  return apiRequest<T>('POST', path, options, body);
}

async function apiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  options: RequestOptions<T>,
  body?: unknown,
): Promise<T> {
  const url = `${BASE_URL ?? ''}${path}`;
  const hasBody = method !== 'GET' && body !== undefined;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      ...options.init,
      headers: {
        accept: 'application/json',
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
        ...options.init?.headers,
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('TIMEOUT', 'Request aborted.');
    }
    throw new ApiError(
      'NETWORK',
      err instanceof Error ? err.message : 'Network error',
    );
  }

  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      // Some proxies return HTML on 5xx — swallow so we still throw a clean error.
    }
    throw new ApiError(
      statusToCode(response.status),
      `${method} ${path} → ${response.status}`,
      response.status,
      payload,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new ApiError('SHAPE', 'Response body was not valid JSON.');
  }

  const parsed = options.schema.safeParse(raw);
  if (!parsed.success) {
    // Don't log the full Zod error in prod — it can include user data.
    if (import.meta.env['DEV']) {
      console.error('Schema parse failed for', path, parsed.error.format());
    }
    throw new ApiError('SHAPE', 'Response shape mismatch.');
  }
  return parsed.data;
}
