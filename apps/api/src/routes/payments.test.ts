/**
 * Tests for POST /payments/initiate, GET /payments/:id/status,
 * POST /payments/:id/confirm.
 *
 * Strategy — same as orders.test.ts: buildServer() with env stubbed,
 * then swap `fastify.supabaseAdmin` with a tiny in-memory store. Only
 * the table surface the route touches is stubbed (`orders_cache`,
 * `payments`, `restaurants`). Everything else is a loud throw so we
 * catch accidental reads.
 *
 * Covers the verification bullets from BRIEF-API-003:
 *   [x] initiate with valid token + amount → 201 + swish_url + qr_data_url
 *   [x] initiate with unknown token → 404
 *   [x] initiate against paid/closed bill → 410
 *   [x] initiate with amount > remaining → 409 AMOUNT_MISMATCH
 *   [x] initiate with non-swish method → 400 METHOD_NOT_SUPPORTED
 *   [x] initiate with malformed body → 400 INVALID_REQUEST
 *   [x] status: returns the lifecycle fields for an existing payment
 *   [x] status: 404 when id not found
 *   [x] status: 400 on malformed uuid
 *   [x] confirm without service-role header → 401
 *   [x] confirm an already-completed row → 409
 *   [x] confirm an expired row → 410
 *   [x] confirm happy path → order_marked_paid flips true when bill is funded
 *   [x] confirm partial → order stays open, order_marked_paid=false
 *   [x] responses include Cache-Control: no-store
 *
 * The DB trigger logic (stamp paid_at, call mark_order_paid_if_funded)
 * lives in migration 006; it's covered by hand-review since we can't
 * run Supabase from the sandbox. Instead the stub mimics the trigger
 * (see the `status === 'completed'` branch in `runUpdate`).
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  process.env['NODE_ENV'] = 'test';
  process.env['PORT'] = '0';
  process.env['HOST'] = '127.0.0.1';
  process.env['SUPABASE_URL'] = 'https://test.supabase.co';
  process.env['SUPABASE_ANON_KEY'] = 'anon-stub';
  process.env['SUPABASE_SERVICE_KEY'] = 'service-stub-key-very-long-to-match';
  process.env['CORS_ORIGINS'] = 'http://localhost:3000';
  process.env['LOG_LEVEL'] = 'silent';
  process.env['ENABLE_POS_SYNC'] = 'false';
  process.env['USE_MOCK_SWISH'] = 'true';
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Fake Supabase admin client ───────────────────────────────────────────
//
// The route uses three shapes off `fastify.supabaseAdmin`:
//   .from(t).select(c).eq(col, val).maybeSingle()            // single-or-null read
//   .from(t).select(c).eq(col, val).single()                 // exactly-one read
//   .from(t).select(c).eq(col, val).eq(col2, val2)           // awaited as a list
//   .from(t).insert(row).select(c).single()                  // insert + echo
//   .from(t).update(patch).eq(col, val)                      // fire-and-check-error
//   .from(t).update(patch).eq(col, val).select(c).single()   // update + echo
//
// We build a chainable builder that records filters + returns matching
// rows from an in-memory Map of tables. Every terminal method is async;
// the builder itself is thenable so `await .eq()` resolves to the list.

type Row = Record<string, unknown>;

interface Store {
  orders_cache: Row[];
  payments: Row[];
  restaurants: Row[];
}

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    orders_cache: overrides.orders_cache ?? [],
    payments: overrides.payments ?? [],
    restaurants: overrides.restaurants ?? [],
  };
}

/** Mimic the DB trigger from migration 006 when a payment flips to completed. */
function applyCompletionTrigger(store: Store, row: Row): void {
  if (row['status'] !== 'completed') return;
  row['paid_at'] = new Date().toISOString();
  const ocId = row['order_cache_id'];
  const completedSum = store.payments
    .filter((p) => p['order_cache_id'] === ocId && p['status'] === 'completed')
    .reduce((s, p) => s + Number(p['amount']), 0);
  const order = store.orders_cache.find((o) => o['id'] === ocId);
  if (order && completedSum + 0.005 >= Number(order['total'])) {
    order['status'] = 'paid';
  }
}

