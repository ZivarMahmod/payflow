/**
 * OrderSkeleton — premium loading state for the bill view.
 *
 * Why a skeleton, not a spinner:
 *  - Perceived performance is worse with an indefinite spinner. A skeleton
 *    tells the guest "your bill is arriving" and teaches them where the
 *    items + total will land.
 *  - Brief's anti-pattern: "INTE spinner > 200ms — skeleton direkt."
 *
 * Why we shimmer with CSS, not a framer-motion loop:
 *  - This component is on-screen exactly once per fetch; no need for React
 *    state-driven animation. A tiny `@keyframes` is cheaper and doesn't hold
 *    JS on the main thread while the real data parses.
 */

import { Card } from '@flowpay/ui';

/**
 * Shimmer CSS injected inline so we don't grow the Tailwind bundle for a
 * single skeleton component. Amount of motion is modest — under the
 * `prefers-reduced-motion` media query we switch to a static pulse.
 */
const SHIMMER_STYLE = `
  @keyframes flowpay-shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .flowpay-shimmer { animation: none !important; opacity: 0.6; }
  }
`;

const SHIMMER_CLASS =
  'flowpay-shimmer rounded-md bg-[linear-gradient(90deg,rgba(0,0,0,0.06)_0%,rgba(0,0,0,0.12)_50%,rgba(0,0,0,0.06)_100%)] bg-[length:800px_100%] animate-[flowpay-shimmer_1.4s_ease-in-out_infinite]';

function ShimmerBar({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`${SHIMMER_CLASS} ${className}`} />;
}

/** One placeholder row sized like a real bill line. */
function SkeletonItem() {
  return (
    <li className="flex items-baseline justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        <ShimmerBar className="h-4 w-3/4" />
        <ShimmerBar className="h-3 w-1/3" />
      </div>
      <ShimmerBar className="h-4 w-14" />
    </li>
  );
}

export function OrderSkeleton() {
  return (
    <main
      className="mx-auto min-h-dvh max-w-md bg-paper px-4 py-6 text-ink"
      aria-busy="true"
      aria-live="polite"
      aria-label="Laddar din nota"
    >
      {/* Inject keyframes once. Safe because only one skeleton renders at a time. */}
      <style>{SHIMMER_STYLE}</style>

      <header className="mb-6 space-y-2">
        <ShimmerBar className="h-3 w-32" />
        <ShimmerBar className="h-7 w-44" />
      </header>

      <Card padding="none">
        <ul className="divide-y divide-hairline">
          <SkeletonItem />
          <SkeletonItem />
          <SkeletonItem />
        </ul>

        <div className="flex items-baseline justify-between gap-3 border-t border-hairline px-4 py-4">
          <ShimmerBar className="h-3 w-20" />
          <ShimmerBar className="h-7 w-24" />
        </div>
      </Card>
    </main>
  );
}
