import { defineConfig } from 'vitest/config';

/**
 * Tests for the mobile shell — DESIGN.md §10.
 *
 * `pnpm --filter mobile test` runs the repository-backed tests (`*.test.ts`),
 * which exercise the same code session mode calls without rendering it. The
 * rendering tests (`*.component.test.tsx`) need `@testing-library/react-native`
 * plus a React Native jest-style native-module layer, so they run from
 * `vitest.components.config.ts` via `pnpm --filter mobile test:components`
 * once those are installed — see the note in that file.
 *
 * Tests live in `test/` rather than `src/` so the app's own `tsc --noEmit`
 * (which types the shipped app) stays independent of the test toolchain.
 */
export default defineConfig({
  resolve: {
    extensions: ['.native.tsx', '.native.ts', '.tsx', '.ts', '.native.js', '.js', '.jsx', '.json'],
  },
  test: {
    name: 'mobile',
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    server: {
      deps: {
        // Let Node load these so the Babel hook registered in `test/setup.ts`
        // can strip their Flow types; Vitest's own parser cannot read them.
        external: [
          /[\\/]react-native[\\/]/,
          /[\\/]@react-native[\\/]/,
          /[\\/]react-native-safe-area-context[\\/]/,
          /[\\/]@testing-library[\\/]react-native[\\/]/,
          /[\\/]expo[\\/]/,
          /[\\/]@expo[\\/]/,
        ],
      },
    },
  },
});
