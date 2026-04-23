/**
 * Caspeco wire-format → FlowPay normalized types.
 *
 * Caspeco's REST API returns (approximate shape, derived from their
 * Partner docs):
 *   {
 *     receiptId: string,          // stable ID — what we use for externalId
 *     tableLabel: string | null,
 *     grandTotal: number,         // SEK, up to 2 decimals
 *     currencyCode: 'SEK',
 *     openedAt: '2026-04-23T19:12:00+02:00',
 *     state: 'OPEN' | 'CLOSED' | 'PAID' | 'VOIDED',
 *     rows: [ { articleName, quantity, unitPriceIncVat } ]
 *   }
 *
 * Notable vs Onslip:
 *   - Caspeco ships prices INCLUDING VAT on the row level (unitPriceIncVat).
 *     We treat that as the unit price — our bill is VAT-inclusive end-to-end.
 *   - State "VOIDED" is distinct from "CLOSED" but we collapse them both
 *     into `closed=true` since FlowPay cares only "is the bill still live".
 *   - The VAT breakdown, kitchen-ticket state, split-table metadata are
 *     all dropped — not our business.
 */

import { z } from 'zod';
import { POSAdapterError, type POSOrder } from '../types.js';

export const CaspecoOrderSchema = z.object({
  receiptId: z.string().min(1),
  tableLabel: z.string().nullable().optional(),
  grandTotal: z.number().nonnegative(),
  currencyCode: z.string().length(3).default('SEK'),
  openedAt: z.string().min(1),
  state: z.enum(['OPEN', 'CLOSED', 'PAID', 'VOIDED']).optional(),
  rows: z
    .array(
      z.object({
        articleName: z.string().min(1),
        quantity: z.number().positive(),
        unitPriceIncVat: z.number().nonnegative(),
      }),
    )
    .default([]),
});

export type CaspecoOrder = z.infer<typeof CaspecoOrderSchema>;

export function mapCaspecoOrder(raw: unknown): POSOrder {
  const parsed = CaspecoOrderSchema.safeParse(raw);
  if (!parsed.success) {
    throw new POSAdapterError(
      'BAD_RESPONSE',
      `Caspeco order payload failed validation: ${parsed.error.message.slice(0, 200)}`,
      { retryable: false, cause: parsed.error },
    );
  }
  const o = parsed.data;

  const openedAt = new Date(o.openedAt);
  if (Number.isNaN(openedAt.getTime())) {
    throw new POSAdapterError('BAD_RESPONSE', `Caspeco unparseable openedAt: ${o.openedAt}`, {
      retryable: false,
    });
  }

  return {
    externalId: o.receiptId,
    tableNumber: o.tableLabel ?? null,
    total: round2(o.grandTotal),
    currency: o.currencyCode,
    items: o.rows.map((r) => ({
      name: r.articleName,
      qty: r.quantity,
      unitPrice: round2(r.unitPriceIncVat),
    })),
    openedAt,
    closed: o.state === 'CLOSED' || o.state === 'PAID' || o.state === 'VOIDED',
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
