/**
 * TipSelector — the dricks step.
 *
 * Mock layout (screens 3–4):
 *  • Serif heading "Dricks till köket?"
 *  • Subtitle "Hela dricksen går direkt till Elsa & teamet."
 *  • 2×2 grid of preset tip cards (selected = BLACK)
 *  • Full-width "Eget belopp" row (replaced with slider on select)
 *  • Summary card: Din del / Dricks · N% / Att betala
 *
 * Preserves the business logic from the original (KI-005):
 *  - 0 % rendered identically to 5/10/15 — no dark-pattern default
 *  - Custom cap: TIP_CUSTOM_MAX_PERCENT (30%) of order total
 *  - Controlled (parent owns the SEK amount) for payment-flow state-machine
 */

import { Plus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Card, cn } from '@flowpay/ui';
import type { TipOptions, TipPercent } from '@flowpay/schemas';

import { Amount } from './Amount';
import { formatAmount } from '../lib/format';

export const TIP_CUSTOM_MAX_PERCENT = 30;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface TipSelectorProps {
  orderTotal: number;
  tipOptions: TipOptions;
  defaultTipPercent: TipPercent;
  tipAmount: number;
  onTipChange: (tipAmount: number) => void;
  onInvalidChange?: (invalid: boolean) => void;
  currency?: string;
  disabled?: boolean;
  className?: string;
  /** When true, render the "Din del / Dricks / Att betala" summary card. */
  showSummary?: boolean;
}

type Selection =
  | { kind: 'preset'; percent: number }
  | { kind: 'custom'; raw: string };

