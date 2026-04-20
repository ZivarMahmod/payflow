import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Guest PWA Vite config.
 *
 * Design notes:
 *  - Bundle budget: <200 KB gzip at MVP, <100 KB longer-term. Manual chunks
 *    aren't strictly needed yet (single-route app), but we split `framer-motion`
 *    and `react-query` so they can be swapped for lighter alternatives later
 *    without shifting the vendor hash on every other change.
 *  - `target: 'es2022'` — matches our min-support (iOS 16.4 / Chrome 103+).
 *    Smaller output vs. the default ES2020.
 *  - `sourcemap: true` in dev only — production maps are generated separately
 *    and uploaded to Sentry (added in a later brief).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'motion': ['framer-motion'],
          'query': ['@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Allow LAN access so we can test on a real iPhone against the dev host.
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
});
