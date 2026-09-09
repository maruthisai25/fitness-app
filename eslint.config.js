import { vigorConfig } from '@vigor/eslint-config';

// Root config exists for editor integration only. `pnpm lint` runs each
// workspace package's own `lint` script against its own eslint.config.js.
export default [
  { ignores: ['apps/**', 'packages/**', 'tooling/**'] },
  ...vigorConfig({ scope: 'tooling' }),
];
