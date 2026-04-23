/**
 * Tests for PosUpdateQueueWorker.
 *
 * No real Supabase. We build a tiny stub `adminClient` exposing exactly
 * the surface the worker uses:
 *   - rpc('claim_pos_update_queue_items', ...)
 *   - rpc('complete_pos_update_queue_item', ...)
 *   - rpc('fail_pos_update_queue_item', ...)
 *   - from('pos_integrations').select('type').eq().maybeSingle()
 *
 * Covers the brief's verification matrix:
 *   [x] happy path: claim → markOrderPaid → complete RPC
 *   [x] transient POS error: row goes back to pending with backoff
 *   [x] 5 failures in a row → row finalised as 'failed' + admin notified
 *   [x] idempotent: a "no row" claim is a clean no-op (the DB constraint
 *       enforces single-enqueue, but we also assert the worker never
 *       calls the adapter for empty batches)
 *   [x] orphan integration row → row marked as failed without a POS call
 *   [x] complete-RPC error after a successful POS call → reported as
 *       failure (so the redundant-but-idempotent retry happens)
 */

import { POSAdapterError, type POSProvider, type PosType } from '@flowpay/pos-adapters';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  POS_UPDATE_BACKOFF_MS,
  POS_UPDATE_MAX_ATTEMPTS,
  PosUpdateQueueWorker,
  type ClaimedQueueRow,
} from './pos-update-queue.js';

// ─── helpers ────────────────────────────────────────────────────────────

function silentLogger(): FastifyBaseLogger {
  const noop = () => {};
  // The real Pino logger has many methods; we stub the ones the worker
  // actually calls plus child() so log.child(...) doesn't crash.
  const log = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    silent: noop,
    level: 'silent',
    child() {
      return log;
    },
  };
  return log as unknown as FastifyBaseLogger;
}

interface RpcCall {
  name: string;
  args: unknown;
}

interface FakeClientOptions {
  /** Sequence of claim results. Each call to claim returns the next array (or [] if exhausted). */
  claimResults?: ClaimedQueueRow[][];
  /** Map of integration_id → POS type for the lookup query. */
  integrationTypes?: Record<string, PosType>;
  /** Force the named RPC to error. */
  rpcErrors?: Partial<Record<string, string>>;
}

interface FakeClientResult {
  client: {
    rpc: (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>;
    from: (table: string) => unknown;
  };
  calls: RpcCall[];
}

function makeFakeClient(opts: FakeClientOptions = {}): FakeClientResult {
  const claimQueue = [...(opts.claimResults ?? [])];
  const calls: RpcCall[] = [];

  const rpc = async (
    name: string,
    args: unknown,
  ): Promise<{ data: unknown; error: unknown }> => {
    calls.push({ name, args });

    if (opts.rpcErrors?.[name]) {
      return { data: null, error: { message: opts.rpcErrors[name]! } };
    }

    switch (name) {
      case 'claim_pos_update_queue_items': {
        const next = claimQueue.shift() ?? [];
        return { data: next, error: null };
      }
      case 'complete_pos_update_queue_item':
        return { data: null, error: null };
      case 'fail_pos_update_queue_item': {
        // Mimic the SQL: returns 'failed' if the resulting attempts >= cap.
        // We only need this to drive the notify-admin branch in tests, so
        // tag the result based on a hint embedded in the args.
        const a = args as { p_max_attempts?: number; p_id?: string };
        const isFinal = (a as { __mockFinal?: boolean }).__mockFinal === true;
        return { data: isFinal ? 'failed' : 'pending', error: null };
      }
      default:
        return { data: null, error: { message: `unhandled rpc ${name}` } };
    }
  };

  // Minimal builder used by the worker's lookupPosType: from(...).select(...).eq(...).maybeSingle().
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    let _filterId: string | undefined;
    builder['select'] = () => builder;
    builder['eq'] = (_col: string, val: string) => {
      _filterId = val;
      return builder;
    };
    builder['maybeSingle'] = async () => {
      if (table !== 'pos_integrations') {
        return { data: null, error: null };
      }
      const type = opts.integrationTypes?.[_filterId ?? ''];
      if (!type) {
        return { data: null, error: null };
      }
      return { data: { type }, error: null };
    };
    return builder;
  };

