import { vigorConfig } from '@vigor/eslint-config';

export default vigorConfig({
  scope: 'app',
  react: true,
  ignores: ['dist/**', 'dev-dist/**'],
});
