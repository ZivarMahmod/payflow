/**
 * Minimal Onslip HTTP client.
 *
 * We deliberately use `fetch` (Node 20+) rather than axios — one less
 * dependency and our surface area is tiny (GET /orders, GET /orders/:id,
 * POST /orders/:id/close). When we eventually need interceptors we can
 * revisit.
 *
 * Authentication: `Authorization: Bearer <api-key>` per Onslip's docs.
 * The client never writes to disk — no credential caching.
 */

import { POSAdapterError } from '../types.js';

export interface OnslipClientConfig {
  /** Onslip API base URL. Sandbox and prod use different hosts. */
  baseUrl: string;
  /** API key from the restaurant's Onslip integration settings. */
  apiKey: string;
  /** Per-request timeout in ms. Onslip's p99 is ~2s; we cap at 10s. */
  timeoutMs?: number;
  /** Allow injection of fetch for testability. */
  fetchImpl?: typeof fetch;
}

export class OnslipClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: OnslipClientConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.apiKey = cfg.apiKey;
    this.timeoutMs = cfg.timeoutMs ?? 10_000;
    this.fetchImpl = cfg.fetchImpl ?? globalThis.fetch;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'FlowPay/0.1 (+https://flowpay.se)',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new POSAdapterError('NETWORK_ERROR', `Onslip ${method} ${path} timed out`, {
          retryable: true,
          cause: err,
        });
      }
      throw new POSAdapterError('NETWORK_ERROR', `Onslip ${method} ${path} failed`, {
        retryable: true,
        cause: err,
      });
    }
    clearTimeout(timer);

    if (response.status === 401 || response.status === 403) {
      throw new POSAdapterError('AUTH_FAILED', 'Onslip auth rejected', {
        retryable: false,
        status: response.status,
      });
    }
    if (response.status === 404) {
      throw new POSAdapterError('NOT_FOUND', `Onslip ${path} not found`, {
        retryable: false,
        status: 404,
      });
    }
    if (response.status === 429) {
      throw new POSAdapterError('RATE_LIMITED', 'Onslip rate limit', {
        retryable: true,
        status: 429,
      });
    }
    if (response.status >= 500) {
      throw new POSAdapterError('UPSTREAM_ERROR', `Onslip ${response.status}`, {
        retryable: true,
        status: response.status,
      });
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new POSAdapterError(
        'BAD_RESPONSE',
        `Onslip ${response.status}: ${text.slice(0, 200)}`,
        { retryable: false, status: response.status },
      );
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new POSAdapterError('BAD_RESPONSE', 'Onslip returned non-JSON', {
        retryable: false,
        cause: err,
      });
    }
  }
}
