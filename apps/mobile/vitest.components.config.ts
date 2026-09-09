import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/**
 * The phase 2–3 rendering tests — `test/*.component.test.tsx`. Not part of
 * `pnpm check`.
 *
 * These were written against the real React Native renderer and still need
 * Metro's platform-extension resolution (Node loads `Platform.js` instead of
 * `Platform.ios.js`, the shim re-imports itself, and the first `Platform.OS`
 * read fails). The route to fixing that is `jest-expo`, which supplies both the
 * platform resolution and React Native's own Jest mocks.
 *
 * The Eat and Progress component tests do not have that problem — they render
 * through the host shims in `test/reactNativeHost.tsx` and run in the default
 * project (`vitest.config.mts`).
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: here('./test/reactNativeHost.tsx') },
      { find: /^react-native-safe-area-context$/, replacement: here('./test/safeAreaContext.tsx') },
    ],
  },
  test: {
    name: 'mobile-components',
    environment: 'node',
    globals: true,
    include: ['test/**/*.component.test.tsx'],
    setupFiles: [here('./test/setup.ts')],
  },
});
