import { motion } from 'framer-motion';
import { ArrowRight, Lock, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Button, Card } from '@flowpay/ui';
import type { OrderByTokenResponse } from '@flowpay/schemas';

import { Amount } from './Amount';
import { ItemRow } from './ItemRow';
import { ScreenHeader } from './ScreenHeader';
import { formatAmount } from '../lib/format';

/**
 * Full bill view — the editorial Vildsvin & Vin layout from the mocks.
 *
 * Layout:
 *   • header with back + progress dots (step 2/5)
 *   • orange meta strip ("BORD 7 · ÖPPNAD 19:42")
 *   • serif italic restaurant name
 *   • address line
 *   • paper card with item rows + dotted dividers
 *   • moms breakdown (heuristic, until POS sends categories)
 *   • "Att betala" + total in serif
 *   • lock line ("Org.nr ... · Kvitto skickas efter betalning")
 *   • orange CTA "Betala hela"
 *   • white outline CTA "Splitta notan"
 */
export function BillView({
  order,
  tableLabel,
  address,
  orgNumber,
  onBack,
  onPayFull,
  onSplit,
}: {
  order: OrderByTokenResponse;
  tableLabel: string;
  address?: string;
  orgNumber?: string;
  onBack: () => void;
  onPayFull: () => void;
  onSplit: () => void;
}) {
  const canPay = order.status === 'open' || order.status === 'paying';
  const openedAt = formatTimeOfDay(order.updatedAt);
  const vat = useMemo(() => estimateVatBreakdown(order), [order]);

  const container = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.04, delayChildren: 0.02 },
    },
  };
  const item = {
    hidden: { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.22 } },
  };

  return (
    <main className="flex min-h-dvh flex-col bg-paper pb-10 text-ink">
      <ScreenHeader onBack={onBack} totalSteps={5} step={2} />

      <div className="px-6 pt-5">
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.16em] text-accent">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          {tableLabel.toUpperCase()} · ÖPPNAD {openedAt}
        </div>

        <h1 className="mt-3 font-serif-italic text-[38px] font-semibold leading-tight text-ink">
          {order.restaurant.name}
        </h1>
        {address ? (
          <p className="mt-1 text-[14px] text-graphite">{address}</p>
        ) : null}
      </div>

      <div className="px-5 pt-6">
        <Card variant="paper" radius="lg" padding="none" elevation="raised" className="overflow-hidden">
          <motion.ul
            variants={container}
            initial="hidden"
            animate="visible"
            className="px-5"
          >
            {order.items.map((line, idx) => (
              <motion.li
                variants={item}
                key={`${line.name}-${idx}`}
                className={idx > 0 ? 'border-t border-dashed border-hairline' : ''}
              >
                <ItemRow qty={line.qty} name={line.name} amount={line.lineTotal} />
              </motion.li>
            ))}
          </motion.ul>

          {vat.total12 > 0 || vat.total25 > 0 ? (
            <div className="border-t border-dashed border-hairline px-5 pb-4 pt-4">
              {vat.total12 > 0 ? (
                <div className="flex items-baseline justify-between text-[13px] text-graphite">
                  <span>Varav moms (12 %)</span>
                  <Amount value={vat.total12} size="sm" />
                </div>
              ) : null}
              {vat.total25 > 0 ? (
                <div className="mt-1 flex items-baseline justify-between text-[13px] text-graphite">
                  <span>Varav moms (25 %)</span>
                  <Amount value={vat.total25} size="sm" />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-baseline justify-between border-t border-hairline px-5 py-5">
            <span className="text-[17px] font-semibold text-ink">Att betala</span>
            <Amount value={order.total} size="hero" />
          </div>
        </Card>

        {orgNumber ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-graphite">
            <Lock size={12} strokeWidth={1.8} />
            <span>
              Org.nr {orgNumber} · Kvitto skickas efter betalning
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-8 px-5">
        <Button
          variant="primary"
          size="lg"
          block
          onClick={onPayFull}
          disabled={!canPay}
          trailingIcon={<ArrowRight size={18} strokeWidth={2.2} />}
        >
          Betala hela · {formatAmount(order.total, order.currency)}
        </Button>
        <Button
          variant="outline"
          size="lg"
          block
          className="mt-3"
          onClick={onSplit}
          disabled={!canPay}
          leadingIcon={<Users size={16} strokeWidth={1.8} />}
        >
          Splitta notan
        </Button>
      </div>
    </main>
  );
}

function formatTimeOfDay(iso: string): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Stockholm',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

/**
 * Back out an approximate Swedish VAT breakdown from the item list.
 *
 * MVP placeholder — until the POS adapters push item-level VAT rates
 * into `orders_cache.items`, we heuristic-split on beverage keywords:
 * wine/beer/spirits → 25 %, everything else → 12 %. The numbers are
 * directional, not audit-grade; Swedish restaurants only need the true
 * breakdown on the printed kassakvitto, which the POS owns.
 */
const BEVERAGE_RE = /\b(vin|öl|beer|wine|barolo|champagne|cider|sprit|drink|glas|whisky|rom|gin)\b/i;

function estimateVatBreakdown(order: OrderByTokenResponse): {
  total12: number;
  total25: number;
} {
  let drinks = 0;
  let food = 0;
  for (const it of order.items) {
    if (BEVERAGE_RE.test(it.name)) drinks += it.lineTotal;
    else food += it.lineTotal;
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    total12: round2((food * 12) / 112),
    total25: round2((drinks * 25) / 125),
  };
}
