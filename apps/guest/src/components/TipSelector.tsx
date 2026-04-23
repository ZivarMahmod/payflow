/**
 * TipSelector — the dricks step of the payment flow.
 *
 * Brief: BRIEF-KI-005. Placed between the amount card and the payment-method
 * selector on /pay. Swedish dining norm: 0% is the default, 5–10% is common
 * in nice rooms, custom ("eget belopp") is always available.
 *
 * ─── UX principles (explicitly in the brief) ────────────────────────────────
 *  1. NEVER coerce a tip: `0` is rendered identically to `5` and `10` — same
 *     size button, same position priority, same visual weight. No sneaky
 *     pre-checked 10%. If the admin picked 0 as default_tip_percent, the
 *     0-button is selected on mount. If the admin picked 10, the 10-button
 *     is selected. We mirror admin intent, not a dark-pattern default.
 *  2. Custom input caps at 30% of the bill total — the same ceiling the DB
 *     constraint `restaurants_default_tip_percent_range` enforces on preset.
 *     Over-input shows an aria-invalid message and disables "Betala".
 *  3. Animated total preview, respecting prefers-reduced-motion (via the
 *     Framer Motion reducedMotion="user" setting already applied by the
 *     guest PWA's MotionConfig — opting out here means no motion at all).
 *
 * ─── Why controlled (vs. self-managed) ──────────────────────────────────────
 * The payment route needs `tipAmount` to pass to `/payments/initiate`.
 * Making it controlled keeps the route's state machine the single source
 * of truth for "what will be charged", which matters for the expired-
 * then-retry path (we keep the guest's tip when they tap "Försök igen").
 *
 * ─── Rounding ───────────────────────────────────────────────────────────────
 * Presets compute `round2(total * pct/100)`. We round to öre so the final
 * `amount + tip_amount` is a safe NUMERIC(10,2) value for the payments
 * row. The server recomputes from amount + tip_amount for the audit trail
 * — not from percent — so client rounding cannot drift the ledger.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { Input, cn } from '@flowpay/ui';
import type { TipOptions, TipPercent } from '@flowpay/schemas';

import { formatAmount } from '../lib/format';

/** Hard ceiling on custom-tip input. Mirrors the DB CHECK on default_tip_percent. */
export const TIP_CUSTOM_MAX_PERCENT = 30;

/** Two-decimal rounding — keeps amounts safe for NUMERIC(10,2). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Controlled, parent-owned tip state. See file-level comment for why.
 */
export interface TipSelectorProps {
  /** Non-tip bill amount in decimal SEK. Drives the cap + preset compute. */
  orderTotal: number;
  /** Preset % buttons. May be empty; the component degrades to custom-only. */
  tipOptions: TipOptions;
  /**
   * Preset % pre-selected on first mount. Falls back to custom-mode pre-fill
   * when it doesn't match any preset; see `initialSelection()` below.
   */
  defaultTipPercent: TipPercent;
  /** Current tip in SEK — the parent's state. */
  tipAmount: number;
  /** Parent-owned setter. Fires on every change, including custom input. */
  onTipChange: (tipAmount: number) => void;
  /**
   * Optional: called when the custom-input validity flips (true → invalid,
   * e.g. over-cap or NaN). The parent uses this to block "Betala" so we
   * never initiate a payment with an impossibly-large tip. Empty-string
   * input is NOT reported as invalid — it just means "no tip".
   */
  onInvalidChange?: (invalid: boolean) => void;
  /** Rendered in the animated total preview. Defaults to SEK. */
  currency?: string;
  /** Freeze inputs while a mutation is in flight. */
  disabled?: boolean;
  /** Optional className for container overrides (rare). */
  className?: string;
}

/**
 * Internal selection state. Kept inside the component because the parent
 * only cares about the resulting SEK amount — mode-vs-preset is a UI detail.
 */
type Selection =
  | { kind: 'preset'; percent: number }
  | { kind: 'custom'; raw: string };

