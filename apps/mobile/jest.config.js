/**
 * Rendering tests for the mobile shell — DESIGN.md §10 ("component tests for
 * session mode and food log").
 *
 * These three files render the real screens against the real React Native
 * runtime, which needs Metro-style platform-extension resolution
 * (`Platform.ios.js` ahead of `Platform.js`) and React Native's own Jest
 * mocks. Vite cannot do either, so they run here under `jest-expo` while the
 * non-rendering tests and the Eat/Progress tests stay on vitest
 * (`vitest.config.mts`).
 *
 * `jest-expo/ios` is the single-platform preset: one pass, iOS resolution,
 * rather than the four-project default (ios + android + web + node).
 *
 * CommonJS on purpose — Jest loads this file through Node's require, and
 * `apps/mobile` is not an ESM package.
 */

/**
 * The workspace packages (`@vigor/*`) publish raw TypeScript from `src/`, and
 * pnpm links them into `node_modules/@vigor/*`, so they have to be transformed
 * even though their specifier sits under `node_modules`. Everything else keeps
 * jest-expo's own list, including the `.pnpm` entry that lets the first
 * `node_modules/` segment of a pnpm path through.
 */
const TRANSFORM_ALLOWED = [
  '\\.pnpm',
  '@vigor',
  'react-native',
  '@react-native',
  '@react-native-community',
  'expo',
  '@expo',
  '@expo-google-fonts',
  'react-navigation',
  '@react-navigation',
  '@sentry/react-native',
  'native-base',
  'standard-navigation',
].join('|');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/ios',
  rootDir: __dirname,
  displayName: 'mobile-components',
  testMatch: ['<rootDir>/test/**/*.component.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  resolver: '<rootDir>/test/jest.resolver.cjs',
  transformIgnorePatterns: [
    `/node_modules/(?!(${TRANSFORM_ALLOWED}))`,
    // jest-expo keeps these two out of the transform on purpose: the plugin
    // and the preset are part of the transformer itself.
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  // The in-memory database opens a real better-sqlite3 handle per test file;
  // serialising the three files keeps memory flat and the run reproducible.
  maxWorkers: 2,
  testTimeout: 20000,
  clearMocks: true,
};
