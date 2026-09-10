import { defineConfig } from 'vitest/config';

// Workspace-level test runner. Each project directory may add its own
// vitest.config.ts; those override the defaults picked up here.
export default defineConfig({
  test: {
    projects: [
      'packages/core',
      'packages/db',
      'packages/ai',
      'packages/library',
      'packages/platform',
      'packages/ui-tokens',
      'apps/web',
      // The mobile shell: the repository-backed tests plus the Eat/Progress
      // component tests, both from `apps/mobile/vitest.config.mts`. The four
      // `test/*.component.test.tsx` files need Metro's platform resolution and
      // React Native's own Jest mocks, which Vite cannot provide, so they run
      // under jest-expo — the root `test` script runs this projects list and
      // then `pnpm --filter mobile test:components`, so both gate `pnpm check`
      // (DESIGN.md §10).
      'apps/mobile',
    ],
  },
});