function makeAdmin(store: Store): unknown {
  function from(table: keyof Store) {
    const filters: Array<[string, unknown]> = [];
    let pendingUpdate: Row | null = null;
    let mode: 'select' | 'update' = 'select';

    const matches = (): Row[] =>
      store[table].filter((row) =>
        filters.every(([col, val]) => row[col] === val),
      );

    const runUpdate = (): { data: Row[]; error: unknown } => {
      const rows = matches();
      for (const row of rows) {
        Object.assign(row, pendingUpdate ?? {});
        if (table === 'payments') applyCompletionTrigger(store, row);
      }
      return { data: rows, error: null };
    };

    const terminalize = async (): Promise<{ data: unknown; error: unknown }> => {
      if (mode === 'update') return runUpdate();
      return { data: matches(), error: null };
    };

    const builder: Record<string, unknown> = {
      select(_c: string) {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return builder;
      },
      async maybeSingle() {
        const rows = matches();
        if (rows.length === 0) return { data: null, error: null };
        if (rows.length > 1) {
          return {
            data: null,
            error: { message: 'multiple rows', code: '42P10' },
          };
        }
        return { data: rows[0], error: null };
      },
      async single() {
        if (mode === 'update') {
          const { data, error } = runUpdate();
          if (error) return { data: null, error };
          if (data.length !== 1) {
            return {
              data: null,
              error: { message: 'update did not match exactly one row', code: '42P10' },
            };
          }
          return { data: data[0], error: null };
        }
        const rows = matches();
        if (rows.length !== 1) {
          return {
            data: null,
            error: { message: 'not exactly one row', code: '42P10' },
          };
        }
        return { data: rows[0], error: null };
      },
      insert(row: Row) {
        const inserted: Row = {
          id: `uuid-${Math.random().toString(16).slice(2)}`,
          created_at: new Date().toISOString(),
          paid_at: null,
          ...row,
        };
        store[table].push(inserted);
        return {
          select: (_c: string) => ({
            single: async () => ({ data: inserted, error: null }),
          }),
        };
      },
      update(patch: Row) {
        mode = 'update';
        pendingUpdate = patch;
        return builder;
      },
      // Thenable: `await builder` runs the terminal (read list / update).
      then(
        onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return terminalize().then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return {
    from,
    rpc(_name: string, _args: unknown) {
      return Promise.resolve({ data: 0, error: null });
    },
  };
}

function installAdmin(fastify: FastifyInstance, store: Store): Store {
  const admin = makeAdmin(store);
  (fastify as unknown as { supabaseAdmin: unknown }).supabaseAdmin = admin;
  return store;
}

// ─── Seed helpers ─────────────────────────────────────────────────────────

const RESTAURANT = {
  id: 'rest-uuid-0001',
  name: 'Restaurang Prinsen',
  swish_number: '1231231231',
};

const OPEN_ORDER = {
  id: 'oc-uuid-0001',
  restaurant_id: RESTAURANT.id,
  order_token: 'tok_abc123xyz_open',
  total: 487.5,
  status: 'open',
};

const SERVICE_KEY = 'service-stub-key-very-long-to-match';

// ─── Tests ────────────────────────────────────────────────────────────────

describe('POST /payments/initiate', () => {
  it('returns 201 with swish_url + qr_data_url for a live bill', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    installAdmin(
      fastify,
      makeStore({
        orders_cache: [{ ...OPEN_ORDER }],
        restaurants: [{ ...RESTAURANT }],
      }),
    );

    const res = await fastify.inject({
      method: 'POST',
      url: '/payments/initiate',
      payload: {
        order_token: OPEN_ORDER.order_token,
        amount: 100,
        tip_amount: 10,
        method: 'swish',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      method: 'swish',
      swish_url: expect.stringMatching(/^swish:\/\//),
      qr_data_url: expect.stringMatching(/^data:/),
    });
    expect(body.payment_id).toBeTruthy();
    expect(body.reference).toMatch(/^FP-/);
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(res.headers['cache-control']).toMatch(/no-store/);

    await fastify.close();
  });

  it('returns 404 for an unknown order_token', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    installAdmin(fastify, makeStore({ restaurants: [{ ...RESTAURANT }] }));

    const res = await fastify.inject({
      method: 'POST',
      url: '/payments/initiate',
      payload: {
        order_token: 'tok_nope_not_real',
        amount: 100,
        method: 'swish',
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'ORDER_NOT_FOUND' } });
    await fastify.close();
  });

  it('returns 410 when the bill is already paid', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    installAdmin(
      fastify,
      makeStore({
        orders_cache: [{ ...OPEN_ORDER, status: 'paid' }],
        restaurants: [{ ...RESTAURANT }],
      }),
    );

    const res = await fastify.inject({
      method: 'POST',
      url: '/payments/initiate',
      payload: {
        order_token: OPEN_ORDER.order_token,
        amount: 100,
        method: 'swish',
      },
    });

    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ error: { code: 'ORDER_GONE' } });
    await fastify.close();
  });

  it('returns 409 AMOUNT_MISMATCH when amount exceeds remaining balance', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    // Prior completed payment of 400 kr on a 487.50 bill → 87.50 remaining.
    installAdmin(
      fastify,
      makeStore({
        orders_cache: [{ ...OPEN_ORDER }],
        restaurants: [{ ...RESTAURANT }],
        payments: [
          {
            id: 'pay-uuid-prior',
            order_cache_id: OPEN_ORDER.id,
            restaurant_id: RESTAURANT.id,
            amount: 400,
            tip_amount: 0,
            method: 'swish',
            provider: 'swish',
            status: 'completed',
          },
        ],
      }),
    );

    const res = await fastify.inject({
      method: 'POST',
      url: '/payments/initiate',
      payload: {
        order_token: OPEN_ORDER.order_token,
        amount: 200, // > 87.50 remaining
        method: 'swish',
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'AMOUNT_MISMATCH' } });
    await fastify.close();
  });

  it('returns 400 on malformed body (missing amount)', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    installAdmin(fastify, makeStore());

    const res = await fastify.inject({
      method: 'POST',
      url: '/payments/initiate',
      payload: { order_token: OPEN_ORDER.order_token, method: 'swish' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    await fastify.close();
  });

  it('returns 400 METHOD_NOT_SUPPORTED for non-swish methods (cards land in API-005)', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    installAdmin(
      fastify,
      makeStore({
        orders_cache: [{ ...OPEN_ORDER }],
        restaurants: [{ ...RESTAURANT }],
      }),
    );

    const res = await fastify.inject({
      method: 'POST',
      url: '/payments/initiate',
      payload: {
        order_token: OPEN_ORDER.order_token,
        amount: 100,
        method: 'card',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'METHOD_NOT_SUPPORTED' },
    });
    await fastify.close();
  });
});

