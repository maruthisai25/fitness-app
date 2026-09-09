import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/**
 * Component tests for the Eat and Progress screens — DESIGN.md §10 ("component
 * tests for ... food log").
 *
 * React Native's published source is Flow-typed, which Vite's parser cannot
 * read, so `react-native` and the safe-area package are aliased to the host
 * component shims in `test/`. Everything below the component — repositories,
 * migrations, engines — is the real thing, running against the in-memory
 * database from `@vigor/db/testing`.
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
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: [here('./test/setup.ts')],
  },
});
