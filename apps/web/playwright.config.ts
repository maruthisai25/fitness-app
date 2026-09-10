import { defineConfig, devices } from '@playwright/test';

/**
 * Web smoke test config — DESIGN.md §10: "Playwright smoke test for web
 * (onboard → log workout → see PR)". Phase 0 covers onboarding only; later
 * phases extend `e2e/` as the workout and PR flows land.
 *
 * `webServer` builds and serves the production PWA so the SQLite worker's
 * `opfs-sahpool` VFS runs the same way it will for real users.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    // `ensure-build.mjs` only rebuilds when `dist/` is missing or older than
    // the source, then serves it — so a repeated `test:e2e` run skips
    // straight to `vite preview` and stays quick.
    command: 'node scripts/ensure-build.mjs',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