function initialSelection(
  defaultTipPercent: number,
  options: readonly number[],
): Selection {
  const match = options.find((opt) => approximatelyEqual(opt, defaultTipPercent));
  if (match !== undefined) {
    return { kind: 'preset', percent: match };
  }
  if (defaultTipPercent === 0 && options.length > 0) {
    return { kind: 'preset', percent: options[0] ?? 0 };
  }
  return { kind: 'custom', raw: formatPercentForInput(defaultTipPercent) };
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

function formatPercentForInput(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return '';
  if (Number.isInteger(pct)) return String(pct);
  return String(round2(pct));
}

export function TipSelector({
  orderTotal,
  tipOptions,
  defaultTipPercent,
  tipAmount,
  onTipChange,
  onInvalidChange,
  currency = 'SEK',
  disabled = false,
  className,
  showSummary = true,
}: TipSelectorProps) {
  const headingId = useId();

  const normalisedOptions = useMemo<number[]>(() => {
    const raw = tipOptions.map((opt) => round2(opt));
    // Ensure we have exactly 4 slots in the grid. If the admin passed a
    // shorter list we pad with a sensible default; longer lists get trimmed.
    const fallback = [0, 5, 10, 15];
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      out.push(raw[i] ?? fallback[i] ?? 0);
    }
    return out;
  }, [tipOptions]);

  const maxCustomSek = useMemo(
    () => round2(orderTotal * (TIP_CUSTOM_MAX_PERCENT / 100)),
    [orderTotal],
  );

  const [selection, setSelection] = useState<Selection>(() =>
    initialSelection(defaultTipPercent, normalisedOptions),
  );

  const applySelection = useCallback(
    (next: Selection) => {
      setSelection(next);
      const nextAmount = amountFromSelection(next, orderTotal, maxCustomSek);
      if (Math.abs(nextAmount - tipAmount) > 0.005) {
        onTipChange(nextAmount);
      }
    },
    [orderTotal, maxCustomSek, onTipChange, tipAmount],
  );

  const onPresetClick = (percent: number) => {
    if (disabled) return;
    applySelection({ kind: 'preset', percent });
  };

  const onCustomToggle = () => {
    if (disabled) return;
    const currentPct = round2((tipAmount / Math.max(orderTotal, 0.01)) * 100);
    applySelection({
      kind: 'custom',
      raw: currentPct > 0 && currentPct <= TIP_CUSTOM_MAX_PERCENT
        ? formatPercentForInput(currentPct)
        : '',
    });
  };

  const onSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    const pct = Number(event.target.value);
    applySelection({ kind: 'custom', raw: formatPercentForInput(pct) });
  };

  const customInvalid =
    selection.kind === 'custom' && isCustomInvalid(selection.raw, maxCustomSek, orderTotal);
  const effectiveAmount = amountFromSelection(selection, orderTotal, maxCustomSek);
  const totalWithTip = round2(orderTotal + effectiveAmount);

  const lastReportedInvalid = useRef<boolean | null>(null);
  useEffect(() => {
    if (!onInvalidChange) return;
    if (lastReportedInvalid.current === customInvalid) return;
    lastReportedInvalid.current = customInvalid;
    onInvalidChange(customInvalid);
  }, [customInvalid, onInvalidChange]);

  const currentPercent = selection.kind === 'preset'
    ? selection.percent
    : (() => {
        const pct = Number(selection.raw.replace(',', '.'));
        return Number.isFinite(pct) ? round2(pct) : 0;
      })();

  return (
    <section aria-labelledby={headingId} className={cn('space-y-4', className)}>
      <div
        role="radiogroup"
        aria-labelledby={headingId}
        className="grid grid-cols-2 gap-3"
      >
        {normalisedOptions.map((percent, idx) => {
          const selected =
            selection.kind === 'preset' &&
            approximatelyEqual(selection.percent, percent);
          const sek = round2(orderTotal * (percent / 100));
          const label = percent === 0 ? 'Ingen' : `${formatPercentLabel(percent)}`;
          const sub = percent === 0 ? 'Ingen dricks' : `+ ${formatAmount(sek, currency, { omitCurrency: true })} kr`;
          return (
            <button
              key={`${percent}-${idx}`}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onPresetClick(percent)}
              className={cn(
                'flex h-[110px] flex-col items-start justify-between rounded-2xl border p-4 text-left',
                'transition-[background-color,border-color,transform] duration-150 active:translate-y-px',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
                'disabled:cursor-not-allowed disabled:opacity-60',
                selected
                  ? 'border-dark bg-dark text-white shadow-paper'
                  : 'border-hairline bg-paper text-ink hover:bg-shell',
              )}
            >
              <span className="font-serif text-[32px] font-semibold leading-none">
                {label}
              </span>
              <span
                className={cn(
                  'text-[13px]',
                  selected ? 'text-white/65' : 'text-graphite',
                )}
              >
                {sub}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom-amount row — replaces with slider when active. */}
      <button
        type="button"
        onClick={onCustomToggle}
        disabled={disabled}
        aria-pressed={selection.kind === 'custom'}
        className={cn(
          'flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left',
          'transition-[background-color,border-color] duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
          'disabled:cursor-not-allowed disabled:opacity-60',
          selection.kind === 'custom'
            ? 'border-dark bg-dark text-white'
            : 'border-hairline bg-paper text-ink hover:bg-shell',
        )}
      >
        <span className="text-[15px] font-semibold">Eget belopp</span>
        {selection.kind === 'custom' ? (
          <span className="whitespace-nowrap tabular-nums">
            <span className="text-[17px] font-semibold text-white">
              {formatAmount(effectiveAmount, currency, { omitCurrency: true })}
            </span>
            <span className="ml-0.5 text-[11px] font-normal text-white/60">kr</span>
          </span>
        ) : (
          <Plus size={18} strokeWidth={2} className="text-graphite" />
        )}
      </button>

      {selection.kind === 'custom' ? (
        <div className="rounded-2xl border border-hairline bg-paper px-4 py-4">
          <input
            type="range"
            min={0}
            max={TIP_CUSTOM_MAX_PERCENT}
            step={0.5}
            value={Math.min(currentPercent, TIP_CUSTOM_MAX_PERCENT)}
            onChange={onSliderChange}
            disabled={disabled}
            className="w-full accent-ink"
            aria-label="Dricks i procent"
          />
          {customInvalid ? (
            <p role="alert" className="mt-2 text-[12px] text-accent">
              Max {TIP_CUSTOM_MAX_PERCENT}% av notan ({formatAmount(maxCustomSek, currency)}).
            </p>
          ) : null}
        </div>
      ) : null}

      {showSummary ? (
        <Card variant="shell" radius="lg" padding="md">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-graphite">Din del</span>
              <Amount value={orderTotal} size="md" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-graphite">
                Dricks{effectiveAmount > 0 ? ` · ${formatPercentLabel(currentPercent)}` : ''}
              </span>
              <Amount value={effectiveAmount} size="md" />
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-hairline pt-2">
              <span className="text-[17px] font-semibold text-ink">Att betala</span>
              <Amount value={totalWithTip} size="xl" />
            </div>
          </div>
        </Card>
      ) : null}

      {/* Visually-hidden heading so the radiogroup has an accessible name. */}
      <h2 id={headingId} className="sr-only">
        Dricks
      </h2>
    </section>
  );
}

function amountFromSelection(
  selection: Selection,
  orderTotal: number,
  maxCustomSek: number,
): number {
  if (selection.kind === 'preset') {
    return round2(orderTotal * (selection.percent / 100));
  }
  const raw = selection.raw.trim();
  if (raw === '') return 0;
  const pct = Number(raw.replace(',', '.'));
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  const sek = round2(orderTotal * (pct / 100));
  if (sek > maxCustomSek) return maxCustomSek;
  return sek;
}

function isCustomInvalid(
  raw: string,
  maxCustomSek: number,
  orderTotal: number,
): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return false;
  const pct = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(pct) || pct < 0) return true;
  if (pct > TIP_CUSTOM_MAX_PERCENT) return true;
  const sek = round2(orderTotal * (pct / 100));
  return sek > maxCustomSek;
}

function formatPercentLabel(percent: number): string {
  if (Number.isInteger(percent)) return `${percent}%`;
  return `${String(round2(percent)).replace('.', ',')}%`;
}

export function computeInitialTipAmount(
  orderTotal: number,
  defaultTipPercent: number,
  tipOptions: readonly number[],
): number {
  const normalised = tipOptions.map((opt) => round2(opt));
  const selection = initialSelection(defaultTipPercent, normalised);
  const maxCustomSek = round2(orderTotal * (TIP_CUSTOM_MAX_PERCENT / 100));
  return amountFromSelection(selection, orderTotal, maxCustomSek);
}

export const __internals = {
  amountFromSelection,
  isCustomInvalid,
  initialSelection,
  formatPercentLabel,
};
