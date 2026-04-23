import { cn } from '@flowpay/ui';

/**
 * The "F" mark used in the top brand strip and inside the Swish QR.
 *
 * Placeholder art — replace with the real FlowPay logo SVG when the
 * design team hands over assets. Shape intentionally matches the mocks:
 * square, bold serif-ish F on orange (or inverse), rounded corners.
 */
export function FlowpayMark({
  size = 28,
  inverted = false,
  className,
}: {
  size?: number;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex items-center justify-center font-serif font-semibold',
        inverted ? 'bg-accent text-white' : 'bg-dark text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        fontSize: Math.round(size * 0.62),
        lineHeight: 1,
        fontStyle: 'italic',
      }}
    >
      F
    </span>
  );
}

/** "FLOWPAY" wordmark next to the F square — used on welcome screen. */
export function BrandLockup({ subline }: { subline?: string }) {
  return (
    <div className="flex items-center gap-2">
      <FlowpayMark size={28} />
      <div className="leading-tight">
        <div className="font-sans text-[10px] font-semibold tracking-[0.22em] text-ink">
          FLOWPAY
        </div>
        {subline ? (
          <div className="font-sans text-[10px] font-semibold tracking-[0.22em] text-accent">
            {subline}
          </div>
        ) : null}
      </div>
    </div>
  );
}
