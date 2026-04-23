/**
 * Tests for GET /orders/:token.
 *
 * We don't spin up a real Supabase here. We build the server with
 * `buildServer()` and then replace its `fastify.supabase` decorator
 * with a stub that returns whatever the test wants — the route only
 * touches `.rpc('get_order_by_token', ...)` so the stub surface is tiny.
 *
 * Covers the verification bullets from BRIEF-API-002:
 *   [x] giltig token → 200 med korrekt struktur
 *   [x] ogiltig token → 404 (empty RPC result)
 *   [x] malformad token (too short) → 400
 *   [x] closed/paid → 410
 *   [x] rate-limit after 10 req/min
 *   [x] inga interna id:n exponeras (shape-checked by Zod)
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We need to stub env before importing buildServer — the config plugin
// validates env on load.
beforeEach(() => {
  process.env['NODE_ENV'] = 'test';
  process.env['PORT'] = '0';
  process.env['HOST'] = '127.0.0.1';
  process.env['SUPABASE_URL'] = 'https://test.supabase.co';
  process.env['SUPABASE_ANON_KEY'] = 'anon-stub';
  process.env['SUPABASE_SERVICE_KEY'] = 'service-stub';
  process.env['CORS_ORIGINS'] = 'http://localhost:3000';
  process.env['LOG_LEVEL'] = 'silent';
  process.env['ENABLE_POS_SYNC'] = 'false';
});

afterEach(() => {
  vi.restoreAllMocks();
});

type RpcFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

/** Install a stubbed .rpc() that delegates to the given fn. */
function stubRpc(fastify: FastifyInstance, fn: RpcFn): void {
  // The real client has many methods, but the route only touches rpc().
  // Replace just that to keep the stub surface minimal.
  (fastify.supabase as unknown as { rpc: RpcFn }).rpc = fn;
}

/**
 * One happy-path row as the RPC returns it. Matches the column list in
 * migration 0008_restaurant_tip_config.sql (extends 0005_order_by_token_v2).
 */
function goodRow(overrides: Record<string, unknown> = {}) {
  return {
    order_token: 'tok_abc123xyz',
    status: 'open',
    total: 487.5,
    currency: 'SEK',
    items: [
      { name: 'Pilsner', qty: 2, unitPrice: 89, lineTotal: 178 },
      { name: 'Köttbullar', qty: 1, unitPrice: 189, lineTotal: 189 },
      { name: 'Räkmacka', qty: 1, unitPrice: 120.5 },
    ],
    opened_at: '2026-04-23T18:00:00.000Z',
    last_synced_at: '2026-04-23T18:15:30.000Z',
    restaurant_name: 'Restaurang Prinsen',
    restaurant_slug: 'prinsen-sthlm',
    restaurant_logo_url: 'https://cdn.flowpay.se/logos/prinsen.png',
    restaurant_swish_number: '1231231231',
    restaurant_default_tip_percent: 0,
    restaurant_tip_options: [0, 5, 10],
    table_number: '7',
    ...overrides,
  };
}

