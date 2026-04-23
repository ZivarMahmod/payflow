import { defineConfig } from 'vitest/config';

/**
 * Vitest config for @flowpay/api.
 *
 * - Node env (no jsdom — this is a server).
 * - Tests live next to the code as `*.test.ts`.
 * - Env vars are scrubbed by each test via beforeEach — see orders.test.ts.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Per-test timeout: Fastify startup is fast but adds ~50ms. Give headroom.
    testTimeout: 10_000,
    // Tests mutate process.env — run sequentially to avoid cross-file flake.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