/**
 * Decide where the tip selector should land on mount given the admin's
 * `default_tip_percent`.
 *
 * Priority order:
 *   (a) If the default exactly matches a preset button → use that preset.
 *   (b) If the default is 0 and there's no 0-preset → use whatever preset
 *       the admin listed first (degrade gracefully; admins should include 0
 *       per UX principle #1, but the schema doesn't enforce it).
 *   (c) Otherwise → prefill custom mode with the default value.
 */
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

/**
 * `a ≈ b` within NUMERIC(5,2)'s epsilon. Guard against float noise from
 * the JSON decoder (e.g. 10.00 vs 10).
 */
function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/** Render a % for the custom input — strips ".00" noise for cleanliness. */
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
}: TipSelectorProps) {
  const reduceMotion = useReducedMotion();
  const headingId = useId();
  const customInputId = useId();
  const customErrorId = useId();

  // Normalise / clamp inputs from the API so we never compute against garbage.
  const normalisedOptions = useMemo<number[]>(
    () => tipOptions.map((opt) => round2(opt)),
    [tipOptions],
  );
  const maxCustomSek = useMemo(
    () => round2(orderTotal * (TIP_CUSTOM_MAX_PERCENT / 100)),
    [orderTotal],
  );

  // `selection` is a UI-only detail (preset-vs-custom + which preset is
  // highlighted). The PARENT owns the SEK `tipAmount`. On mount we derive
  // selection from the admin's defaults using the same helper the parent
  // used to seed its own state (`computeInitialTipAmount`), so the two
  // stay aligned without a bootstrap side-effect. No useEffect = no
  // double-fire on React strict-mode remounts.
  const [selection, setSelection] = useState<Selection>(() =>
    initialSelection(defaultTipPercent, normalisedOptions),
  );

  // Whenever selection changes from a USER action, recompute + push up.
  // Kept as a callback rather than a useEffect to avoid the "double-fire
  // on strict-mode effect re-run" pitfall.
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
    // Seed the custom input with the currently-effective % so switching
    // feels like "fine-tune this" instead of "start over at 0".
    const currentPct = round2((tipAmount / Math.max(orderTotal, 0.01)) * 100);
    applySelection({
      kind: 'custom',
      raw: currentPct > 0 ? formatPercentForInput(currentPct) : '',
    });
  };

  const onCustomInput = (event: ChangeEvent<HTMLInputElement>) => {
    // HTML type="number" still hands us a string; keep the raw value so we
    // can show "" / "5." mid-typing without coercing to 0.
    applySelection({ kind: 'custom', raw: event.target.value });
  };

  const onCustomKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter commits; we don't actually need behaviour here because the
    // input is controlled — but we swallow Enter so it doesn't submit
    // any parent <form> that wraps us in a future screen.
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  };

  const customInvalid = selection.kind === 'custom' && isCustomInvalid(selection.raw, maxCustomSek, orderTotal);
  const effectiveAmount = amountFromSelection(selection, orderTotal, maxCustomSek);
  const totalWithTip = round2(orderTotal + effectiveAmount);

  // Report validity changes to the parent (which uses it to block submit).
  // We only fire on *flips* — firing every render would cause the parent
  // to re-render on every keystroke, which React Query + Framer Motion
  // can tolerate but isn't free.
  const lastReportedInvalid = useRef<boolean | null>(null);
  useEffect(() => {
    if (!onInvalidChange) return;
    if (lastReportedInvalid.current === customInvalid) return;
    lastReportedInvalid.current = customInvalid;
    onInvalidChange(customInvalid);
  }, [customInvalid, onInvalidChange]);

  return (
    <section
      aria-labelledby={headingId}
      className={cn('space-y-4', className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-lg font-semibold">
          Dricks
        </h2>
        <p className="text-sm text-graphite">Frivilligt</p>
      </div>

      {normalisedOptions.length > 0 ? (
        <div
          role="radiogroup"
          aria-labelledby={headingId}
          className="grid grid-cols-3 gap-2"
        >
          {normalisedOptions.map((percent) => {
            const selected =
              selection.kind === 'preset' &&
              approximatelyEqual(selection.percent, percent);
            const sek = round2(orderTotal * (percent / 100));
            return (
              <button
                key={percent}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onPresetClick(percent)}
                className={cn(
                  'flex min-h-[64px] flex-col items-center justify-center rounded-md border px-2 py-2 text-center',
                  'transition-[border-color,background-color,box-shadow] duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  selected
                    ? 'border-accent bg-accent/10 text-ink shadow-[inset_0_0_0_1px_var(--flow-accent)]'
                    : 'border-hairline bg-paper text-ink hover:border-ink/30',
                )}
              >
                <span className="text-base font-semibold tabular-nums">
                  {formatPercentLabel(percent)}
                </span>
                <span className="text-xs text-graphite tabular-nums">
                  {percent === 0 ? 'Ingen dricks' : `+${formatAmount(sek, currency)}`}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCustomToggle}
          disabled={disabled}
          aria-pressed={selection.kind === 'custom'}
          className={cn(
            'text-sm underline-offset-4 hover:underline',
            selection.kind === 'custom' ? 'text-ink' : 'text-graphite',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          Eget belopp
        </button>
        <p className="text-xs text-graphite">Max {TIP_CUSTOM_MAX_PERCENT}% av notan</p>
      </div>

      {selection.kind === 'custom' ? (
        <div className="space-y-1">
          <label htmlFor={customInputId} className="block text-sm text-graphite">
            Dricks i procent
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={customInputId}
              size="md"
              type="number"
              min={0}
              max={TIP_CUSTOM_MAX_PERCENT}
              step="0.1"
              inputMode="decimal"
              value={selection.raw}
              onChange={onCustomInput}
              onKeyDown={onCustomKeyDown}
              disabled={disabled}
              aria-invalid={customInvalid}
              aria-describedby={customInvalid ? customErrorId : undefined}
              className="max-w-[9rem] tabular-nums"
            />
            <span className="text-base text-graphite">%</span>
          </div>
          {customInvalid ? (
            <p id={customErrorId} role="alert" className="text-sm text-accent">
              Max {TIP_CUSTOM_MAX_PERCENT}% av notan ({formatAmount(maxCustomSek, currency)}).
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ─── Animated total preview ─── */}
      <div
        aria-live="polite"
        className="flex items-baseline justify-between gap-3 rounded-md bg-hairline/30 px-4 py-3"
      >
        <p className="text-sm text-graphite">Ny totalsumma</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={totalWithTip}
            className="text-2xl font-semibold tabular-nums"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
          >
            {formatAmount(totalWithTip, currency)}
          </motion.p>
        </AnimatePresence>
      </div>
    </section>
  );
}

/**
 * Compute the resulting tip amount (SEK) from a given selection. Pure —
 * used both by event handlers and by the mount-bootstrap effect.
 */
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
  // Clamp to the cap — over-input is visibly flagged but we don't let
  // the emitted amount exceed the cap. Parent may still block submit
  // while customInvalid; this is the defensive fallback.
  if (sek > maxCustomSek) return maxCustomSek;
  return sek;
}

/**
 * True when the raw custom-input string represents an out-of-range value
 * or garbage. Empty input is NOT invalid — it just means "no tip".
 */
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

/** "10%" / "7,5%" — Swedish locale uses a comma decimal. */
function formatPercentLabel(percent: number): string {
  if (Number.isInteger(percent)) return `${percent} %`;
  return `${String(round2(percent)).replace('.', ',')} %`;
}

/**
 * Compute the SEK tip amount the parent should seed its `tipAmount`
 * state with, given the admin-configured defaults. Pure; safe to call
 * inside a `useState(() => ...)` initialiser.
 *
 * Used by PaymentView (and, later, the split flow) to keep the initial
 * tip aligned with what TipSelector renders on first paint — without a
 * mount-time useEffect callback.
 */
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

/**
 * Re-exported for tests; not part of the public API surface.
 */
export const __internals = {
  amountFromSelection,
  isCustomInvalid,
  initialSelection,
  formatPercentLabel,
};
