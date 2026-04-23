import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@flowpay/ui';

/**
 * Stepped-screen header with back button + progress dots.
 *
 * The mocks use a 5-dot progress (Scan → Bill → Split → Tip → Pay → Review).
 * Specific routes set `step` (1-indexed) and the header renders the rest
 * as inactive dots.
 */
export function ScreenHeader({
  onBack,
  totalSteps = 5,
  step,
  right,
}: {
  onBack?: () => void;
  totalSteps?: number;
  step?: number;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-6 pt-4">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Tillbaka"
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full',
            'border border-hairline bg-paper text-ink',
            'transition-colors hover:bg-shell',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          )}
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
      ) : (
        <div className="h-10 w-10" aria-hidden="true" />
      )}

      {typeof step === 'number' ? (
        <ProgressDots totalSteps={totalSteps} step={step} />
      ) : (
        <div />
      )}

      {right ?? <div className="h-10 w-10" aria-hidden="true" />}
    </div>
  );
}

export function ProgressDots({
  totalSteps,
  step,
}: {
  totalSteps: number;
  step: number;
}) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Steg ${step} av ${totalSteps}`}>
      {Array.from({ length: totalSteps }).map((_, i) => {
        const active = i + 1 === step;
        return (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              'rounded-full transition-all duration-200',
              active ? 'h-1.5 w-6 bg-ink' : 'h-1.5 w-1.5 bg-hairline',
            )}
          />
        );
      })}
    </div>
  );
}
