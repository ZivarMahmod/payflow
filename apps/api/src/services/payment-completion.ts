/**
 * payment-completion — single chokepoint for "this payment just settled".
 *
 * Why so thin?
 *   - The actual POS-side mutation is handled by a DB trigger (see
 *     migration 007_pos_update_queue.sql). Every path that flips a
 *     payment to status='completed' — the /payments/:id/confirm route,
 *     a future Stripe webhook, an admin `psql` session — automatically
 *     enqueues a `pos_update_queue` row. That defense-in-depth means we
 *     literally cannot forget to enqueue.
 *   - This module exists so callers don't have to know that. They call
 *     `completePayment()` and stop thinking about it. The function is
 *     idempotent: a second call returns `{ alreadyCompleted: true }`
 *     without writing anything.
 *
 * Not used by POST /payments/:id/confirm yet — that route does its own
 * SQL UPDATE today and the trigger fires regardless. When we wire up
 * the Stripe webhook (POS-003) and the admin manual-mark flow it will
 * consume this helper.
 */

import type { Database } from '@flowpay/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';

type PaymentUpdate = Database['public']['Tables']['payments']['Update'];

export interface CompletePaymentInput {
  adminClient: SupabaseClient<Database>;
  paymentId: string;
  /** Provider transaction id (Swish reference, Stripe charge id, etc.). */
  providerTxId?: string;
}

export interface CompletePaymentResult {
  /** True iff this call performed the UPDATE. False = already completed. */
  flipped: boolean;
  /** True if the row was already in `completed` when we looked. */
  alreadyCompleted: boolean;
}

export class PaymentCompletionError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'BAD_STATE' | 'DB_ERROR',
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PaymentCompletionError';
  }
}

/**
 * Mark a payment as completed.
 *
 * Idempotent — safe to call repeatedly:
 *   - Only flips `pending` → `completed`. Other source states throw.
 *   - When already completed, returns `{ flipped: false, alreadyCompleted: true }`
 *     without writing.
 *
 * The DB trigger `payments_enqueue_pos_update_trigger` (migration 007)
 * picks up the transition and enqueues the POS update — we do NOT need
 * to enqueue from app code. Anti-pattern reminder: do NOT also call the
 * adapter from here, that's the queue worker's job.
 */
export async function completePayment(
  input: CompletePaymentInput,
): Promise<CompletePaymentResult> {
  const { adminClient, paymentId, providerTxId } = input;

  // Read first so we can give a precise error for terminal states like
  // 'expired' / 'failed'. The race between the SELECT and the UPDATE is
  // benign: the UPDATE has `where status = 'pending'` so a concurrent
  // flip just returns 0 rows updated and we land in the
  // already-completed branch on a re-read.
  const { data: existing, error: readErr } = await adminClient
    .from('payments')
    .select('id, status')
    .eq('id', paymentId)
    .maybeSingle();

  if (readErr) {
    throw new PaymentCompletionError(
      `failed to read payment ${paymentId}: ${readErr.message}`,
      'DB_ERROR',
      readErr,
    );
  }
  if (!existing) {
    throw new PaymentCompletionError(`payment ${paymentId} not found`, 'NOT_FOUND');
  }
  if (existing.status === 'completed') {
    return { flipped: false, alreadyCompleted: true };
  }
  if (existing.status !== 'pending') {
    throw new PaymentCompletionError(
      `payment ${paymentId} is in terminal state '${existing.status}', cannot complete`,
      'BAD_STATE',
    );
  }

  const update: PaymentUpdate = {
    status: 'completed',
    paid_at: new Date().toISOString(),
    ...(providerTxId !== undefined ? { provider_tx_id: providerTxId } : {}),
  };

  const { data: flipped, error: updErr } = await adminClient
    .from('payments')
    .update(update)
    .eq('id', paymentId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (updErr) {
    throw new PaymentCompletionError(
      `failed to complete payment ${paymentId}: ${updErr.message}`,
      'DB_ERROR',
      updErr,
    );
  }

  // 0 rows = someone else flipped it between our read and update. Treat
  // as success-by-someone-else.
  if (!flipped) {
    return { flipped: false, alreadyCompleted: true };
  }

  return { flipped: true, alreadyCompleted: false };
}
