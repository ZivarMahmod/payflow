/**
 * Tailwind v4 content/plugin config for consumers of @flowpay/ui.
 *
 * Tailwind v4 is CSS-first — the actual tokens live in `src/tokens.css`
 * via `@theme`. This file exists so consumer apps that still wire up
 * Tailwind through a JS config can pick up `packages/ui/src/**` as a
 * content source, and so tooling that expects a `tailwind.config.ts`
 * entry point has one to point at.
 *
 * Usage in a consumer app (Next.js etc.):
 *
 *   // tailwind.config.ts
 *   import flowpay from '@flowpay/ui/tailwind.config';
 *   export default {
 *     content: [
 *       './app/**\/*.{ts,tsx}',
 *       ...flowpay.content,
 *     ],
 *     presets: [flowpay],
 *   };
 */

import type { Config } from 'tailwindcss';

const config = {
  content: [
    // Sibling-workspace consumers resolve this through pnpm-hoisted paths.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  // Tokens are defined in tokens.css via @theme — keep theme here empty so
  // we have a single source of truth and don't drift between JS and CSS.
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;

export default config;