describe('GET /payments/:id/status', () => {
  it('returns the payment lifecycle fields for an existing row', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    const paymentId = '11111111-2222-3333-4444-555555555555';
    installAdmin(
      fastify,
      makeStore({
        payments: [
          {
            id: paymentId,
            order_cache_id: OPEN_ORDER.id,
            restaurant_id: RESTAURANT.id,
            amount: 100,
            tip_amount: 10,
            method: 'swish',
            status: 'pending',
            paid_at: null,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
      }),
    );

    const res = await fastify.inject({
      method: 'GET',
      url: `/payments/${paymentId}/status`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      payment_id: paymentId,
      status: 'pending',
      amount: 100,
      tip_amount: 10,
      method: 'swish',
    });
    expect(res.headers['cache-control']).toMatch(/no-store/);
    await fastify.close();
  });

  it('returns 404 when the id is not known', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    installAdmin(fastify, makeStore());

    const res = await fastify.inject({
      method: 'GET',
      url: '/payments/00000000-0000-0000-0000-000000000000/status',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'PAYMENT_NOT_FOUND' } });
    await fastify.close();
  });

  it('returns 400 on malformed uuid', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    installAdmin(fastify, makeStore());

    const res = await fastify.inject({
      method: 'GET',
      url: '/payments/not-a-uuid/status',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    await fastify.close();
  });
});

