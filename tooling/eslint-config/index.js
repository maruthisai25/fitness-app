import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Workspace packages, in the order they appear in DESIGN.md §3.
 * @type {readonly string[]}
 */
export const WORKSPACE_PACKAGES = ['core', 'db', 'ai', 'library', 'platform', 'ui-tokens'];

/**
 * Allowed internal dependencies per scope — DESIGN.md §3 "Dependency direction".
 *
 *   apps    -> ai, db, core, library, platform, ui-tokens
 *   ai      -> core, db, library, platform
 *   db      -> core
 *   library -> core
 *   core    -> (nothing internal)
 *
 * `platform` and `ui-tokens` are leaves: they depend on nothing internal.
 *
 * @type {Record<string, readonly string[]>}
 */
export const ALLOWED_INTERNAL_DEPENDENCIES = {
  core: [],
  db: ['core'],
  library: ['core'],
  platform: [],
  'ui-tokens': [],
  ai: ['core', 'db', 'library', 'platform'],
  app: ['core', 'db', 'ai', 'library', 'platform', 'ui-tokens'],
  tooling: [],
};

const IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/dev-dist/**',
  '**/.expo/**',
  '**/*.d.ts',
  '**/expo-env.d.ts',
];

/**
 * Builds the `no-restricted-imports` option that enforces the §3 dependency
 * direction for one scope. Cross-package imports always go through the
 * `@vigor/<pkg>` specifier, so restricting the specifier restricts the edge.
 *
 * @param {string} scope
 */
function dependencyDirectionRule(scope) {
  const allowed = ALLOWED_INTERNAL_DEPENDENCIES[scope];
  if (!allowed) {
    throw new Error(
      `@vigor/eslint-config: unknown scope "${scope}". ` +
        `Expected one of: ${Object.keys(ALLOWED_INTERNAL_DEPENDENCIES).join(', ')}`,
    );
  }
  const forbidden = WORKSPACE_PACKAGES.filter((pkg) => !allowed.includes(pkg));
  if (forbidden.length === 0) return null;

  return [
    'error',
    {
      patterns: forbidden.map((pkg) => ({
        group: [`@vigor/${pkg}`, `@vigor/${pkg}/*`],
        message:
          `DESIGN.md §3: "${scope}" may not depend on "@vigor/${pkg}". ` +
          `Allowed internal dependencies: ${allowed.length ? allowed.join(', ') : '(none)'}.`,
      })),
    },
  ];
}

/**
 * @typedef {object} VigorConfigOptions
 * @property {string} scope        one of the keys of ALLOWED_INTERNAL_DEPENDENCIES
 * @property {boolean} [react]     enable JSX/browser-ish globals for app packages
 * @property {Record<string, boolean | 'readonly' | 'writable'>} [globals] extra globals
 * @property {string[]} [ignores]  extra ignore patterns
 */

/**
 * Flat ESLint config shared by every workspace package.
 *
 * @param {VigorConfigOptions} options
 * @returns {import('eslint').Linter.Config[]}
 */
export function vigorConfig(options) {
  const { scope, react = false, globals: extraGlobals = {}, ignores = [] } = options;
  const restricted = dependencyDirectionRule(scope);

  /** @type {import('eslint').Linter.Config[]} */
  const config = [
    { ignores: [...IGNORES, ...ignores] },
    js.configs.recommended,
    ...tseslint.configs.recommended.map((entry) => ({
      ...entry,
      files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    })),
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.js', '**/*.mjs'],
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        globals: {
          ...globals.es2023,
          ...(react ? globals.browser : {}),
          ...extraGlobals,
        },
        parserOptions: react ? { ecmaFeatures: { jsx: true } } : {},
      },
      linterOptions: {
        reportUnusedDisableDirectives: 'error',
      },
      rules: {
        eqeqeq: ['error', 'always', { null: 'ignore' }],
        'no-var': 'error',
        'prefer-const': 'error',
        'object-shorthand': ['error', 'properties'],
      },
    },
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
  ];

  if (scope === 'core') {
    // DESIGN.md §2/§5: engines are pure functions. Reading the ambient clock
    // makes them untestable, so `core` takes the time as an input.
    config.push({
      files: ['src/**/*.ts'],
      ignores: ['src/**/*.test.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "NewExpression[callee.name='Date'][arguments.length=0]",
            message:
              'packages/core is pure (DESIGN.md §5): take the current time as a parameter instead of calling new Date().',
          },
          {
            selector: "MemberExpression[object.name='Date'][property.name='now']",
            message:
              'packages/core is pure (DESIGN.md §5): take the current time as a parameter instead of calling Date.now().',
          },
        ],
      },
    });
  }

  if (restricted) {
    config.push({
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.js', '**/*.mjs'],
      rules: { 'no-restricted-imports': restricted },
    });
  }

  return config;
}

export default vigorConfig;
