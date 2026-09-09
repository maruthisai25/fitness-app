import { vigorConfig } from '@vigor/eslint-config';

// `scripts/build-migrations.mjs` is a build-time Node script, so it needs the
// Node globals the library sources deliberately do not get.
export default vigorConfig({
  scope: 'db',
  globals: { process: 'readonly', console: 'readonly' },
});
