/**
 * Tailwind v4 is CSS-first — the real config is `@import "tailwindcss"` plus
 * `@import "@flowpay/ui/tokens.css"` in `src/index.css`. This file exists for
 * tooling that still expects a JS entry (vite-bundle-visualizer, IDE plugins).
 *
 * We extend nothing here — all tokens live in `@flowpay/ui/tokens.css` via
 * Tailwind's `@theme` directive (single source of truth).
 */

import type { Config } from 'tailwindcss';
import flowpay from '@flowpay/ui/tailwind.config';

const config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    ...flowpay.content,
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;

export default config;
