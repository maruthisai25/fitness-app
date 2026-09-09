import { defineConfig } from 'vitest/config';

/**
 * `packages/core` test runner — DESIGN.md §10 asks for ≥ 90 % line coverage
 * here, so the thresholds are enforced rather than merely reported.
 *
 * Coverage needs `@vitest/coverage-v8`; `pnpm test` runs without it.
 */
export default defineConfig({
  test: {
    name: 'core',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/fixtures.ts', // test-only builders
        'src/index.ts', // re-exports only
        'src/types.ts', // type declarations only
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 80,
      },
    },
  },
});
