import { useParams } from 'react-router-dom';
import { Card, Stack, Button } from '@flowpay/ui';
import type { Order } from '@flowpay/schemas';

import { useOrderToken } from '../hooks/useOrderToken';
import { formatOre } from '../lib/format';

/**
 * Dummy-nota used by KI-001 verification. Replaced by real `/orders/:token`
 * data in KI-002. Shape matches `@flowpay/schemas`'s `Order` so the swap
 * is a one-line change at call-site.
 *
 * Amounts are in öre — see packages/schemas for the rule.
 */
const DUMMY_ORDER: Omit<Order, 'token' | 'tenantSlug' | 'tableId' | 'updatedAt'> = {
  currency: 'SEK',
  status: 'open',
  items: [
    { id: '1', name: 'Burrata med tomat', quantity: 1, unitPriceOre: 18500, totalOre: 18500 },
    { id: '2', name: 'Tagliatelle al ragù', quantity: 2, unitPriceOre: 22500, totalOre: 45000 },
    { id: '3', name: 'Hus-tiramisu', quantity: 1, unitPriceOre: 9500, totalOre: 9500 },
    { id: '4', name: 'Sparkling water 0.5 l', quantity: 1, unitPriceOre: 4500, totalOre: 4500 },
  ],
  subtotalOre: 77500,
  totalOre: 77500,
  paidOre: 0,
};

export function OrderRoute() {
  const { slug, tableId } = useParams<{ slug: string; tableId: string }>();
  const tokenState = useOrderToken();

  if (tokenState.status !== 'ok') {
    return <NoOrderState reason={tokenState.status} />;
  }

  // In KI-001 we ignore the token for the render — we're proving the PWA
  // shell + routing + token-parse path only. Real fetch lands in KI-002.
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-paper px-4 py-6 text-ink">
      <header className="mb-6">
        <p className="text-sm text-graphite">
          {slug ?? '—'} · Bord {tableId ?? '—'}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Din nota</h1>
      </header>

      <Card padding="none">
        <ul className="divide-y divide-hairline">
          {DUMMY_ORDER.items.map((item) => (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{item.name}</p>
                {item.quantity > 1 ? (
                  <p className="text-sm text-graphite">
                    {item.quantity} × {formatOre(item.unitPriceOre)}
                  </p>
                ) : null}
              </div>
              <p className="tabular-nums font-medium">
                {formatOre(item.totalOre)}
              </p>
            </li>
          ))}
        </ul>

        <div className="flex items-baseline justify-between gap-3 border-t border-hairline px-4 py-4">
          <p className="text-sm text-graphite">Att betala</p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatOre(DUMMY_ORDER.totalOre)}
          </p>
        </div>
      </Card>

      <Stack gap={3} className="mt-6">
        <Button variant="primary" size="lg" block disabled aria-describedby="pay-hint">
          Betala hela notan
        </Button>
        <p id="pay-hint" className="text-center text-xs text-graphite">
          Betalflöde aktiveras i nästa steg (KI-003).
        </p>
      </Stack>
    </main>
  );
}

function NoOrderState({ reason }: { reason: 'missing' | 'invalid' }) {
  const copy =
    reason === 'invalid'
      ? {
          title: 'Ogiltig QR-kod',
          body: 'Koden verkar skadad. Be personalen skriva ut en ny, eller försök skanna igen.',
        }
      : {
          title: 'Ingen aktiv beställning',
          body: 'Vi hittar ingen pågående beställning för det här bordet. Ropa på personalen om du tror det är fel.',
        };

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-paper px-4 py-10 text-ink">
      <Card padding="md">
        <Stack gap={4}>
          <h1 className="text-xl font-semibold">{copy.title}</h1>
          <p className="text-graphite">{copy.body}</p>
        </Stack>
      </Card>
    </main>
  );
}
