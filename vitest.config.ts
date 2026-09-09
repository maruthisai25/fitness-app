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
      // The repository-backed mobile tests. The rendering ones live in
      // `apps/mobile/vitest.components.config.ts` and need a React Native
      // native-module layer, so they are not part of `pnpm check`.
      'apps/mobile',
    ],
  },
});
