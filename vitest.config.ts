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
      'apps/mobile',
    ],
  },
});
