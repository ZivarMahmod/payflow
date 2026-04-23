/**
 * Payment-expirer — setInterval-driven sweep that flips stale `pending`
 * payments to `expired` via the `expire_pending_payments()` RPC.
 *
 * Why a scheduler and not pg_cron?
 *   - pg_cron is not yet wired up on this Supabase project (see
 *     docs/infra.md §4). Until then, the API process owns the sweep.
 *   - The RPC is idempotent (`UPDATE ... WHERE expires_at < now()` is a
 *     set operation), so running it multiple times a minute from
 *     replicas is harmless — worst case the second replica's RPC returns
 *     0 rows updated.
 *   - Drift risk with the client clock: zero. The RPC uses the DB's
 *     `now()` so whoever triggers it, the cut-off is the DB's time.
 *
 * Separate from `SyncScheduler` on purpose:
 *   - Different cadence — 30 s is fine for POS sync, but payments
 *     should expire within a few seconds of their `expires_at` so the
 *     guest PWA sees a definite "dead" signal and restarts. 15 s tick.
 *   - Different failure mode — if POS sync fails we back off; if the
 *     expirer fails we want to try again quickly because the `pending`
 *     rows are user-visible (the /status endpoint still returns
 *     'pending' until we flip them).
 *
 * Model closely mirrors SyncScheduler: jittered start, circuit-breaker
 * on repeated failures, graceful stop().
 */

import type { Database } from '@flowpay/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyBaseLogger } from 'fastify';

export interface PaymentExpirerOptions {
  adminClient: SupabaseClient<Database>;
  /** How often to sweep, in ms. Default 15_000 — see module doc. */
  intervalMs?: number;
  logger: FastifyBaseLogger;
  /** Start jitter so replicas don't all sweep the same millisecond. */
  jitterMs?: number;
}

export class PaymentExpirerScheduler {
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private consecutiveFailures = 0;

  constructor(private readonly opts: PaymentExpirerOptions) {}

  start(): void {
    if (this.timer) return;
    const base = this.opts.intervalMs ?? 15_000;
    const jitter = Math.floor(Math.random() * (this.opts.jitterMs ?? 1_000));
    this.opts.logger.info(
      { intervalMs: base, jitterMs: jitter },
      'payment-expirer scheduler starting',
    );
    this.timer = setTimeout(() => void this.tick(), jitter);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;

    try {
      const { data, error } = await this.opts.adminClient.rpc(
        'expire_pending_payments',
      );
      if (error) {
        this.consecutiveFailures += 1;
        this.opts.logger.error(
          { err: error, failures: this.consecutiveFailures },
          'payment-expirer: RPC failed',
        );
      } else {
        const expired = Number(data ?? 0);
        if (expired > 0) {
          this.opts.logger.info(
            { expired },
            'payment-expirer: flipped stale pending rows to expired',
          );
        }
        this.consecutiveFailures = 0;
      }
    } catch (err) {
      this.consecutiveFailures += 1;
      this.opts.logger.error(
        { err, failures: this.consecutiveFailures },
        'payment-expirer: uncaught error',
      );
    }

    if (this.stopped) return;

    // Exponential back-off on failure, capped at 2 minutes. The expirer
    // is cheap so we don't back off aggressively — we want pending
    // payments to clear quickly once the DB is healthy again.
    const base = this.opts.intervalMs ?? 15_000;
    const backoffMultiplier = Math.min(
      2 ** Math.min(this.consecutiveFailures, 3),
      8,
    );
    const next = Math.min(base * backoffMultiplier, 2 * 60_000);
    if (next !== base) {
      this.opts.logger.warn(
        { nextMs: next, failures: this.consecutiveFailures },
        'payment-expirer backing off',
      );
    }
    this.timer = setTimeout(() => void this.tick(), next);
  }
}
