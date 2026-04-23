/**
 * POS sync scheduler — setInterval-driven loop that asks
 * `PosSyncService` to sync every active integration.
 *
 * Design notes:
 *   - One scheduler per API process. Running multiple copies of the API
 *     behind a load balancer means N schedulers racing. For v0 that's
 *     acceptable — upserts are idempotent and `closeMissing` is
 *     set-difference; the worst case is redundant work. A later brief
 *     will move this to a single cron job (Supabase pg_cron) once we
 *     scale out.
 *   - Exponential backoff at the _integration_ level lives in
 *     `PosSyncService` (it flips status='error' for fatal failures).
 *     The scheduler's backoff is process-wide: if the overall run
 *     throws, double the delay up to 5 minutes.
 *   - Circuit breaker: if >50% of integrations fail in one cycle, we
 *     skip the next cycle to avoid hammering downstream. Any return to
 *     good health resets.
 */

import type { FastifyBaseLogger } from 'fastify';
import { PosSyncService } from './pos-sync.js';

export interface SyncSchedulerOptions {
  service: PosSyncService;
  intervalMs: number;       // e.g. 30_000
  logger: FastifyBaseLogger;
  /** Start a second-long jitter so multiple processes don't align. */
  jitterMs?: number;
}

export class SyncScheduler {
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private consecutiveFailures = 0;
  private skipNext = false;

  constructor(private readonly opts: SyncSchedulerOptions) {}

  start(): void {
    if (this.timer) return;
    const jitter = Math.floor(Math.random() * (this.opts.jitterMs ?? 1000));
    this.opts.logger.info({ jitter }, 'pos sync scheduler starting');
    this.timer = setTimeout(() => void this.tick(), jitter);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;

    if (this.skipNext) {
      this.opts.logger.warn('circuit open — skipping this tick');
      this.skipNext = false;
    } else {
      try {
        const { ok, failed } = await this.opts.service.syncAll();

        if (failed.length === 0) {
          this.consecutiveFailures = 0;
        } else {
          this.consecutiveFailures += 1;
        }
        // Circuit breaker — if more than half fail, skip the next tick.
        const total = ok.length + failed.length;
        if (total > 0 && failed.length * 2 > total) {
          this.skipNext = true;
          this.opts.logger.warn(
            { failed: failed.length, total },
            'pos sync: majority failed, opening circuit for next tick',
          );
        }
      } catch (err) {
        this.consecutiveFailures += 1;
        this.opts.logger.error({ err }, 'pos sync scheduler: uncaught error');
      }
    }

    if (this.stopped) return;

    const base = this.opts.intervalMs;
    const backoffMultiplier = Math.min(2 ** Math.min(this.consecutiveFailures, 4), 16);
    const next = Math.min(base * backoffMultiplier, 5 * 60_000);
    if (next !== base) {
      this.opts.logger.warn({ nextMs: next, failures: this.consecutiveFailures }, 'pos sync backing off');
    }
    this.timer = setTimeout(() => void this.tick(), next);
  }
}
