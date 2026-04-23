/**
 * GET /health — liveness + shallow DB check.
 *
 * We intentionally keep this cheap. Fly.io's health checks hit it every
 * few seconds; a slow /health equals flapping. The DB "ping" is a no-op
 * RPC call that goes through PostgREST and returns quickly.
 *
 * Response shape is stable:
 *   {
 *     status: 'ok' | 'degraded',
 *     uptime: number,           // seconds
 *     db: { connected: boolean, latencyMs?: number, error?: string },
 *     version: string,
 *     now: string,              // ISO
 *   }
 *
 * Status is 'degraded' (HTTP 200 still — don't page at 3am) when the DB
 * check failed but the process is otherwise alive. Fly uses 200 = alive.
 * A real readiness probe could map degraded → 503 but for v0 we keep it
 * simple.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const bootTime = Date.now();

const healthRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/health', async () => {
    const started = performance.now();
    let dbConnected = false;
    let dbLatencyMs: number | undefined;
    let dbError: string | undefined;

    try {
      // Anon client — if this works, PostgREST is reachable and our key is valid.
      // Calling an RPC with an obviously-non-existent token returns an empty
      // set (not an error) because get_order_by_token just filters and returns rows.
      const { error } = await fastify.supabase.rpc('get_order_by_token', {
        p_token: 'health-check-placeholder',
      });
      if (error) {
        dbError = error.message;
      } else {
        dbConnected = true;
        dbLatencyMs = Math.round(performance.now() - started);
      }
    } catch (err) {
      dbError = err instanceof Error ? err.message : 'unknown error';
    }

    return {
      status: dbConnected ? 'ok' : 'degraded',
      uptime: Math.round((Date.now() - bootTime) / 1000),
      db: {
        connected: dbConnected,
        ...(dbLatencyMs !== undefined ? { latencyMs: dbLatencyMs } : {}),
        ...(dbError ? { error: dbError } : {}),
      },
      version: process.env['npm_package_version'] ?? '0.0.1',
      now: new Date().toISOString(),
    };
  });
};

export default healthRoute;
