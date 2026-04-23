/**
 * Runtime configuration loaded from environment variables.
 *
 * Validated once at boot — if any required variable is missing or the
 * wrong shape, the process exits before Fastify starts listening. That's
 * deliberate: we'd rather crash with a clear error than run a half-broken
 * server in production.
 */

import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

// Load .env from the api package root regardless of cwd (pnpm --filter
// starts the process from the workspace root, not apps/api).
const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, '../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),

  // Mock flags — default ON so unconfigured environments never hit real providers.
  USE_MOCK_ONSLIP: z.coerce.boolean().default(true),
  USE_MOCK_CASPECO: z.coerce.boolean().default(true),
  USE_MOCK_SWISH: z.coerce.boolean().default(true),
  USE_MOCK_STRIPE: z.coerce.boolean().default(true),
  USE_MOCK_GOOGLE: z.coerce.boolean().default(true),

  // CORS — comma-separated list of allowed origins. Empty = reflect request origin (dev only).
  CORS_ORIGINS: z.string().default(''),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // POS sync scheduler. Disabled by default — the API container may run
  // multiple replicas, and only one should schedule. Flip to 'true' on
  // the single-instance "worker" deployment.
  ENABLE_POS_SYNC: z.coerce.boolean().default(false),
  POS_SYNC_INTERVAL_MS: z.coerce.number().int().min(5000).default(30_000),

  // Caspeco OAuth partner app. Required only when USE_MOCK_CASPECO=false
  // AND at least one restaurant has enabled the Caspeco integration.
  // Optional here so the mock path (which is the default) never trips
  // config validation.
  CASPECO_CLIENT_ID: z.string().optional(),
  CASPECO_CLIENT_SECRET: z.string().optional(),
  /** Callback URL registered with Caspeco. Must match their allowlist exactly. */
  CASPECO_REDIRECT_URI: z.string().url().optional(),
  /** Sandbox vs prod OAuth host. Defaults to production when unset. */
  CASPECO_OAUTH_BASE_URL: z.string().url().optional(),
  /** Sandbox vs prod REST API host. */
  CASPECO_API_BASE_URL: z.string().url().optional(),
});

export type AppConfig = z.infer<typeof envSchema> & {
  corsOrigins: string[];
  isProduction: boolean;
};

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Flattened error — easier to grep in logs.
    // biome-ignore lint/suspicious/noConsoleLog: boot-time diagnostic, before logger exists
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration — see above.');
  }

  const data = parsed.data;
  const corsOrigins = data.CORS_ORIGINS
    ? data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    ...data,
    corsOrigins,
    isProduction: data.NODE_ENV === 'production',
  };
}
