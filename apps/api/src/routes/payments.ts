/**
 * Payments routes — the broker layer between the guest PWA and the
 * Swish flow.
 *
 *   POST /payments/initiate       — public. Creates a `payments` row with
 *                                   status='pending', returns the deep link
 *                                   + QR data URL + expires_at.
 *
 *   GET  /payments/:id/status     — public. Polling endpoint for the guest
 *                                   PWA while the Swish confirmation is
 *                                   pending (or until expired).
 *
 *   POST /payments/:id/confirm    — service-role only. Flips a pending
 *                                   payment to completed. MVP entry points:
 *                                    - admin dashboard "mark as paid"
 *                                    - mock-Swish test endpoint when
 *                                      USE_MOCK_SWISH=true
 *
 * Why the initiate/status endpoints are public: the guest PWA is
 * anon — it only holds the opaque order_token. RLS + server-side
 * lookups guard what data the guest can touch. The payment row id is
 * returned only to the caller that just created it.
 *
 * Why /confirm is service-role: we don't trust any client to flip the
 * status. In prod the flip will come from a Tink Open Banking webhook
 * or a Swish Handel webhook once restaurants have bank-agreement
 * access — both run with service-role creds. The MVP admin button
 * also runs as an authenticated staff user; route-level guard below
 * checks Authorization for a service-role or staff JWT.
 *
 * Anti-patterns enforced here:
 *   - NEVER build a deep link without writing the pending payment row
 *     first — audit trail comes before UX.
 *   - NEVER let the client dictate status — only `completed` /
 *     `expired` and only via /confirm (or the cron).
 *   - Always set expires_at — a guest PWA that never times out hangs.
 */

import {
  type PaymentConfirmResponse,
  paymentConfirmRequestSchema,
  paymentConfirmResponseSchema,
  paymentIdParamSchema,
  paymentInitiateRequestSchema,
  paymentInitiateSwishResponseSchema,
  type PaymentStatusResponse,
  paymentStatusResponseSchema,
} from '@flowpay/schemas';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import {
  buildSwishMessage,
  generateReference,
  makeSwishProvider,
  type SwishProvider,
} from '../services/swish.js';

/** Swish's private-QR flow is short-lived — 3 minutes is plenty. */
const SWISH_EXPIRES_MS = 3 * 60_000;

/**
 * Auth guard for /confirm. Accepts either:
 *   1. Authorization: Bearer <SUPABASE_SERVICE_KEY>  — server-to-server
 *   2. A Supabase staff JWT that yields a staff row for the target
 *      restaurant when passed to the admin client. (Implementation of
 *      route (2) is left to a dedicated auth plugin — for MVP, only
 *      route (1) is accepted. Docs block below makes this explicit.)
 *
 * This avoids a half-done auth surface that would let a leaked JWT
 * mutate payments before the admin app exists.
 */
