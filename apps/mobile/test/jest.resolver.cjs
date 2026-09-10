/**
 * Jest module resolver for the rendering tests.
 *
 * Two jobs, both of which the stock resolver cannot do:
 *
 * 1. React Native's `exports` map is dropped, exactly as
 *    `@react-native/jest-preset`'s own resolver does, so Jest can reach and
 *    mock the subpaths the runtime and its test mocks rely on. This file
 *    replaces that resolver, so it has to keep doing it.
 * 2. The workspace packages under `packages/` are consumed as raw TypeScript
 *    and are written in NodeNext style, where a relative import of a sibling
 *    module carries the `.js` extension of the file a build *would* emit
 *    (`./crypto-format.js` → `crypto-format.ts`). Metro and Vite both accept
 *    that; Jest resolves it literally and fails. So for requests coming from
 *    inside `packages/`, retry once without the extension.
 *
 * CommonJS: Jest loads resolvers through Node's require, ahead of any
 * transform.
 */
'use strict';

const path = require('path');

/** Repo-root `packages/`, the only place the extension rewrite applies. */
const WORKSPACE_SOURCE_ROOT = path.resolve(__dirname, '..', '..', '..', 'packages') + path.sep;

module.exports = (request, options) => {
  const resolve = (specifier) =>
    options.defaultResolver(specifier, {
      ...options,
      packageFilter: (pkg) => {
        const filtered = options.packageFilter ? options.packageFilter(pkg) : pkg;
        if (filtered.name === 'react-native') delete filtered.exports;
        return filtered;
      },
    });

  const fromWorkspaceSource = path
    .resolve(options.basedir ?? '.')
    .startsWith(WORKSPACE_SOURCE_ROOT);

  if (fromWorkspaceSource && request.startsWith('.') && request.endsWith('.js')) {
    try {
      return resolve(request.slice(0, -3));
    } catch {
      // A real emitted `.js` file next to the source — fall through.
    }
  }

  return resolve(request);
};
