import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': session mode flushes each confirmed set to
      // SQLite as it happens (DESIGN.md §7.2), so a silent takeover mid-session
      // would be hostile. `src/pwa/UpdateToast.tsx` asks first.
      registerType: 'prompt',
      // DESIGN.md §7.4: precache the shell so it loads offline.
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,wasm}'],
        // The SQLite wasm binary is large; the shell must still be precacheable.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      // The icons below are rendered from `tooling/assets/vigor-mark.svg` by
      // `tooling/scripts/render-icons.mjs` and committed under `public/icons/`.
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon-180.png'],
      manifest: {
        name: 'VigorEngine',
        short_name: 'Vigor',
        description:
          'Local-first AI fitness coach. Logs workouts and meals, remembers your history, and decides what to train next — on your device.',
        // `darkPalette.bg` from @vigor/ui-tokens (DESIGN.md §7.5). Kept as
        // literals because the manifest is emitted at config time, before any
        // workspace TypeScript has been transpiled.
        theme_color: '#0B1210',
        background_color: '#0B1210',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['health', 'fitness', 'lifestyle'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            // Safe-zone padded so Android's circle/squircle masks never clip
            // the mark.
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  worker: {
    // The SQLite worker that owns the OPFS handle is an ES module (DESIGN.md §7.4).
    format: 'es',
  },
  optimizeDeps: {
    // sqlite-wasm ships its own worker + wasm loader and must not be pre-bundled.
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
  test: {
    name: 'web',
    // Component tests for session mode, the food log and the body metrics form
    // render React against jsdom (DESIGN.md §10: "component tests for session
    // mode and food log").
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/testing/setup.ts'],
    // `e2e/` holds Playwright specs (DESIGN.md §10). They are run by
    // `pnpm test:e2e`; vitest — including the workspace run that lists
    // `apps/web` as a project — must never collect them.
    exclude: [...configDefaults.exclude, 'e2e/**', 'dist/**', 'dev-dist/**'],
  },
});
