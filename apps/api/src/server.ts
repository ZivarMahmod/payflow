/**
 * FlowPay API — Fastify server entrypoint.
 *
 * Boot order matters:
 *   1. config plugin  — load + validate env. Everything else reads fastify.config.
 *   2. CORS + rate-limit — before any route.
 *   3. supabase plugin — once config is ready.
 *   4. routes          — one file per resource, registered under a prefix.
 *   5. listen          — after graceful-shutdown hooks are wired.
 *
 * Handlers are NEVER defined inline here (anti-pattern #3 in the brief).
 */

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';

import configPlugin from './plugins/config.js';
import supabasePlugin from './plugins/supabase.js';
import healthRoute from './routes/health.js';
import caspecoOAuthRoute from './routes/integrations/caspeco-oauth.js';
import ordersRoute from './routes/orders.js';
import paymentsRoute from './routes/payments.js';
import reviewsRoute from './routes/reviews.js';
import splitsRoute from './routes/splits.js';
import { PaymentExpirerScheduler } from './services/payment-expirer.js';
import { PosSyncService } from './services/pos-sync.js';
import { PosUpdateQueueWorker } from './services/pos-update-queue.js';
import { SyncScheduler } from './services/sync-scheduler.js';

export async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      // Pretty-print in dev only. Production logs stay JSON for Fly.io's aggregator.
      ...(process.env['NODE_ENV'] !== 'production'
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
    // Trust proxy so Fly.io's X-Forwarded-For headers reach rate-limit.
    trustProxy: true,
    // Production bodyLimit — 1 MB is plenty for our JSON APIs.
    bodyLimit: 1_048_576,
  });

  await fastify.register(configPlugin);

  await fastify.register(cors, {
    origin: (origin, cb) => {
      const allowed = fastify.config.corsOrigins;
      // In dev, allow any origin (including no-origin tools like curl).
      if (!fastify.config.isProduction) {
        cb(null, true);
        return;
      }
      // Production: must match the allowlist exactly.
      if (!origin || allowed.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin ${origin} not allowed`), false);
      }
    },
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // Rate limit per IP, but use X-Real-IP when behind a proxy.
    keyGenerator: (req) => {
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        const first = forwarded.split(',')[0]?.trim();
        if (first) return first;
      }
      return req.ip;
    },
  });

  await fastify.register(supabasePlugin);

  // Routes.
  await fastify.register(healthRoute);
  await fastify.register(ordersRoute);
  await fastify.register(paymentsRoute);
  await fastify.register(reviewsRoute);
  await fastify.register(splitsRoute);
  await fastify.register(caspecoOAuthRoute);

  // Payment-expirer — always on. Sweeps pending rows whose expires_at
  // has passed. Cheap; runs on every replica; idempotent RPC.
  // Disabled when NODE_ENV=test so vitest doesn't hit the stubbed RPC
  // repeatedly and print noisy "function not mocked" errors.
  if (fastify.config.NODE_ENV !== 'test') {
    const expirer = new PaymentExpirerScheduler({
      adminClient: fastify.supabaseAdmin,
      logger: fastify.log,
    });
    expirer.start();
    fastify.addHook('onClose', async () => expirer.stop());
  }

  // POS sync scheduler — off by default. Flip ENABLE_POS_SYNC=true on
  // the single worker instance.
  if (fastify.config.ENABLE_POS_SYNC) {
    const syncService = new PosSyncService({
      adminClient: fastify.supabaseAdmin,
      mock: fastify.config.USE_MOCK_ONSLIP && fastify.config.USE_MOCK_CASPECO,
      logger: {
        info: (m, meta) => fastify.log.info(meta ?? {}, m),
        warn: (m, meta) => fastify.log.warn(meta ?? {}, m),
        error: (m, meta) => fastify.log.error(meta ?? {}, m),
      },
    });
    const scheduler = new SyncScheduler({
      service: syncService,
      intervalMs: fastify.config.POS_SYNC_INTERVAL_MS,
      logger: fastify.log,
    });
    scheduler.start();
    fastify.addHook('onClose', async () => scheduler.stop());

    // POS update-queue worker — drains the durable queue created by the
    // payments_enqueue_pos_update trigger (migration 007). Runs on the
    // SAME flag as the POS sync scheduler because both should live on
    // the single "worker" deployment, not on every API replica. The DB
    // constraint UNIQUE(payment_id, action) plus FOR UPDATE SKIP LOCKED
    // make multi-replica safe, but we still prefer one for log clarity.
    const queueWorker = new PosUpdateQueueWorker({
      adminClient: fastify.supabaseAdmin,
      mock: fastify.config.USE_MOCK_ONSLIP && fastify.config.USE_MOCK_CASPECO,
      logger: fastify.log,
    });
    queueWorker.start();
    fastify.addHook('onClose', async () => queueWorker.stop());
  }

  // Generic error handler — don't leak internals to clients.
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, url: request.url }, 'request failed');
    // Fastify types `error` as FastifyError which has optional statusCode/code,
    // but the handler shape in this version widens it to unknown at the callback
    // boundary. Narrow defensively so a non-Error payload can't crash the reply.
    const err = error as { statusCode?: number; message?: string; code?: string };
    const status = err.statusCode ?? 500;
    const message = status < 500 ? (err.message ?? 'Bad Request') : 'Internal Server Error';
    reply.status(status).send({ error: { message, code: err.code ?? 'E_INTERNAL' } });
  });

  return fastify;
}

async function main(): Promise<void> {
  const server = await buildServer();
  const { PORT, HOST } = server.config;

  // Graceful shutdown — Fly.io sends SIGTERM before killing the vm.
  const shutdown = async (signal: string) => {
    server.log.info({ signal }, 'shutdown initiated');
    try {
      await server.close();
      process.exit(0);
    } catch (err) {
      server.log.error({ err }, 'shutdown error');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await server.listen({ port: PORT, host: HOST });
    server.log.info(`FlowPay API listening on http://${HOST}:${PORT}`);
  } catch (err) {
    server.log.error({ err }, 'failed to start');
    process.exit(1);
  }
}

// Only run when invoked directly (allows importing buildServer from tests).
const isEntrypoint = import.meta.url === `file://${process.argv[1]}`;
if (isEntrypoint) {
  void main();
}