describe('GET /orders/:token', () => {
  it('returns 200 with the curated shape for a live bill', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    stubRpc(fastify, async () => ({ data: [goodRow()], error: null }));

    const res = await fastify.inject({
      method: 'GET',
      url: '/orders/tok_abc123xyz',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body).toMatchObject({
      id: 'tok_abc123xyz',
      total: 487.5,
      currency: 'SEK',
      status: 'open',
      restaurant: {
        name: 'Restaurang Prinsen',
        slug: 'prinsen-sthlm',
        logoUrl: 'https://cdn.flowpay.se/logos/prinsen.png',
        swishNumber: '1231231231',
        defaultTipPercent: 0,
        tipOptions: [0, 5, 10],
      },
      table: { number: '7' },
    });

    // Items: lineTotal is computed when absent.
    expect(body.items).toHaveLength(3);
    expect(body.items[2]).toEqual({
      name: 'Räkmacka',
      qty: 1,
      unitPrice: 120.5,
      lineTotal: 120.5,
    });

    // Anti-pattern guard: no internal ids in response.
    const flattened = JSON.stringify(body);
    expect(flattened).not.toMatch(/pos_order_id/);
    expect(flattened).not.toMatch(/restaurant_id/);
    expect(flattened).not.toMatch(/credentials/);

    // Cache-Control: no-store
    expect(res.headers['cache-control']).toMatch(/no-store/);

    await fastify.close();
  });

  it('returns 404 when the RPC returns an empty set', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    stubRpc(fastify, async () => ({ data: [], error: null }));

    const res = await fastify.inject({
      method: 'GET',
      url: '/orders/tok_unknown_token_12345',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: 'ORDER_NOT_FOUND' },
    });

    await fastify.close();
  });

  it('returns 400 when the token is too short', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    // Should never reach RPC — stub shouts if called.
    stubRpc(fastify, async () => {
      throw new Error('RPC should not have been called for invalid token');
    });

    const res = await fastify.inject({
      method: 'GET',
      url: '/orders/abc', // < 8 chars
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'INVALID_TOKEN' },
    });

    await fastify.close();
  });

  it('returns 410 when the bill is already paid', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    stubRpc(fastify, async () => ({
      data: [goodRow({ status: 'paid' })],
      error: null,
    }));

    const res = await fastify.inject({
      method: 'GET',
      url: '/orders/tok_already_paid_1',
    });

    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({
      error: { code: 'ORDER_GONE', status: 'paid' },
    });

    await fastify.close();
  });

  it('rate-limits after 10 requests in a minute from the same IP', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    stubRpc(fastify, async () => ({ data: [], error: null }));

    const ip = '203.0.113.42';
    const url = '/orders/tok_rate_limit_test_01';

    // First 10 should pass (404 because RPC returns empty, that's fine).
    for (let i = 0; i < 10; i++) {
      const res = await fastify.inject({
        method: 'GET',
        url,
        headers: { 'x-forwarded-for': ip },
      });
      expect(res.statusCode).toBe(404);
    }

    // 11th within the same minute → rate limit.
    const res = await fastify.inject({
      method: 'GET',
      url,
      headers: { 'x-forwarded-for': ip },
    });
    expect(res.statusCode).toBe(429);

    await fastify.close();
  });

  it('falls back to safe defaults when tip config is missing from the RPC row', async () => {
    // Guards against an older RPC (predating migration 008) still in
    // flight — we must not 502 on missing tip columns, we degrade to the
    // conservative-Swedish defaults.
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    stubRpc(fastify, async () => ({
      data: [
        goodRow({
          restaurant_default_tip_percent: null,
          restaurant_tip_options: null,
        }),
      ],
      error: null,
    }));

    const res = await fastify.inject({
      method: 'GET',
      url: '/orders/tok_missing_tip_cfg',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.restaurant.defaultTipPercent).toBe(0);
    expect(body.restaurant.tipOptions).toEqual([0, 5, 10]);

    await fastify.close();
  });

  it('coerces numeric-as-string tip config and drops malformed entries', async () => {
    // supabase-js occasionally serialises NUMERIC as a string and jsonb
    // elements can arrive as strings too. We accept both, but we drop
    // garbage entries rather than 502.
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    stubRpc(fastify, async () => ({
      data: [
        goodRow({
          restaurant_default_tip_percent: '10',
          restaurant_tip_options: ['0', '5', '12.5', 'bogus', -4, 99],
        }),
      ],
      error: null,
    }));

    const res = await fastify.inject({
      method: 'GET',
      url: '/orders/tok_stringified_nums',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.restaurant.defaultTipPercent).toBe(10);
    // 'bogus', -4 (< 0), 99 (> 30) are dropped. Order of survivors preserved.
    expect(body.restaurant.tipOptions).toEqual([0, 5, 12.5]);

    await fastify.close();
  });

  it('returns 502 when the RPC errors out', async () => {
    const { buildServer } = await import('../server.js');
    const fastify = await buildServer();
    stubRpc(fastify, async () => ({
      data: null,
      error: { message: 'connection refused', code: '08006' },
    }));

    const res = await fastify.inject({
      method: 'GET',
      url: '/orders/tok_db_is_sad__',
    });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      error: { code: 'UPSTREAM_ERROR' },
    });
    // Postgres error text must NOT leak.
    expect(JSON.stringify(res.json())).not.toMatch(/connection refused/);

    await fastify.close();
  });
});
