/**
 * Splits routes — powers BRIEF-KI-004's split-payment flow.
 *
 *   POST /splits/:order_token  — create a pending Swish payment for a
 *                                specific portion of the bill. Returns the
 *                                same shape as /payments/initiate so the
 *                                guest PWA can hand the payment_id straight
 *                                to payment.tsx without a second round-trip.
 *
 *   GET  /splits/:order_token  — live status snapshot for the split UI:
 *                                total, already-completed, already-pending,
 *                                remaining. Polled every few seconds by the
 *                                /split route so all parallel sessions see
 *                                the same "X kr av Y kr kvar" in near
 *                                real-time.
 *
 * Why a dedicated route instead of reusing /payments/initiate?
 *   - /payments/initiate only guards against *completed* payments when
 *     computing remaining; that is safe for single-payer flows (no one
 *     else is racing), but two guests running "equal 2" splits could both
 *     pass its check and over-subscribe the bill.
 *   - /splits/:order_token reserves against both completed AND pending
 *     payments so the second request rejects cleanly.
 *   - The split endpoint also records a `payment_splits` audit row with
 *     a human-readable label ("equal 2/4", "items 0,3,5") for later
 *     reconciliation in the admin dashboard.
 *
 * Anti-patterns enforced (from BRIEF-KI-004):
 *   - NEVER allow overpayment — every create reserves against pending too.
 *   - NEVER lock the whole order during a split — the check is a SELECT,
 *     no advisory lock. Parallel guests coexist; the 3-minute Swish
 *     expiry is the self-healing mechanism for abandoned splits.
 */

import {
  paymentInitiateSwishResponseSchema,
  splitCreateRequestSchema,
  splitStatusResponseSchema,
  type SplitStatusResponse,
} from '@flowpay/schemas';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import {
  buildSwishMessage,
  generateReference,
  makeSwishProvider,
  type SwishProvider,
} from '../services/swish.js';

/** Matches SWISH_EXPIRES_MS in routes/payments.ts — keep them in sync. */
const SWISH_EXPIRES_MS = 3 * 60_000;

/** Token bounds match orderTokenParamSchema (`packages/schemas/src/order.ts`). */
const TOKEN_MIN_LEN = 8;
const TOKEN_MAX_LEN = 256;

/** Decimal epsilon for NUMERIC(10,2) round-trip slop. */
const AMOUNT_EPSILON = 0.005;

const splitsRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const swish: SwishProvider = makeSwishProvider(fastify.config.USE_MOCK_SWISH);

  // ── POST /splits/:order_token ──────────────────────────────────────────
  fastify.post<{ Params: { order_token: string } }>(
    '/splits/:order_token',
    {
      // Tighter than global 300/min — split creation is a write; 30/min/IP
      // is enough for a realistic table of 4-6 guests all splitting.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const token = request.params.order_token;
      if (
        typeof token !== 'string' ||
        token.length < TOKEN_MIN_LEN ||
        token.length > TOKEN_MAX_LEN
      ) {
        return reply.status(400).send({
          error: { code: 'INVALID_REQUEST', message: 'Invalid order token.' },
        });
      }

      const parsed = splitCreateRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'INVALID_REQUEST', message: 'Invalid split request.' },
        });
      }
      const body = parsed.data;

      if (body.method !== 'swish') {
        return reply.status(400).send({
          error: {
            code: 'METHOD_NOT_SUPPORTED',
            message: `Method '${body.method}' is not yet supported.`,
          },
        });
      }

      // 1. Load order by token.
      const { data: orderRow, error: orderErr } = await fastify.supabaseAdmin
        .from('orders_cache')
        .select('id, restaurant_id, total, status, order_token, items, currency')
        .eq('order_token', token)
        .maybeSingle();

      if (orderErr) {
        request.log.error(
          { err: orderErr, token: `${token.slice(0, 6)}…` },
          'splits.create: order lookup failed',
        );
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Order lookup unavailable.' },
        });
      }
      if (!orderRow) {
        return reply.status(404).send({
          error: { code: 'ORDER_NOT_FOUND', message: 'No order for that token.' },
        });
      }
      if (orderRow.status === 'paid' || orderRow.status === 'closed') {
        return reply.status(410).send({
          error: { code: 'ORDER_GONE', message: 'Bill is already closed or paid.' },
        });
      }

      // 2. Balance check — against BOTH completed and pending rows so
      //    parallel splitters can't over-subscribe. The 3-min expiry of
      //    pending rows self-heals if a guest abandons.
      const { data: paymentRows, error: pErr } = await fastify.supabaseAdmin
        .from('payments')
        .select('amount, status')
        .eq('order_cache_id', orderRow.id)
        .in('status', ['pending', 'completed']);
      if (pErr) {
        request.log.error({ err: pErr }, 'splits.create: balance lookup failed');
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Ledger lookup failed.' },
        });
      }
      let alreadyPaid = 0;
      let alreadyPending = 0;
      for (const r of paymentRows ?? []) {
        const amt = Number(r.amount);
        if (r.status === 'completed') alreadyPaid += amt;
        else if (r.status === 'pending') alreadyPending += amt;
      }
      const total = Number(orderRow.total);
      const remaining = total - alreadyPaid - alreadyPending;
      if (body.amount > remaining + AMOUNT_EPSILON) {
        return reply.status(409).send({
          error: {
            code: 'AMOUNT_MISMATCH',
            message:
              'Amount exceeds remaining balance (including pending splits).',
          },
        });
      }

      // 3. Mode-specific validation. `items` is the only mode where the
      //    server re-derives the amount from selected indexes and
      //    cross-checks it against body.amount. equal/portion already
      //    did the math client-side — the balance check above is enough.
      if (body.type === 'items') {
        if (!body.item_indexes || body.item_indexes.length === 0) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_REQUEST',
              message: 'items split requires a non-empty item_indexes[].',
            },
          });
        }
        const itemsArr = Array.isArray(orderRow.items)
          ? (orderRow.items as Array<{
              qty?: number;
              unitPrice?: number;
              lineTotal?: number;
            }>)
          : [];
        let serverAmount = 0;
        const seen = new Set<number>();
        for (const idx of body.item_indexes) {
          if (idx < 0 || idx >= itemsArr.length) {
            return reply.status(400).send({
              error: {
                code: 'INVALID_REQUEST',
                message: 'item_indexes out of range.',
              },
            });
          }
          if (seen.has(idx)) {
            return reply.status(400).send({
              error: {
                code: 'INVALID_REQUEST',
                message: 'item_indexes contains duplicates.',
              },
            });
          }
          seen.add(idx);
          const line = itemsArr[idx];
          if (!line) {
            return reply.status(400).send({
              error: {
                code: 'INVALID_REQUEST',
                message: 'item_indexes points at a missing line.',
              },
            });
          }
          const lineTotal =
            typeof line.lineTotal === 'number'
              ? line.lineTotal
              : round2((line.qty ?? 0) * (line.unitPrice ?? 0));
          serverAmount += lineTotal;
        }
        serverAmount = round2(serverAmount);
        if (Math.abs(serverAmount - body.amount) > AMOUNT_EPSILON) {
          return reply.status(409).send({
            error: {
              code: 'AMOUNT_MISMATCH',
              message:
                'Amount does not match sum of selected items (server-computed).',
            },
          });
        }
      }

      if (body.type === 'equal') {
        // Sanity — `equal_parts` is audit-only but still has to make sense.
        if (body.equal_parts !== undefined && body.equal_parts < 2) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_REQUEST',
              message: 'equal_parts must be at least 2.',
            },
          });
        }
      }

      // 4. Load restaurant (for the Swish number).
      const { data: restaurantRow, error: restErr } = await fastify.supabaseAdmin
        .from('restaurants')
        .select('swish_number, name')
        .eq('id', orderRow.restaurant_id)
        .single();
      if (restErr || !restaurantRow) {
        request.log.error(
          { err: restErr, rid: orderRow.restaurant_id },
          'splits.create: restaurant lookup failed',
        );
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Restaurant lookup failed.' },
        });
      }
      if (!restaurantRow.swish_number) {
        return reply.status(409).send({
          error: {
            code: 'METHOD_NOT_SUPPORTED',
            message: 'This restaurant has not configured a Swish number.',
          },
        });
      }

      // 5. Insert the pending payment row BEFORE generating the deep link.
      //    (Same anti-pattern guard as /payments/initiate.)
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SWISH_EXPIRES_MS);
      const reference = generateReference();
      const message = buildSwishMessage(orderRow.order_token, reference);

      const { data: paymentRow, error: insertErr } = await fastify.supabaseAdmin
        .from('payments')
        .insert({
          order_cache_id: orderRow.id,
          restaurant_id: orderRow.restaurant_id,
          amount: body.amount,
          tip_amount: body.tip_amount,
          method: 'swish',
          provider: 'swish',
          status: 'pending',
          swish_reference: reference,
          swish_message: message,
          expires_at: expiresAt.toISOString(),
        })
        .select('id')
        .single();
      if (insertErr || !paymentRow) {
        request.log.error({ err: insertErr }, 'splits.create: insert failed');
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Could not create payment.' },
        });
      }

      // 6. Write audit row in payment_splits. Best-effort — never roll
      //    back the payment if this fails, reconciliation can recover
      //    from the payments row alone.
      const splitLabel = describeSplit(body);
      const { error: splitInsErr } = await fastify.supabaseAdmin
        .from('payment_splits')
        .insert({
          payment_id: paymentRow.id,
          guest_identifier: splitLabel,
          amount: body.amount,
        });
      if (splitInsErr) {
        request.log.warn(
          { err: splitInsErr, pid: paymentRow.id },
          'splits.create: audit insert failed (non-fatal)',
        );
      }

      // 7. Build the Swish deep link + QR.
      const swishUrl = swish.generateSwishUrl({
        payeeNumber: restaurantRow.swish_number,
        amount: body.amount + body.tip_amount,
        message,
        reference,
      });
      let qrDataUrl: string;
      try {
        qrDataUrl = await swish.generateSwishQR(swishUrl);
      } catch (err) {
        request.log.error({ err }, 'splits.create: QR generation failed');
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'QR generation failed.' },
        });
      }

      // 8. Flip the order to 'paying' for staff dashboards. Non-fatal.
      if (orderRow.status !== 'paying') {
        const { error: updErr } = await fastify.supabaseAdmin
          .from('orders_cache')
          .update({ status: 'paying' })
          .eq('id', orderRow.id);
        if (updErr) {
          request.log.warn(
            { err: updErr, oid: orderRow.id },
            'splits.create: could not flip order to paying (non-fatal)',
          );
        }
      }

      const response = {
        payment_id: paymentRow.id,
        method: 'swish' as const,
        swish_url: swishUrl,
        qr_data_url: qrDataUrl,
        expires_at: expiresAt.toISOString(),
        reference,
      };
      const validated = paymentInitiateSwishResponseSchema.safeParse(response);
      if (!validated.success) {
        request.log.error(
          { err: validated.error },
          'splits.create: response self-validation failed',
        );
        return reply.status(500).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Response shape mismatch.' },
        });
      }

      reply.header('Cache-Control', 'no-store, max-age=0');
      return reply.status(201).send(validated.data);
    },
  );

  // ── GET /splits/:order_token ───────────────────────────────────────────
  fastify.get<{ Params: { order_token: string } }>(
    '/splits/:order_token',
    {
      // 60/min — the split UI polls every 3s which is 20 req/min per
      // session; leave headroom for tab-refocus bursts and multi-guest
      // tables.
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const token = request.params.order_token;
      if (
        typeof token !== 'string' ||
        token.length < TOKEN_MIN_LEN ||
        token.length > TOKEN_MAX_LEN
      ) {
        return reply.status(400).send({
          error: { code: 'INVALID_REQUEST', message: 'Invalid order token.' },
        });
      }

      const { data: orderRow, error: orderErr } = await fastify.supabaseAdmin
        .from('orders_cache')
        .select('id, total, status, currency, order_token')
        .eq('order_token', token)
        .maybeSingle();
      if (orderErr) {
        request.log.error(
          { err: orderErr, token: `${token.slice(0, 6)}…` },
          'splits.status: order lookup failed',
        );
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Order lookup unavailable.' },
        });
      }
      if (!orderRow) {
        return reply.status(404).send({
          error: { code: 'ORDER_NOT_FOUND', message: 'No order for that token.' },
        });
      }

      const { data: paymentRows, error: pErr } = await fastify.supabaseAdmin
        .from('payments')
        .select('amount, status, created_at')
        .eq('order_cache_id', orderRow.id)
        .in('status', ['pending', 'completed']);
      if (pErr) {
        request.log.error({ err: pErr }, 'splits.status: payments lookup failed');
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Payments lookup failed.' },
        });
      }

      let amountCompleted = 0;
      let amountPending = 0;
      const activeSplits: SplitStatusResponse['active_splits'] = [];
      for (const r of paymentRows ?? []) {
        const amt = Number(r.amount);
        if (r.status === 'completed') {
          amountCompleted += amt;
        } else if (r.status === 'pending') {
          amountPending += amt;
          activeSplits.push({
            amount: amt,
            status: 'pending',
            created_at: r.created_at,
          });
        }
      }
      const total = Number(orderRow.total);
      const amountRemaining = Math.max(0, total - amountCompleted - amountPending);

      const rawStatus = orderRow.status as string;
      const orderStatus: SplitStatusResponse['order_status'] =
        rawStatus === 'paid' ||
        rawStatus === 'closed' ||
        rawStatus === 'paying'
          ? (rawStatus as SplitStatusResponse['order_status'])
          : 'open';

      const response: SplitStatusResponse = {
        order_token: orderRow.order_token,
        total: round2(total),
        currency: orderRow.currency ?? 'SEK',
        amount_completed: round2(amountCompleted),
        amount_pending: round2(amountPending),
        amount_remaining: round2(amountRemaining),
        order_status: orderStatus,
        active_splits: activeSplits,
      };

      const validated = splitStatusResponseSchema.safeParse(response);
      if (!validated.success) {
        request.log.error(
          { err: validated.error },
          'splits.status: response self-validation failed',
        );
        return reply.status(500).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Response shape mismatch.' },
        });
      }

      reply.header('Cache-Control', 'no-store, max-age=0');
      return validated.data;
    },
  );
};

/** Two-decimal rounding for SEK. Matches round2() in routes/orders.ts. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build a short, human-readable label describing the split. Written to
 * `payment_splits.guest_identifier` — purely audit, never authentication.
 *
 *   equal 2/4            → "equal 2/4"
 *   portion (no meta)    → "portion"
 *   items [0, 3, 5]      → "items 0,3,5"
 *   items with too many  → truncated to first 8 indexes
 */
function describeSplit(body: {
  type: 'equal' | 'portion' | 'items';
  equal_parts?: number | undefined;
  equal_part_index?: number | undefined;
  item_indexes?: number[] | undefined;
}): string {
  if (body.type === 'equal') {
    const part = body.equal_part_index ?? '?';
    const n = body.equal_parts ?? '?';
    return `equal ${part}/${n}`;
  }
  if (body.type === 'portion') {
    return 'portion';
  }
  const idxs = body.item_indexes ?? [];
  const truncated = idxs.slice(0, 8).join(',');
  const suffix = idxs.length > 8 ? `,+${idxs.length - 8}` : '';
  return `items ${truncated}${suffix}`;
}

export default splitsRoute;
