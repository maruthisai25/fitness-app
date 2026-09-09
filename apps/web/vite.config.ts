import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // DESIGN.md §7.4: precache the shell so it loads offline.
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,wasm}'],
        // The SQLite wasm binary is large; the shell must still be precacheable.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      manifest: {
        name: 'VigorEngine',
        short_name: 'VigorEngine',
        description: 'Local-first AI fitness coach',
        theme_color: '#0B1210',
        background_color: '#0B1210',
        display: 'standalone',
        start_url: '/',
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
    // Component tests for the food log and the body metrics form (DESIGN.md
    // §10) run against @testing-library/react, which needs a DOM.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // `e2e/` holds Playwright specs (DESIGN.md §10). They are run by
    // `pnpm test:e2e`; vitest — including the workspace run that lists
    // `apps/web` as a project — must never collect them.
    exclude: [...configDefaults.exclude, 'e2e/**', 'dist/**', 'dev-dist/**'],
  },
});
