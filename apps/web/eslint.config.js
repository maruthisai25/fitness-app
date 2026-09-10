import { vigorConfig } from '@vigor/eslint-config';
import globals from 'globals';

export default [
  ...vigorConfig({
    scope: 'app',
    react: true,
    ignores: ['dist/**', 'dev-dist/**'],
  }),
  // `scripts/` runs under plain Node (e.g. the Playwright webServer's
  // build-if-stale check), never in the browser bundle — it needs Node's
  // globals (`process`, `console`, …), not the app's browser ones.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
