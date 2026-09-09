import { defineConfig } from 'vitest/config';

import base from './vitest.config';

/**
 * The rendering tests — `test/*.component.test.tsx`. Not part of `pnpm check`.
 *
 * `@testing-library/react-native` and `react-test-renderer` are installed, and
 * `test/setup.ts` now stubs the native-module layer (`__turboModuleProxy`), so
 * `TurboModuleRegistry.getEnforcing` no longer throws. One piece is still
 * missing: Metro's platform-extension resolution. Node loads React Native's
 * `Platform.js` compatibility shim instead of `Platform.ios.js`, the shim
 * re-imports itself, and the first `Platform.OS` read fails.
 *
 * A `resolve` hook in `test/nativeLoader.mjs` fixes that read but hangs the
 * run, so the remaining route is `jest-expo`, which supplies both the platform
 * resolution and React Native's own Jest mocks. The test files themselves are
 * written against the real screens and the real repositories and need no
 * changes when that lands.
 */
export default defineConfig({
  resolve: base.resolve,
  test: {
    ...base.test,
    name: 'mobile-components',
    include: ['test/**/*.component.test.tsx'],
  },
});
