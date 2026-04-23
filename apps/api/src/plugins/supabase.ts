/**
 * Supabase plugin — decorates the Fastify instance with two clients:
 *
 *   fastify.supabase       — anon client (uses ANON_KEY). Honours RLS.
 *                             Safe to use from routes that run for
 *                             unauthenticated guests (e.g. /orders/:token
 *                             via the get_order_by_token RPC).
 *
 *   fastify.supabaseAdmin  — service-role client (uses SERVICE_KEY).
 *                             Bypasses RLS. Use ONLY from server-side
 *                             flows that have no user context — POS
 *                             webhooks, payment webhooks, cron jobs,
 *                             onboarding.
 *
 * RULE (from the brief, anti-pattern #2): never return the admin client
 * from a handler that executes on behalf of a client request without
 * explicit authorisation. If in doubt, use `fastify.supabase`.
 */

import type { Database } from '@flowpay/db/types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export type FlowpaySupabaseClient = SupabaseClient<Database>;

declare module 'fastify' {
  interface FastifyInstance {
    supabase: FlowpaySupabaseClient;
    supabaseAdmin: FlowpaySupabaseClient;
  }
}

const supabasePlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY } = fastify.config;

  const anon = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  fastify.decorate('supabase', anon);
  fastify.decorate('supabaseAdmin', admin);

  fastify.log.info(
    { url: SUPABASE_URL },
    'Supabase clients initialised (anon + service role).',
  );
};

export default fp(supabasePlugin, {
  name: 'flowpay-supabase',
  fastify: '5.x',
});
