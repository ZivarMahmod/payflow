/**
 * Onslip wire-format → FlowPay normalized types.
 *
 * Onslip's open-orders endpoint returns (approximate shape from their docs):
 *   {
 *     id: string,
 *     tableName: string | null,
 *     totalAmount: number,          // SEK, float — we convert to numeric-safe string elsewhere
 *     currency: 'SEK',
 *     createdAt: '2026-04-23T19:12:00+02:00',
 *     status: 'open' | 'closed',
 *     items: [ { name, quantity, unitPrice } ]
 *   }
 *
 * The real Onslip payload has a dozen other fields (VAT breakdowns, POS
 * user, opening staff, printer queue state) that we deliberately drop —
 * they're not our business and we don't want to cache them.
 */

import { z } from 'zod';
import { POSAdapterError, type POSOrder } from '../types.js';

/**
 * Onslip's observed response shape. Zod-validated at the boundary so a
 * surprise schema change surfaces as a typed error, not a runtime blowup
 * further down the pipeline.
 */
export const OnslipOrderSchema = z.object({
  id: z.string().min(1),
  tableName: z.string().nullable().optional(),
  totalAmount: z.number().nonnegative(),
  currency: z.string().length(3).default('SEK'),
  createdAt: z.string().min(1),
  status: z.enum(['open', 'closed', 'paid']).optional(),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
      }),
    )
    .default([]),
});

export type OnslipOrder = z.infer<typeof OnslipOrderSchema>;

export function mapOnslipOrder(raw: unknown): POSOrder {
  const parsed = OnslipOrderSchema.safeParse(raw);
  if (!parsed.success) {
    throw new POSAdapterError(
      'BAD_RESPONSE',
      `Onslip order payload failed validation: ${parsed.error.message.slice(0, 200)}`,
      { retryable: false, cause: parsed.error },
    );
  }
  const o = parsed.data;
  const openedAt = new Date(o.createdAt);
  if (Number.isNaN(openedAt.getTime())) {
    throw new POSAdapterError('BAD_RESPONSE', `Unparseable createdAt: ${o.createdAt}`, {
      retryable: false,
    });
  }

  return {
    externalId: o.id,
    tableNumber: o.tableName ?? null,
    total: round2(o.totalAmount),
    currency: o.currency,
    items: o.items.map((it) => ({
      name: it.name,
      qty: it.quantity,
      unitPrice: round2(it.unitPrice),
    })),
    openedAt,
    closed: o.status === 'closed' || o.status === 'paid',
  };
}

/** Defensive rounding — Onslip sometimes ships 3 decimals. We store 2. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
