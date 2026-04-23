/**
 * Deterministic mock fixture for Onslip.
 *
 * Used when USE_MOCK_ONSLIP=true (the default until Zivar adds real
 * credentials). The fixture rotates its "open" set every call so the
 * sync loop actually sees changes happen — orders open, items get
 * added, bills close.
 *
 * Rules:
 *   - Side-effect free: each call returns based on a seeded clock, so
 *     tests can freeze time and get stable output.
 *   - Totals are NUMERIC-safe (2 decimals).
 */

import type { POSOrder } from '../types.js';

export interface MockState {
  /** Number of completed sync cycles — the mock uses this to rotate state. */
  cycle: number;
}

export function mockOpenOrders(locationId: string, state: MockState): POSOrder[] {
  // Three deterministic bills. On cycle 0 all three are open.
  // From cycle 3 onwards, bill #3 is closed (simulates guest paying
  // cash at the POS). From cycle 6, bill #1 gains a new item.
  const now = new Date('2026-04-23T19:00:00+02:00').getTime();

  const base: POSOrder[] = [
    {
      externalId: `${locationId}/onslip/1001`,
      tableNumber: '12',
      total: 425.0,
      currency: 'SEK',
      items: [
        { name: 'Husets pasta', qty: 2, unitPrice: 165 },
        { name: 'Kolsyrat vatten', qty: 1, unitPrice: 45 },
        { name: 'Espresso', qty: 1, unitPrice: 50 },
      ],
      openedAt: new Date(now - 20 * 60_000),
    },
    {
      externalId: `${locationId}/onslip/1002`,
      tableNumber: '3',
      total: 289.0,
      currency: 'SEK',
      items: [
        { name: 'Pilsner 50cl', qty: 3, unitPrice: 79 },
        { name: 'Bar-snacks', qty: 1, unitPrice: 52 },
      ],
      openedAt: new Date(now - 8 * 60_000),
    },
    {
      externalId: `${locationId}/onslip/1003`,
      tableNumber: '7',
      total: 612.0,
      currency: 'SEK',
      items: [
        { name: 'Dagens lunch', qty: 2, unitPrice: 175 },
        { name: 'Glas vin', qty: 2, unitPrice: 95 },
        { name: 'Kaffe', qty: 2, unitPrice: 36 },
      ],
      openedAt: new Date(now - 45 * 60_000),
    },
  ];

  if (state.cycle >= 6) {
    // Bill #1 picks up a dessert.
    const b = base[0];
    if (b) {
      b.items.push({ name: 'Chokladfondant', qty: 1, unitPrice: 85 });
      b.total = round2(b.total + 85);
    }
  }

  if (state.cycle >= 3) {
    // Bill #3 closes.
    const b = base[2];
    if (b) {
      b.closed = true;
    }
  }

  return base;
}

export function mockOrderById(
  locationId: string,
  orderId: string,
  state: MockState,
): POSOrder | undefined {
  return mockOpenOrders(locationId, state).find((o) => o.externalId === orderId);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
