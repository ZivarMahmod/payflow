import { ChevronRight, List, Sliders, Users } from 'lucide-react';
import { cn } from '@flowpay/ui';
import type { SplitType } from '@flowpay/schemas';

interface SplitModeSelectorProps {
  value: SplitType | null;
  onChange: (mode: SplitType) => void;
  disabled?: boolean;
}

const MODES: Array<{
  key: SplitType;
  label: string;
  hint: string;
  Icon: typeof Users;
}> = [
  { key: 'equal', label: 'Lika', hint: 'Dela totalen jämnt', Icon: Users },
  { key: 'items', label: 'Välj rader', hint: 'Varje gäst väljer sina rätter', Icon: List },
  { key: 'portion', label: 'Eget belopp', hint: 'Dra för att välja din del', Icon: Sliders },
];

export function SplitModeSelector({
  value,
  onChange,
  disabled = false,
}: SplitModeSelectorProps) {
  return (
    <div className="space-y-3" aria-label="Välj hur du vill splitta notan">
      {MODES.map(({ key, label, hint, Icon }) => {
        const isActive = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            disabled={disabled}
            aria-pressed={isActive}
            className={cn(
              'flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left',
              'transition-[background-color,border-color,transform] duration-150 active:translate-y-px',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
              'disabled:pointer-events-none disabled:opacity-50',
              isActive
                ? 'border-ink bg-paper shadow-paper'
                : 'border-hairline bg-paper hover:bg-shell',
            )}
          >
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                'bg-accent-soft text-accent',
              )}
            >
              <Icon size={20} strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold text-ink">{label}</div>
              <div className="text-[13px] text-graphite">{hint}</div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-graphite" strokeWidth={1.8} />
          </button>
        );
      })}
    </div>
  );
}
