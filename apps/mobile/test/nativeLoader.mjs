/**
 * A Node module-customisation hook that runs Metro's Babel preset over React
 * Native and the Expo packages as they are loaded.
 *
 * Those packages publish CommonJS with Flow annotations, which no JavaScript
 * parser accepts as-is; Metro strips them at bundle time and Jest strips them
 * through `babel-jest`. Vitest has no equivalent, so `test/setup.ts` registers
 * this loader before the first import and the same preset does the job here.
 *
 * Kept as plain `.mjs` because Node loads it directly, outside Vite.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { transformAsync } from '@babel/core';

const NATIVE_SOURCE =
  /[\\/]node_modules[\\/](\.pnpm[\\/])?(react-native|@react-native|expo|@expo|@testing-library)/;

/**
 * Still missing, and the reason `test:components` cannot run yet: Metro picks
 * `Foo.ios.js` over `Foo.js` and Node has no idea platform extensions exist.
 * React Native ships `Libraries/Utilities/Platform.js` as a shim that
 * re-imports `./Platform`, which under Node resolves back to itself, so
 * `Platform` has no default export and the first `Platform.OS` read throws.
 *
 * A `resolve` hook here that redirects that file to `Platform.ios.js` fixes the
 * throw but then hangs the run (the loader is asked to resolve every specifier
 * in React Native's module graph, off the main thread, and never settles) — so
 * the honest fix is to run these tests under `jest-expo`, which supplies both
 * the platform resolution and the native-module mocks. See the note in
 * `vitest.components.config.ts`.
 */

export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:')) return nextLoad(url, context);

  const filename = fileURLToPath(url);
  if (!NATIVE_SOURCE.test(filename) || !/\.[cm]?jsx?$/.test(filename)) {
    return nextLoad(url, context);
  }

  const source = await readFile(filename, 'utf8');
  const result = await transformAsync(source, {
    filename,
    babelrc: false,
    configFile: false,
    caller: { name: 'vigor-vitest', platform: 'ios', isDev: true },
    presets: [['babel-preset-expo', { jsxRuntime: 'automatic', enableBabelRuntime: false }]],
  });

  return { format: 'commonjs', source: result?.code ?? source, shortCircuit: true };
}
