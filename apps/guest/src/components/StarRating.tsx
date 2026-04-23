/**
 * StarRating — five tap-targets, each ≥ 64px, with light haptic feedback.
 *
 * This is the opening UI on /feedback. Design non-negotiables from
 * BRIEF-KI-007:
 *   - Minimum 64px target — one-handed use at a table, fat-finger tolerant.
 *   - Haptic tick on select (where supported) — perceived speed matters.
 *   - Keyboard accessible — left/right to move, Enter/Space to confirm.
 *     (radiogroup role + roving tabindex.)
 *   - Reduced-motion safe — no scale bounce when `prefers-reduced-motion`.
 *
 * Intentional non-features:
 *   - No half-stars. Google's review flow is discrete 1..5 — mirroring that
 *     avoids a mapping later. Also keeps tap-target honest.
 *   - No "are you sure?" confirmation. The outer route handles branching;
 *     this component is pure input.
 */

import { motion, useReducedMotion } from 'framer-motion';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { cn } from '@flowpay/ui';

export interface StarRatingProps {
  /** Currently selected rating (1..5) or 0 for "not yet selected". */
  value: number;
  /** Fires on change. Rating is always 1..5 — never 0 here. */
  onChange: (rating: 1 | 2 | 3 | 4 | 5) => void;
  /** Disable interaction during submission. */
  disabled?: boolean;
  /** Optional aria-label for the surrounding radiogroup. */
  label?: string;
}

const RATINGS: ReadonlyArray<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

/**
 * Fire a short haptic pulse if the device supports it.
 *
 * `navigator.vibrate` is non-standard but widely supported on Android.
 * iOS Safari ignores it silently, which is fine — there is no API there.
 */
function haptic(): void {
  if (typeof navigator === 'undefined') return;
  const vib = (navigator as Navigator & { vibrate?: (p: number) => boolean })
    .vibrate;
  if (typeof vib === 'function') {
    // 15ms is below the JND for most users — feels like a tick, not a buzz.
    try {
      vib.call(navigator, 15);
    } catch {
      // Safari 18 added a partial impl that can throw under some flags.
    }
  }
}

export function StarRating({
  value,
  onChange,
  disabled = false,
  label = 'Hur var din upplevelse?',
}: StarRatingProps) {
  const reduceMotion = useReducedMotion();
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [focused, setFocused] = useState<number>(value > 0 ? value - 1 : 0);

  // Keep roving tabindex in sync with the selected value when it changes
  // via pointer input (so the next Tab into the group lands on the right star).
  useEffect(() => {
    if (value > 0) setFocused(value - 1);
  }, [value]);

  const commit = useCallback(
    (index: number) => {
      if (disabled) return;
      const rating = RATINGS[index];
      if (!rating) return;
      haptic();
      onChange(rating);
    },
    [disabled, onChange],
  );

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      let next = focused;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          next = Math.max(0, focused - 1);
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          next = Math.min(RATINGS.length - 1, focused + 1);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = RATINGS.length - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          commit(focused);
          return;
        default:
          return;
      }
      e.preventDefault();
      setFocused(next);
      buttonsRef.current[next]?.focus();
    },
    [commit, disabled, focused],
  );

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={onKey}
      className="flex items-center justify-center gap-1.5 sm:gap-2"
    >
      {RATINGS.map((r, i) => {
        const filled = value >= r;
        const isTabStop = i === focused;
        return (
          <motion.button
            key={r}
            type="button"
            role="radio"
            aria-checked={value === r}
            aria-label={`${r} av 5`}
            tabIndex={isTabStop ? 0 : -1}
            disabled={disabled}
            ref={(el) => {
              buttonsRef.current[i] = el;
            }}
            onClick={() => commit(i)}
            onFocus={() => setFocused(i)}
            whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            className={cn(
              'inline-flex h-16 w-16 items-center justify-center rounded-full',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
              'disabled:opacity-50 disabled:pointer-events-none',
              filled ? 'text-accent' : 'text-hairline',
            )}
          >
            <Star filled={filled} />
          </motion.button>
        );
      })}
    </div>
  );
}

/** Outlined when unfilled, solid when filled. SVG so it scales cleanly. */
function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.8l2.9 5.86 6.47.94-4.68 4.56 1.1 6.44L12 17.77l-5.79 3.04 1.1-6.44L2.63 9.6l6.47-.94L12 2.8z" />
    </svg>
  );
}