  return { client: { rpc, from }, calls };
}

function fakeRow(overrides: Partial<ClaimedQueueRow> = {}): ClaimedQueueRow {
  return {
    id: 'q-1',
    payment_id: 'pay-1',
    restaurant_id: 'r-1',
    location_id: 'l-1',
    integration_id: 'i-1',
    external_location_id: 'ext-loc-1',
    external_order_id: 'ext-ord-1',
    action: 'mark_paid',
    payload: {
      method: 'swish',
      amount: 250,
      tipAmount: 25,
      reference: 'pay-1',
    },
    attempts: 0,
    ...overrides,
  };
}

function fakeProvider(overrides: Partial<POSProvider> = {}): POSProvider {
  return {
    type: 'onslip',
    authenticate: vi.fn(async () => undefined),
    fetchOpenOrders: vi.fn(async () => []),
    fetchOrder: vi.fn(async () => {
      throw new Error('not used in queue worker tests');
    }),
    markOrderPaid: vi.fn(async () => undefined),
    ...overrides,
  };
}

// ─── tests ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-04-23T18:00:00.000Z') });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('PosUpdateQueueWorker', () => {
  it('happy path: claims a row, calls markOrderPaid, then complete RPC', async () => {
    const provider = fakeProvider();
    const { client, calls } = makeFakeClient({
      claimResults: [[fakeRow()]],
      integrationTypes: { 'i-1': 'onslip' },
    });

    const worker = new PosUpdateQueueWorker({
      // biome-ignore lint/suspicious/noExplicitAny: test stub is intentionally narrow
      adminClient: client as any,
      logger: silentLogger(),
      providerFactory: () => provider,
      credentialsLoader: { load: async () => ({ apiKey: 'test' }) },
    });

    const results = await worker.processOnce();
    expect(results).toEqual([{ id: 'q-1', outcome: 'done' }]);

    expect(provider.authenticate).toHaveBeenCalledWith({ apiKey: 'test' });
    expect(provider.markOrderPaid).toHaveBeenCalledWith('ext-loc-1', 'ext-ord-1', {
      method: 'swish',
      amount: 250,
      tipAmount: 25,
      reference: 'pay-1',
    });
    expect(calls.map((c) => c.name)).toEqual([
      'claim_pos_update_queue_items',
      'complete_pos_update_queue_item',
    ]);
  });

  it('empty batch: never touches the provider', async () => {
    const providerFactory = vi.fn();
    const { client, calls } = makeFakeClient({ claimResults: [[]] });

    const worker = new PosUpdateQueueWorker({
      // biome-ignore lint/suspicious/noExplicitAny: test stub is intentionally narrow
      adminClient: client as any,
      logger: silentLogger(),
      providerFactory: providerFactory as unknown as (t: PosType) => POSProvider,
      credentialsLoader: { load: async () => ({}) },
    });

    const results = await worker.processOnce();
    expect(results).toEqual([]);
    expect(providerFactory).not.toHaveBeenCalled();
    expect(calls.map((c) => c.name)).toEqual(['claim_pos_update_queue_items']);
  });

  it('transient POS error: reports failure with retry backoff (5 s on first failure)', async () => {
    const provider = fakeProvider({
      markOrderPaid: vi.fn(async () => {
        throw new POSAdapterError('UPSTREAM_ERROR', 'POS 503', { retryable: true });
      }),
    });
    const { client, calls } = makeFakeClient({
      claimResults: [[fakeRow({ attempts: 0 })]],
      integrationTypes: { 'i-1': 'onslip' },
    });

    const worker = new PosUpdateQueueWorker({
      // biome-ignore lint/suspicious/noExplicitAny: test stub is intentionally narrow
      adminClient: client as any,
      logger: silentLogger(),
      providerFactory: () => provider,
      credentialsLoader: { load: async () => ({}) },
    });

    const [result] = await worker.processOnce();
    expect(result?.outcome).toBe('retry');
    if (result?.outcome !== 'retry') throw new Error('unreachable');
    expect(result.attempts).toBe(1);
    expect(result.error).toContain('UPSTREAM_ERROR');

    // First failure → 5 s backoff per the brief.
    const expected = new Date(Date.now() + POS_UPDATE_BACKOFF_MS[0]!);
    expect(result.nextAttemptAt.toISOString()).toBe(expected.toISOString());

    const failCall = calls.find((c) => c.name === 'fail_pos_update_queue_item');
    expect(failCall).toBeDefined();
    const args = failCall!.args as { p_next_attempt_at: string; p_max_attempts: number };
    expect(args.p_max_attempts).toBe(POS_UPDATE_MAX_ATTEMPTS);
    expect(args.p_next_attempt_at).toBe(expected.toISOString());
  });

  it('5th failure → finalised as failed and admin is notified', async () => {
    const notifyAdminOnFail = vi.fn();
    const provider = fakeProvider({
      markOrderPaid: vi.fn(async () => {
        throw new Error('still down');
      }),
    });
    // attempts=4 going in → after this failure attempts=5 == cap.
    const row = fakeRow({ attempts: 4 });

    // Tag the fake fail RPC to return 'failed' for this call (drives the
    // notify-admin code path).
    const { client } = makeFakeClient({
      claimResults: [[row]],
      integrationTypes: { 'i-1': 'onslip' },
    });
    // Wrap rpc so that fail_pos_update_queue_item returns 'failed'.
    const realRpc = client.rpc;
    client.rpc = (name: string, args: unknown) => {
      if (name === 'fail_pos_update_queue_item') {
        return realRpc(name, { ...(args as object), __mockFinal: true });
      }
      return realRpc(name, args);
    };

    const worker = new PosUpdateQueueWorker({
      // biome-ignore lint/suspicious/noExplicitAny: test stub is intentionally narrow
      adminClient: client as any,
      logger: silentLogger(),
      providerFactory: () => provider,
      credentialsLoader: { load: async () => ({}) },
      notifyAdminOnFail,
    });

    const [result] = await worker.processOnce();
    expect(result?.outcome).toBe('failed');
    if (result?.outcome !== 'failed') throw new Error('unreachable');
    expect(result.attempts).toBe(POS_UPDATE_MAX_ATTEMPTS);
    expect(notifyAdminOnFail).toHaveBeenCalledTimes(1);
    expect(notifyAdminOnFail).toHaveBeenCalledWith(row, expect.stringContaining('still down'));
  });

  it('orphan integration row: surfaces failure without contacting POS', async () => {
    const provider = fakeProvider();
    const orphan = fakeRow({
      integration_id: '00000000-0000-0000-0000-000000000000',
    });
    const { client } = makeFakeClient({ claimResults: [[orphan]] });

    const worker = new PosUpdateQueueWorker({
      // biome-ignore lint/suspicious/noExplicitAny: test stub is intentionally narrow
      adminClient: client as any,
      logger: silentLogger(),
      providerFactory: () => provider,
      credentialsLoader: { load: async () => ({}) },
    });

    const [result] = await worker.processOnce();
    expect(provider.markOrderPaid).not.toHaveBeenCalled();
    expect(result?.outcome === 'retry' || result?.outcome === 'failed').toBe(true);
    if (result?.outcome === 'retry' || result?.outcome === 'failed') {
      expect(result.error).toContain('integration_id');
    }
  });

  it('complete RPC fails after a successful POS call → row scheduled for retry (markOrderPaid is idempotent)', async () => {
    const provider = fakeProvider();
    const { client, calls } = makeFakeClient({
      claimResults: [[fakeRow()]],
      integrationTypes: { 'i-1': 'onslip' },
      rpcErrors: { complete_pos_update_queue_item: 'transient db blip' },
    });

    const worker = new PosUpdateQueueWorker({
      // biome-ignore lint/suspicious/noExplicitAny: test stub is intentionally narrow
      adminClient: client as any,
      logger: silentLogger(),
      providerFactory: () => provider,
      credentialsLoader: { load: async () => ({}) },
    });

    const [result] = await worker.processOnce();
    expect(provider.markOrderPaid).toHaveBeenCalledOnce();
    expect(result?.outcome).toBe('retry');
    if (result?.outcome !== 'retry') throw new Error('unreachable');
    expect(result.error).toContain('complete-rpc');

    expect(calls.map((c) => c.name)).toEqual([
      'claim_pos_update_queue_items',
      'complete_pos_update_queue_item',
      'fail_pos_update_queue_item',
    ]);
  });
});
