/**
 * Exposes the validated runtime config on the Fastify instance as
 * `fastify.config`. Registered before any plugin that reads env vars.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { type AppConfig, loadConfig } from '../config.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}

const configPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const cfg = loadConfig();
  fastify.decorate('config', cfg);
  fastify.log.info(
    {
      nodeEnv: cfg.NODE_ENV,
      port: cfg.PORT,
      mocks: {
        onslip: cfg.USE_MOCK_ONSLIP,
        caspeco: cfg.USE_MOCK_CASPECO,
        swish: cfg.USE_MOCK_SWISH,
        stripe: cfg.USE_MOCK_STRIPE,
        google: cfg.USE_MOCK_GOOGLE,
      },
    },
    'Config loaded.',
  );
};

export default fp(configPlugin, {
  name: 'flowpay-config',
  fastify: '5.x',
});
