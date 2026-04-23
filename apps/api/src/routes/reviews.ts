/**
 * Reviews routes — BRIEF-API-006 "Google review deep link service".
 *
 *   POST /reviews     — public. Persists a review via the `submit_review`
 *                       RPC (DB-003) and, when appropriate, returns a
 *                       Google Business Profile "write review" URL so the
 *                       guest PWA can redirect.
 *
 * Guard rails (from the brief):
 *   - We NEVER post on the guest's behalf. The redirect_url points to
 *     Google's own write-review form.
 *   - redirect_url is only populated when ALL three are true:
 *       1. rating >= 4
 *       2. consent === true        (explicit client opt-in)
 *       3. restaurants.google_place_id is set for that payment's restaurant
 *   - When we DO hand back a redirect_url, we also stamp
 *     reviews.published_to_google_at = now() for audit ("we sent this
 *     guest to Google with their consent").
 *   - The SECURITY DEFINER RPC `submit_review` is the only write path;
 *     direct INSERT on public.reviews from anon is revoked. That RPC
 *     also enforces payment.status='completed' and UNIQUE(payment_id).
 *
 * Error mapping (PostgREST / PG codes → wire codes):
 *   - 23505 (unique_violation on payment_id)   → 409 ALREADY_SUBMITTED
 *   - 02000 (raised by RPC — payment missing)  → 404 PAYMENT_NOT_FOUND
 *   - 22023 (raised by RPC — status != completed
 *                              or rating out of range)
 *                                               → 409 PAYMENT_NOT_COMPLETED
 *                                                 (or 400 INVALID_REQUEST
 *                                                 when the message says
 *                                                 "rating")
 *   - everything else                          → 502 UPSTREAM_ERROR
 *
 * Why we read the restaurant in a separate round-trip AFTER the RPC
 * rather than inside a bigger SQL function:
 *   - The RPC is the authoritative gate for the insert. Keeping it
 *     minimal keeps its surface small and its audit trail simple.
 *   - The place_id lookup is a trivial SELECT off the service-role
 *     client. Cheaper than teaching the RPC a new output column.
 *
 * Rate limit: 20/min per IP. A guest submits one review per bill; any
 * more is a retry or abuse.
 */

import {
  reviewErrorResponseSchema,
  reviewSubmitRequestSchema,
  reviewSubmitResponseSchema,
  type ReviewSubmitResponse,
} from '@flowpay/schemas';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/** Google's own write-review deep link for a Business Profile. */
function buildGoogleReviewUrl(placeId: string): string {
  const safe = encodeURIComponent(placeId);
  return `https://search.google.com/local/writereview?placeid=${safe}`;
}

/**
 * Best-effort extraction of the PG error code returned by supabase-js.
 * PostgREST bubbles the PG SQLSTATE through `error.code` for RPC calls;
 * for PostgREST-level unique-violation it comes back as '23505'.
 */
function pgCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const c = (err as { code?: unknown }).code;
  return typeof c === 'string' ? c : undefined;
}

function pgMessage(err: unknown): string {
  if (typeof err !== 'object' || err === null) return '';
  const m = (err as { message?: unknown }).message;
  return typeof m === 'string' ? m : '';
}

const reviewsRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // ── POST /reviews ──────────────────────────────────────────────────────
  fastify.post(
    '/reviews',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      // 1. Validate body.
      const parsed = reviewSubmitRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(
          reviewErrorResponseSchema.parse({
            error: {
              code: 'INVALID_REQUEST',
              message: 'Invalid review submission.',
            },
          }),
        );
      }
      const body = parsed.data;

      // 2. Call the anon-safe RPC. The RPC owns:
      //      - payment existence + status='completed' check
      //      - restaurant_id derivation (guest can't spoof)
      //      - INSERT into reviews (UNIQUE on payment_id dedups)
      //    We use the admin client for a simpler permission model; the
      //    RPC is SECURITY DEFINER and already grants EXECUTE to anon.
      //    Using admin here means rate-limit is our only abuse gate on
      //    this endpoint, which is fine — the RPC refuses to insert
      //    for any payment that isn't genuinely completed.
      const { data: newReviewId, error: rpcErr } = await fastify.supabaseAdmin
        .rpc('submit_review', {
          payment_id_param: body.payment_id,
          rating_param: body.rating,
          text_param: body.text ?? null,
          email_param: body.email ?? null,
          phone_param: body.phone ?? null,
          consent_param: body.consent,
        });

      if (rpcErr) {
        const code = pgCode(rpcErr);
        const msg = pgMessage(rpcErr).toLowerCase();

        if (code === '23505') {
          return reply.status(409).send(
            reviewErrorResponseSchema.parse({
              error: {
                code: 'ALREADY_SUBMITTED',
                message: 'A review has already been submitted for this payment.',
              },
            }),
          );
        }
        if (code === '02000') {
          return reply.status(404).send(
            reviewErrorResponseSchema.parse({
              error: {
                code: 'PAYMENT_NOT_FOUND',
                message: 'No payment matches that id.',
              },
            }),
          );
        }
        if (code === '22023') {
          // The RPC raises 22023 for both "rating out of range" and
          // "payment not completed". Distinguish by message prefix —
          // both are stable Swedish-english-tagged strings from the
          // migration so this is safe across pg versions.
          if (msg.includes('rating')) {
            return reply.status(400).send(
              reviewErrorResponseSchema.parse({
                error: {
                  code: 'INVALID_REQUEST',
                  message: 'Rating must be between 1 and 5.',
                },
              }),
            );
          }
          return reply.status(409).send(
            reviewErrorResponseSchema.parse({
              error: {
                code: 'PAYMENT_NOT_COMPLETED',
                message: 'This payment is not completed yet.',
              },
            }),
          );
        }

        request.log.error(
          { err: rpcErr, paymentId: body.payment_id },
          'reviews.submit: RPC failed',
        );
        return reply.status(502).send(
          reviewErrorResponseSchema.parse({
            error: {
              code: 'UPSTREAM_ERROR',
              message: 'Could not record review right now.',
            },
          }),
        );
      }

      if (typeof newReviewId !== 'string') {
        // Shouldn't happen — the RPC returns uuid. Guard anyway.
        request.log.error(
          { paymentId: body.payment_id, got: typeof newReviewId },
          'reviews.submit: RPC returned unexpected shape',
        );
        return reply.status(502).send(
          reviewErrorResponseSchema.parse({
            error: { code: 'UPSTREAM_ERROR', message: 'Unexpected RPC shape.' },
          }),
        );
      }
      const reviewId = newReviewId;

      // 3. Compute redirect_url, if all three gates are satisfied.
      //
      //    We re-read the restaurants row via the payment's restaurant_id.
      //    This avoids trusting anything from the client and keeps the
      //    redirect contingent on DB state.
      let redirectUrl: string | null = null;
      if (body.consent && body.rating >= 4) {
        // Look up the restaurant via the review we just inserted. This
        // also validates that the insert actually resolved a
        // restaurant (sanity check — if the RPC returns an id, the row
        // exists).
        const { data: reviewRow, error: reviewErr } = await fastify.supabaseAdmin
          .from('reviews')
          .select('restaurant_id')
          .eq('id', reviewId)
          .maybeSingle();

        if (reviewErr || !reviewRow) {
          request.log.warn(
            { err: reviewErr, reviewId },
            'reviews.submit: could not re-read review after insert (non-fatal)',
          );
        } else {
          const { data: restaurantRow, error: restErr } = await fastify.supabaseAdmin
            .from('restaurants')
            .select('google_place_id')
            .eq('id', reviewRow.restaurant_id)
            .maybeSingle();

          if (restErr) {
            request.log.warn(
              { err: restErr, rid: reviewRow.restaurant_id },
              'reviews.submit: could not read google_place_id (non-fatal)',
            );
          } else if (restaurantRow?.google_place_id) {
            redirectUrl = buildGoogleReviewUrl(restaurantRow.google_place_id);

            // 4. Audit: stamp published_to_google_at. The reviews table
            //    has a trigger that forbids most column changes for
            //    authenticated users, but we use service_role here which
            //    bypasses it (see reviews_enforce_reply_only()).
            const { error: stampErr } = await fastify.supabaseAdmin
              .from('reviews')
              .update({ published_to_google_at: new Date().toISOString() })
              .eq('id', reviewId);
            if (stampErr) {
              request.log.warn(
                { err: stampErr, reviewId },
                'reviews.submit: could not stamp published_to_google_at (non-fatal)',
              );
            }
          }
        }
      }

      // 5. Build + validate response.
      const response: ReviewSubmitResponse = {
        review_id: reviewId,
        redirect_url: redirectUrl,
      };
      const validated = reviewSubmitResponseSchema.safeParse(response);
      if (!validated.success) {
        request.log.error(
          { err: validated.error, response },
          'reviews.submit: response self-validation failed',
        );
        return reply.status(500).send(
          reviewErrorResponseSchema.parse({
            error: { code: 'UPSTREAM_ERROR', message: 'Response shape mismatch.' },
          }),
        );
      }

      reply.header('Cache-Control', 'no-store, max-age=0');
      return reply.status(201).send(validated.data);
    },
  );
};

export default reviewsRoute;
