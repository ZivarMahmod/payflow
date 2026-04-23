/**
 * GET /orders/:token — public (unauthenticated) endpoint the guest PWA
 * calls after scanning a table QR code. The `token` is a short-lived
 * opaque identifier for an `orders_cache` row; possession of the token
 * is the only thing that grants read access to that bill.
 *
 * Contract (see packages/schemas/src/order.ts):
 *   200 — bill is live ('open' | 'paying'). Body is `OrderByTokenResponse`.
 *   404 — no row, unknown token, or the RPC filtered it out.
 *   410 — status in ('paid' | 'closed' | 'cancelled'). The bill is gone;
 *         don't let the client keep polling.
 *   429 — rate limited (10 req/min per IP).
 *
 * Why we go through the anon client + `get_order_by_token` RPC:
 *   - The RPC is SECURITY DEFINER STABLE. It returns only the curated
 *     projection below — no internal UUIDs, no POS credentials, no
 *     `restaurant_id` etc. It already filters `status in ('open','paying')`.
 *   - Calling it via the admin (service-role) client would ALSO work but
 *     wouldn't add anything (the RPC only returns safe columns) and would
 *     break the "least privilege" principle. Anon is correct here.
 *   - `execute` on the RPC is explicitly granted to `anon, authenticated`.
 *     That grant is what makes this endpoint safely public.
 *
 * Rate limit: 10/min per IP. Shared bills commonly poll every ~5 s, but
 * the guest app uses realtime (Supabase channel) for live updates rather
 * than polling — so 10/min is plenty for legitimate traffic and cheap
 * enough that one hostile IP can't rack up a bill.
 */

import {
  cachedOrderItemSchema,
  type OrderByTokenResponse,
  orderByTokenResponseSchema,
  type OrderLiveStatus,
  orderTokenParamSchema,
  type TipOptions,
  tipOptionsSchema,
  type TipPercent,
  tipPercentSchema,
} from '@flowpay/schemas';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/**
 * Final "gone" states we short-circuit with 410. Keep this in sync with
 * `order_status` in packages/db/supabase/migrations/0003_orders_cache_payments.sql.
 */
const GONE_STATUSES: ReadonlySet<string> = new Set<OrderLiveStatus>([
  'paid',
  'closed',
]);

const ordersRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get<{
    Params: { token: string };
  }>(
    '/orders/:token',
    {
      // Per-route rate limit overrides the global one in server.ts.
      // Brief: "10 req/min per IP".
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      // 1. Validate the path parameter up front so bogus inputs don't hit
      //    the DB at all. Error here is a typed 400 with a Zod message.
      const parseResult = orderTokenParamSchema.safeParse(request.params.token);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_TOKEN',
            message: 'Order token is malformed.',
          },
        });
      }
      const token = parseResult.data;

      // 2. Call the RPC via the ANON client. RLS + SECURITY DEFINER is doing
      //    the access control — we just relay the projection.
      const { data, error } = await fastify.supabase.rpc('get_order_by_token', {
        p_token: token,
      });

      if (error) {
        request.log.error(
          { err: error, token: `${token.slice(0, 6)}…` },
          'get_order_by_token failed',
        );
        // Don't leak Postgres error text to unauthenticated callers.
        return reply.status(502).send({
          error: {
            code: 'UPSTREAM_ERROR',
            message: 'Order lookup unavailable.',
          },
        });
      }

      const row = Array.isArray(data) ? data[0] : null;

      if (!row) {
        // RPC already filters `status in ('open','paying')`. An empty set
        // can mean (a) unknown token, (b) closed/paid bill, or (c) cancelled.
        // All three collapse to 404 for the guest — no distinction leaks.
        return reply.status(404).send({
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'No live order for this token.',
          },
        });
      }

      // 3. If somehow we got a gone-status row back (e.g. the RPC filter is
      //    loosened in a future migration), surface a 410 rather than 200.
      //    Cheap belt-and-braces.
      if (GONE_STATUSES.has(row.status)) {
        return reply.status(410).send({
          error: {
            code: 'ORDER_GONE',
            message: 'This bill has already been closed or paid.',
            status: row.status,
          },
        });
      }

      // 4. Defensively parse items[] — jsonb is `Json | null` at the type
      //    level. If the POS wrote garbage, we'd rather 500 than ship
      //    unparseable data to the PWA.
      const rawItems = Array.isArray(row.items) ? row.items : [];
      const items: OrderByTokenResponse['items'] = [];
      for (const raw of rawItems) {
        const parsed = cachedOrderItemSchema.safeParse(raw);
        if (!parsed.success) {
          request.log.error(
            { err: parsed.error, token: `${token.slice(0, 6)}…` },
            'orders_cache.items row failed schema parse',
          );
          return reply.status(502).send({
            error: {
              code: 'UPSTREAM_ERROR',
              message: 'Order data malformed.',
            },
          });
        }
        items.push({
          name: parsed.data.name,
          qty: parsed.data.qty,
          unitPrice: parsed.data.unitPrice,
          lineTotal: parsed.data.lineTotal ?? round2(parsed.data.qty * parsed.data.unitPrice),
        });
      }

      // 5. Shape the response. `order_token` round-trips as `id` so the
      //    client can double-check the URL matches what came back.
      //
      //    Tip config (KI-005): DB migration 008 widened the RPC to return
      //    `restaurant_default_tip_percent` + `restaurant_tip_options`. If we
      //    hit an older RPC (or a row was created before the migration ran),
      //    `defaultTipFromRow` / `tipOptionsFromRow` fall back to the same
      //    conservative-Swedish defaults the DB uses ([0, 5, 10], 0%). We
      //    validate with Zod so a corrupt jsonb value produces 502 instead
      //    of crashing the guest PWA's <TipSelector />.
      const defaultTipPercent = coerceTipPercent(
        row.restaurant_default_tip_percent,
      );
      const tipOptions = coerceTipOptions(row.restaurant_tip_options);

      const response: OrderByTokenResponse = {
        id: row.order_token,
        total: Number(row.total),
        currency: row.currency,
        status: row.status as OrderLiveStatus,
        items,
        restaurant: {
          name: row.restaurant_name,
          slug: row.restaurant_slug,
          logoUrl: row.restaurant_logo_url ?? null,
          swishNumber: row.restaurant_swish_number ?? null,
          defaultTipPercent,
          tipOptions,
        },
        table: {
          number: row.table_number ?? null,
        },
        updatedAt: row.last_synced_at,
      };

      // 6. Runtime validate against our own output schema. This catches
      //    drift between DB types and the wire shape before it goes out.
      //    In prod this is effectively a no-op (typed correctly); in dev
      //    it surfaces shape bugs immediately.
      const validated = orderByTokenResponseSchema.safeParse(response);
      if (!validated.success) {
        request.log.error(
          { err: validated.error, token: `${token.slice(0, 6)}…` },
          'response failed self-validation',
        );
        return reply.status(500).send({
          error: { code: 'E_SHAPE', message: 'Response shape mismatch.' },
        });
      }

      // 7. Never cache — bills mutate mid-meal.
      reply.header('Cache-Control', 'no-store, max-age=0');
      return validated.data;
    },
  );
};

/** Two-decimal rounding for SEK. Matches round2() in POS adapters. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Defensive coercion for `restaurants.default_tip_percent`.
 *
 * The column is NUMERIC(5,2) NOT NULL with a CHECK ∈ [0, 30] in migration
 * 008. But supabase-js deserialises NUMERIC to a string on older clients
 * and we also tolerate RPCs predating 008 (undefined). Fall back to 0 —
 * the same DB default — and let the Zod schema reject anything truly off.
 */
function coerceTipPercent(raw: unknown): TipPercent {
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === 'string' ? Number(raw) : (raw as number);
  const parsed = tipPercentSchema.safeParse(n);
  return parsed.success ? parsed.data : 0;
}

/**
 * Defensive coercion for `restaurants.tip_options` (jsonb array).
 *
 * The SQL CHECK only enforces "is an array"; element shape is validated
 * here. On any malformed input we fall back to the DB default. We also
 * filter NaN / non-finite values that a hostile admin API could plant —
 * the guest PWA's TipSelector trusts this array verbatim.
 */
function coerceTipOptions(raw: unknown): TipOptions {
  const fallback: TipOptions = [0, 5, 10];
  if (raw === null || raw === undefined) return fallback;
  if (!Array.isArray(raw)) return fallback;
  // Coerce each element (supabase-js may hand us strings) and filter
  // anything Zod rejects rather than failing the whole response.
  const coerced: number[] = [];
  for (const elem of raw) {
    const n = typeof elem === 'string' ? Number(elem) : elem;
    const parsed = tipPercentSchema.safeParse(n);
    if (parsed.success) coerced.push(parsed.data);
  }
  const arrayParsed = tipOptionsSchema.safeParse(coerced);
  return arrayParsed.success ? arrayParsed.data : fallback;
}

export default ordersRoute;
