/**
 * Onslip adapter — implements POSProvider.
 *
 * Mock mode:
 *   - When created with { mock: true } (driven by USE_MOCK_ONSLIP in the
 *     API), the adapter never opens an HTTP connection. It returns the
 *     deterministic fixture from `./mock.ts` and stores the "cycle"
 *     counter on itself so successive calls rotate state.
 *
 * Real mode:
 *   - Expects credentials `{ apiKey, baseUrl? }`. Calls OnslipClient and
 *     maps every response through `mapOnslipOrder`.
 *
 * The shape of `credentials` is adapter-private. The scheduler just
 * forwards whatever Vault gave it.
 */

import {
  POSAdapterError,
  type POSCredentials,
  type POSMarkPaidInput,
  type POSOrder,
  type POSProvider,
  type POSProviderFactory,
  type PosType,
} from '../types.js';
import { OnslipClient } from './client.js';
import { mapOnslipOrder } from './mapper.js';
import { mockOpenOrders, mockOrderById, type MockState } from './mock.js';

const DEFAULT_BASE_URL = 'https://api.onslip.com/v1';

interface OnslipCredentialsShape {
  apiKey: string;
  baseUrl?: string;
}

function parseCredentials(creds: POSCredentials): OnslipCredentialsShape {
  const apiKey = creds['apiKey'];
  if (!apiKey || apiKey.length < 8) {
    throw new POSAdapterError('AUTH_FAILED', 'Onslip credentials missing apiKey', {
      retryable: false,
    });
  }
  const baseUrl = creds['baseUrl'] ?? DEFAULT_BASE_URL;
  return { apiKey, baseUrl };
}

class OnslipAdapter implements POSProvider {
  public readonly type: PosType = 'onslip';

  private client?: OnslipClient;
  private readonly mock: boolean;
  private readonly mockState: MockState = { cycle: 0 };

  constructor(opts: { mock: boolean }) {
    this.mock = opts.mock;
  }

  async authenticate(creds: POSCredentials): Promise<void> {
    if (this.mock) {
      // Accept a placeholder key so onboarding flows still have to "set" something.
      if (!creds['apiKey']) {
        throw new POSAdapterError('AUTH_FAILED', 'Mock Onslip requires a non-empty apiKey', {
          retryable: false,
        });
      }
      return;
    }
    const parsed = parseCredentials(creds);
    this.client = new OnslipClient({ baseUrl: parsed.baseUrl ?? DEFAULT_BASE_URL, apiKey: parsed.apiKey });
    // Light ping — Onslip exposes a /me endpoint that just echoes the account.
    await this.client.get('/me');
  }

  async fetchOpenOrders(externalLocationId: string): Promise<POSOrder[]> {
    if (this.mock) {
      this.mockState.cycle += 1;
      return mockOpenOrders(externalLocationId, this.mockState);
    }
    const client = this.requireClient();
    const raw = await client.get<{ orders: unknown[] }>(
      `/locations/${encodeURIComponent(externalLocationId)}/orders?status=open`,
    );
    if (!Array.isArray(raw.orders)) {
      throw new POSAdapterError('BAD_RESPONSE', 'Onslip: /orders missing `orders[]`', {
        retryable: false,
      });
    }
    return raw.orders.map(mapOnslipOrder);
  }

  async fetchOrder(externalLocationId: string, externalOrderId: string): Promise<POSOrder> {
    if (this.mock) {
      const found = mockOrderById(externalLocationId, externalOrderId, this.mockState);
      if (!found) {
        throw new POSAdapterError('NOT_FOUND', `Mock Onslip: ${externalOrderId}`, {
          retryable: false,
          status: 404,
        });
      }
      return found;
    }
    const client = this.requireClient();
    const raw = await client.get<unknown>(
      `/locations/${encodeURIComponent(externalLocationId)}/orders/${encodeURIComponent(externalOrderId)}`,
    );
    return mapOnslipOrder(raw);
  }

  async markOrderPaid(
    externalLocationId: string,
    externalOrderId: string,
    payment: POSMarkPaidInput,
  ): Promise<void> {
    if (this.mock) {
      // No-op — the next fetchOpenOrders cycle drops the bill from the mock set.
      return;
    }
    const client = this.requireClient();
    await client.post<unknown>(
      `/locations/${encodeURIComponent(externalLocationId)}/orders/${encodeURIComponent(externalOrderId)}/close`,
      {
        payment: {
          method: payment.method === 'swish' ? 'EXTERNAL_SWISH' : 'EXTERNAL_CARD',
          amount: payment.amount,
          tip: payment.tipAmount ?? 0,
          reference: payment.reference,
        },
      },
    );
  }

  async fetchTables(externalLocationId: string): Promise<Array<{ number: string }>> {
    if (this.mock) {
      return [
        { number: '1' },
        { number: '2' },
        { number: '3' },
        { number: '7' },
        { number: '12' },
      ];
    }
    const client = this.requireClient();
    const raw = await client.get<{ tables: Array<{ name?: string; number?: string }> }>(
      `/locations/${encodeURIComponent(externalLocationId)}/tables`,
    );
    return raw.tables
      .map((t) => ({ number: t.number ?? t.name ?? '' }))
      .filter((t) => t.number.length > 0);
  }

  private requireClient(): OnslipClient {
    if (!this.client) {
      throw new POSAdapterError(
        'AUTH_FAILED',
        'Onslip adapter used before authenticate()',
        { retryable: false },
      );
    }
    return this.client;
  }
}

export const onslipFactory: POSProviderFactory = {
  type: 'onslip',
  create: (opts) => new OnslipAdapter({ mock: opts.mock ?? false }),
};

export { OnslipAdapter };