describe('POST /payments/:id/confirm', () => {
  it('returns 401 without a service-role Authorization header', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    const paymentId = 'aaaaaaaa-0000-0000-0000-000000000001';
    installAdmin(
      fastify,
      makeStore({
        orders_cache: [{ ...OPEN_ORDER }],
        payments: [
          {
            id: paymentId,
            order_cache_id: OPEN_ORDER.id,
            restaurant_id: RESTAURANT.id,
            amount: 100,
            tip_amount: 0,
            method: 'swish',
            status: 'pending',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            paid_at: null,
          },
        ],
      }),
    );

    const res = await fastify.inject({
      method: 'POST',
      url: `/payments/${paymentId}/confirm`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    await fastify.close();
  });

  it('returns 409 when the payment is already completed', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    const paymentId = 'aaaaaaaa-0000-0000-0000-000000000002';
    installAdmin(
      fastify,
      makeStore({
        orders_cache: [{ ...OPEN_ORDER, status: 'paid' }],
        payments: [
          {
            id: paymentId,
            order_cache_id: OPEN_ORDER.id,
            restaurant_id: RESTAURANT.id,
            amount: 487.5,
            tip_amount: 0,
            method: 'swish',
            status: 'completed',
            expires_at: null,
            paid_at: new Date().toISOString(),
          },
        ],
      }),
    );

    const res = await fastify.inject({
      method: 'POST',
      url: `/payments/${paymentId}/confirm`,
      headers: { authorization: `Bearer ${SERVICE_KEY}` },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: { code: 'PAYMENT_ALREADY_COMPLETED' },
    });
    await fastify.close();
  });

  it('returns 410 when the payment has already been expired', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    const paymentId = 'aaaaaaaa-0000-0000-0000-000000000003';
    installAdmin(
      fastify,
      makeStore({
        orders_cache: [{ ...OPEN_ORDER }],
        payments: [
          {
            id: paymentId,
            order_cache_id: OPEN_ORDER.id,
            restaurant_id: RESTAURANT.id,
            amount: 100,
            tip_amount: 0,
            method: 'swish',
            status: 'expired',
            expires_at: new Date(Date.now() - 60_000).toISOString(),
            paid_at: null,
          },
        ],
      }),
    );

    const res = await fastify.inject({
      method: 'POST',
      url: `/payments/${paymentId}/confirm`,
      headers: { authorization: `Bearer ${SERVICE_KEY}` },
      payload: {},
    });
    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ error: { code: 'PAYMENT_EXPIRED' } });
    await fastify.close();
  });

  it('flips order to paid when the confirming payment covers the bill', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    const paymentId = 'aaaaaaaa-0000-0000-0000-000000000004';
    const store = installAdmin(
      fastify,
      makeStore({
        orders_cache: [{ ...OPEN_ORDER }],
        payments: [
          {
            id: paymentId,
            order_cache_id: OPEN_ORDER.id,
            restaurant_id: RESTAURANT.id,
            amount: 487.5, // full bill
            tip_amount: 0,
            method: 'swish',
            status: 'pending',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            paid_at: null,
          },
        ],
      }),
    );

    const res = await fastify.inject({
      method: 'POST',
      url: `/payments/${paymentId}/confirm`,
      headers: { authorization: `Bearer ${SERVICE_KEY}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      payment_id: paymentId,
      status: 'completed',
      order_marked_paid: true,
    });
    // Trigger-effect in the fake adapter: the order flipped to paid.
    expect(store.orders_cache[0]?.['status']).toBe('paid');
    expect(res.headers['cache-control']).toMatch(/no-store/);
    await fastify.close();
  });

  it('leaves order open when confirming a partial payment', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    const paymentId = 'aaaaaaaa-0000-0000-0000-000000000005';
    const store = installAdmin(
      fastify,
      makeStore({
        orders_cache: [{ ...OPEN_ORDER }],
        payments: [
          {
            id: paymentId,
            order_cache_id: OPEN_ORDER.id,
            restaurant_id: RESTAURANT.id,
            amount: 100, // partial
            tip_amount: 0,
            method: 'swish',
            status: 'pending',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            paid_at: null,
          },
        ],
      }),
    );

    const res = await fastify.inject({
      method: 'POST',
      url: `/payments/${paymentId}/confirm`,
      headers: { authorization: `Bearer ${SERVICE_KEY}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      payment_id: paymentId,
      status: 'completed',
      order_marked_paid: false,
    });
    // Order stays open — after partial payment it flips to 'paying' (via
    // the initiate best-effort update), which the confirm doesn't touch,
    // but since we never went through /initiate in this test, it's still 'open'.
    expect(store.orders_cache[0]?.['status']).toBe('open');
    await fastify.close();
  });
});