function isServiceRoleCall(
  headerValue: string | undefined,
  serviceKey: string,
): boolean {
  if (!headerValue) return false;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue);
  if (!match?.[1]) return false;
  // Constant-time-ish compare — not perfect in Node 20 but avoids the
  // length-leak of a raw `===`.
  const a = match[1];
  const b = serviceKey;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const paymentsRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const swish: SwishProvider = makeSwishProvider(fastify.config.USE_MOCK_SWISH);

  // ── POST /payments/initiate ────────────────────────────────────────────
  fastify.post(
    '/payments/initiate',
    {
      // Tighter than the global 300/min — bills bounce between guests,
      // 30/min per IP is enough for legitimate flows and cheap to
      // rate-limit attackers.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = paymentInitiateRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid payment initiation request.',
          },
        });
      }
      const body = parsed.data;

      // 1. Look up the order by token via the service-role client. We
      //    need the full row (including restaurant_id + swish number)
      //    which the anon RPC deliberately doesn't expose.
      const { data: orderRow, error: orderErr } = await fastify.supabaseAdmin
        .from('orders_cache')
        .select('id, restaurant_id, total, status, order_token')
        .eq('order_token', body.order_token)
        .maybeSingle();

      if (orderErr) {
        request.log.error(
          { err: orderErr, token: `${body.order_token.slice(0, 6)}…` },
          'payments.initiate: order lookup failed',
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

      // 2. Amount-safety: reject initiation if the request amount exceeds
      //    the remaining balance (total − already-completed payments).
      //    Stops a malicious client from over-paying and fronting costs.
      const { data: completedRows, error: sumErr } = await fastify.supabaseAdmin
        .from('payments')
        .select('amount')
        .eq('order_cache_id', orderRow.id)
        .eq('status', 'completed');

      if (sumErr) {
        request.log.error({ err: sumErr }, 'payments.initiate: sum query failed');
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Ledger lookup failed.' },
        });
      }
      const alreadyPaid = (completedRows ?? []).reduce(
        (s, r) => s + Number(r.amount),
        0,
      );
      const remaining = Number(orderRow.total) - alreadyPaid;
      // Small epsilon for float slop on the decimal round-trip. Our
      // amounts are NUMERIC(10,2) server-side so slack of 0.005 is
      // safe.
      if (body.amount > remaining + 0.005) {
        return reply.status(409).send({
          error: {
            code: 'AMOUNT_MISMATCH',
            message: 'Amount exceeds remaining balance on this bill.',
          },
        });
      }

      // 3. Look up the restaurant's Swish number. Required for the deep
      //    link — no fallback that would silently route to the wrong payee.
      const { data: restaurantRow, error: restErr } = await fastify.supabaseAdmin
        .from('restaurants')
        .select('swish_number, name')
        .eq('id', orderRow.restaurant_id)
        .single();

      if (restErr || !restaurantRow) {
        request.log.error(
          { err: restErr, rid: orderRow.restaurant_id },
          'payments.initiate: restaurant lookup failed',
        );
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Restaurant lookup failed.' },
        });
      }
      if (!restaurantRow.swish_number && body.method === 'swish') {
        return reply.status(409).send({
          error: {
            code: 'METHOD_NOT_SUPPORTED',
            message: 'This restaurant has not configured a Swish number.',
          },
        });
      }

      if (body.method !== 'swish') {
        // Card / Stripe lands in API-005. Reject cleanly for now.
        return reply.status(400).send({
          error: {
            code: 'METHOD_NOT_SUPPORTED',
            message: `Method '${body.method}' is not yet supported.`,
          },
        });
      }

      // 4. Write the pending payments row BEFORE generating the deep link.
      //    That way every deep link handed to a client has a ledger row.
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
        request.log.error(
          { err: insertErr },
          'payments.initiate: insert failed',
        );
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Could not create payment.' },
        });
      }

      // 5. Build the deep link + QR now that the ledger row exists.
      // Non-null assertion on swish_number is safe — we early-returned
      // above if it was null.
      const swishUrl = swish.generateSwishUrl({
        payeeNumber: restaurantRow.swish_number as string,
        amount: body.amount + body.tip_amount,
        message,
        reference,
      });
      let qrDataUrl: string;
      try {
        qrDataUrl = await swish.generateSwishQR(swishUrl);
      } catch (err) {
        request.log.error({ err }, 'payments.initiate: QR generation failed');
        // We have a good ledger row; fail the request but the row stays
        // pending and will be expired by the cron. Don't silently return
        // a broken QR.
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'QR generation failed.' },
        });
      }

      // 6. Flip the order_cache row to 'paying' so staff dashboards know
      //    a guest is mid-pay. Best-effort — failure here doesn't block
      //    the payment; worst case dashboard lags by one sync tick.
      if (orderRow.status !== 'paying') {
        const { error: updErr } = await fastify.supabaseAdmin
          .from('orders_cache')
          .update({ status: 'paying' })
          .eq('id', orderRow.id);
        if (updErr) {
          request.log.warn(
            { err: updErr, oid: orderRow.id },
            'payments.initiate: could not flip order to paying (non-fatal)',
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
          'payments.initiate: response failed self-validation',
        );
        return reply.status(500).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Response shape mismatch.' },
        });
      }

      reply.header('Cache-Control', 'no-store, max-age=0');
      return reply.status(201).send(validated.data);
    },
  );

  // ── GET /payments/:id/status ───────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/payments/:id/status',
    {
      // 60/min — the guest PWA polls roughly every 2-3 seconds.
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = paymentIdParamSchema.safeParse({ id: request.params.id });
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'INVALID_REQUEST', message: 'Invalid payment id.' },
        });
      }

      const { data, error } = await fastify.supabaseAdmin
        .from('payments')
        .select('id, status, amount, tip_amount, method, paid_at, expires_at')
        .eq('id', parsed.data.id)
        .maybeSingle();

      if (error) {
        request.log.error({ err: error }, 'payments.status: lookup failed');
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Payment lookup failed.' },
        });
      }
      if (!data) {
        return reply.status(404).send({
          error: { code: 'PAYMENT_NOT_FOUND', message: 'No such payment.' },
        });
      }

      const response: PaymentStatusResponse = {
        payment_id: data.id,
        status: data.status,
        amount: Number(data.amount),
        tip_amount: Number(data.tip_amount),
        method: data.method,
        paid_at: data.paid_at,
        expires_at: data.expires_at,
      };
      const validated = paymentStatusResponseSchema.safeParse(response);
      if (!validated.success) {
        request.log.error(
          { err: validated.error },
          'payments.status: response failed self-validation',
        );
        return reply.status(500).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Response shape mismatch.' },
        });
      }

      reply.header('Cache-Control', 'no-store, max-age=0');
      return validated.data;
    },
  );

  // ── POST /payments/:id/confirm ─────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/payments/:id/confirm',
    async (request, reply) => {
      const paramParsed = paymentIdParamSchema.safeParse({
        id: request.params.id,
      });
      if (!paramParsed.success) {
        return reply.status(400).send({
          error: { code: 'INVALID_REQUEST', message: 'Invalid payment id.' },
        });
      }

      // Service-role gate. No half-auth paths until the staff-JWT plugin lands.
      if (
        !isServiceRoleCall(
          request.headers['authorization'],
          fastify.config.SUPABASE_SERVICE_KEY,
        )
      ) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Service-role credentials required to confirm payments.',
          },
        });
      }

      const bodyParsed = paymentConfirmRequestSchema.safeParse(
        request.body ?? {},
      );
      if (!bodyParsed.success) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid confirm payload.',
          },
        });
      }

      // Read the current row first so we can (a) 404 cleanly and (b)
      // reject already-completed or expired rows without a write.
      const { data: existing, error: readErr } = await fastify.supabaseAdmin
        .from('payments')
        .select('id, status, amount, tip_amount, method, order_cache_id, paid_at, expires_at')
        .eq('id', paramParsed.data.id)
        .maybeSingle();

      if (readErr) {
        request.log.error({ err: readErr }, 'payments.confirm: lookup failed');
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Payment lookup failed.' },
        });
      }
      if (!existing) {
        return reply.status(404).send({
          error: { code: 'PAYMENT_NOT_FOUND', message: 'No such payment.' },
        });
      }
      if (existing.status === 'completed') {
        return reply.status(409).send({
          error: {
            code: 'PAYMENT_ALREADY_COMPLETED',
            message: 'Payment is already completed.',
          },
        });
      }
      if (existing.status === 'expired') {
        return reply.status(410).send({
          error: {
            code: 'PAYMENT_EXPIRED',
            message: 'Payment expired before confirmation.',
          },
        });
      }

      // Flip to completed. The DB trigger (see migration 006) stamps
      // paid_at and runs mark_order_paid_if_funded.
      const { data: updated, error: updErr } = await fastify.supabaseAdmin
        .from('payments')
        .update({
          status: 'completed',
          ...(bodyParsed.data.provider_tx_id
            ? { provider_tx_id: bodyParsed.data.provider_tx_id }
            : {}),
        })
        .eq('id', paramParsed.data.id)
        .select('id, status, paid_at, order_cache_id')
        .single();

      if (updErr || !updated) {
        request.log.error({ err: updErr }, 'payments.confirm: update failed');
        return reply.status(502).send({
          error: { code: 'UPSTREAM_ERROR', message: 'Could not mark paid.' },
        });
      }

      // Ask the DB whether that completion tipped the order into paid.
      // The trigger already called mark_order_paid_if_funded; we re-read
      // the orders_cache row to surface the boolean to the client.
      const { data: orderAfter, error: ocErr } = await fastify.supabaseAdmin
        .from('orders_cache')
        .select('status')
        .eq('id', updated.order_cache_id)
        .single();
      if (ocErr) {
        request.log.warn(
          { err: ocErr, oid: updated.order_cache_id },
          'payments.confirm: could not re-read orders_cache (non-fatal)',
        );
      }

      const response: PaymentConfirmResponse = {
        payment_id: updated.id,
        status: updated.status,
        paid_at: updated.paid_at,
        order_marked_paid: orderAfter?.status === 'paid',
      };
      const validated = paymentConfirmResponseSchema.safeParse(response);
      if (!validated.success) {
        request.log.error(
          { err: validated.error },
          'payments.confirm: response failed self-validation',
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

export default paymentsRoute;
