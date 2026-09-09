import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/**
 * Tests for the mobile shell — DESIGN.md §10.
 *
 * Two families run here:
 *  - `test/**\/*.test.ts` — the repository-backed tests (session writes, coach
 *    transcript building) that exercise what the screens call without
 *    rendering them.
 *  - `src/**\/*.test.tsx` — the component tests for the Eat and Progress
 *    screens ("component tests for ... food log").
 *
 * React Native's published source is Flow-typed, which Vite's parser cannot
 * read, so `react-native` and the safe-area package are aliased to the host
 * component shims in `test/`. Everything below the component — repositories,
 * migrations, engines — is the real thing, running against the in-memory
 * database from `@vigor/db/testing`.
 *
 * The older `test/*.component.test.tsx` files still need Metro's platform
 * resolution and run from `vitest.components.config.ts`; see the note there.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: here('./test/reactNativeHost.tsx') },
      { find: /^react-native-safe-area-context$/, replacement: here('./test/safeAreaContext.tsx') },
    ],
  },
  test: {
    name: 'mobile',
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    setupFiles: [here('./test/setup.ts')],
  },
});
