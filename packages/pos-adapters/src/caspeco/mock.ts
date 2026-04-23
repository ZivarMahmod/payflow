/**
 * Deterministic Caspeco mock fixture.
 *
 * Same contract as `onslip/mock.ts`: returns a rotating set of open
 * bills so the sync loop observes state changes without any network
 * traffic. Active when USE_MOCK_CASPECO=true (the default).
 *
 * The numbers are chosen to differ from Onslip's fixture so mixed
 * deployments (one restaurant on each POS) can be distinguished in the
 * dev database at a glance.
 */

import type { POSOrder } from '../types.js';

export interface CaspecoMockState {
  /** Number of completed sync cycles. */
  cycle: number;
}

export function mockCaspecoOrders(locationId: string, state: CaspecoMockState): POSOrder[] {
  // Deterministic clock — same fixed "now" as Onslip's mock so tests can
  // freeze both at once.
  const now = new Date('2026-04-23T19:00:00+02:00').getTime();

  const base: POSOrder[] = [
    {
      externalId: `${locationId}/caspeco/77001`,
      tableNumber: '4',
      total: 542.0,
      currency: 'SEK',
      items: [
        { name: 'Flank steak', qty: 2, unitPrice: 245 },
        { name: 'Pommes frites', qty: 1, unitPrice: 52 },
      ],
      openedAt: new Date(now - 32 * 60_000),
    },
    {
      externalId: `${locationId}/caspeco/77002`,
      tableNumber: '9',
      total: 198.0,
      currency: 'SEK',
      items: [
        { name: 'Ipa 50cl', qty: 2, unitPrice: 89 },
        { name: 'Oliver', qty: 1, unitPrice: 20 },
      ],
      openedAt: new Date(now - 11 * 60_000),
    },
    {
      externalId: `${locationId}/caspeco/77003`,
      tableNumber: null, // takeaway
      total: 130.0,
      currency: 'SEK',
      items: [{ name: 'Veckans sallad', qty: 1, unitPrice: 130 }],
      openedAt: new Date(now - 4 * 60_000),
    },
  ];

  if (state.cycle >= 4) {
    // Takeaway order closes (guest picked up + paid at counter).
    const b = base[2];
    if (b) {
      b.closed = true;
    }
  }

  if (state.cycle >= 7) {
    // Table 4 orders dessert.
    const b = base[0];
    if (b) {
      b.items.push({ name: 'Créme brûlée', qty: 1, unitPrice: 95 });
      b.total = round2(b.total + 95);
    }
  }

  return base;
}

export function mockCaspecoOrderById(
  locationId: string,
  orderId: string,
  state: CaspecoMockState,
): POSOrder | undefined {
  return mockCaspecoOrders(locationId, state).find((o) => o.externalId === orderId);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
