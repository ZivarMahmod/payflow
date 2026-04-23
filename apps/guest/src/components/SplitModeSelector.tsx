/**
 * SplitModeSelector — three big buttons to pick how to split the bill.
 *
 * Modes (BRIEF-KI-004):
 *   - equal   "Dela lika"          — N people, I pay 1 portion
 *   - portion "Betala en del"      — I pick an arbitrary amount
 *   - items   "Välj mina rätter"   — I pick specific order lines
 *
 * UX:
 *   - Big 64px targets, thumb-first.
 *   - The currently-active mode gets the primary-variant treatment so the
 *     guest can always see which flow they're in.
 *   - Aria-pressed is on instead of role=radio to keep voice-over's label
 *     short ("Dela lika, vald" vs "radio button, 1 of 3").
 */

import { Button, Stack } from '@flowpay/ui';

import type { SplitType } from '@flowpay/schemas';

interface SplitModeSelectorProps {
  /** Currently-selected mode. `null` until the guest picks one. */
  value: SplitType | null;
  /** Called with the new mode on tap. */
  onChange: (mode: SplitType) => void;
  /** Disable while any mutation is in flight. */
  disabled?: boolean;
}

const MODES: Array<{ key: SplitType; label: string; hint: string }> = [
  { key: 'equal', label: 'Dela lika', hint: 'Alla betalar lika mycket' },
  { key: 'portion', label: 'Betala en del', hint: 'Jag väljer ett belopp' },
  { key: 'items', label: 'Välj mina rätter', hint: 'Jag plockar rader från notan' },
];

export function SplitModeSelector({
  value,
  onChange,
  disabled = false,
}: SplitModeSelectorProps) {
  return (
    <Stack gap={3} aria-label="Välj hur du vill splitta notan">
      {MODES.map(({ key, label, hint }) => {
        const isActive = value === key;
        return (
          <Button
            key={key}
            // `primary` on active, `secondary` otherwise — so the tap-target
            // always feels like a real button even when unselected.
            variant={isActive ? 'primary' : 'secondary'}
            size="lg"
            block
            onClick={() => onChange(key)}
            disabled={disabled}
            aria-pressed={isActive}
          >
            <span className="flex flex-col items-start gap-0.5 text-left">
              <span className="font-semibold">{label}</span>
              <span className="text-xs font-normal text-graphite">{hint}</span>
            </span>
          </Button>
        );
      })}
    </Stack>
  );
}
