/**
 * Points Node's CommonJS resolver at the React Native shim.
 *
 * Vite's `resolve.alias` only covers modules Vite itself transforms. Testing
 * Library is CommonJS in `node_modules`, so Node resolves its
 * `require('react-native')` on its own and lands on the real, Flow-typed
 * package. This redirects that one specifier — and nothing else — at
 * `reactNativeHost.cjs`. Loaded first from `setup.ts`, before Testing Library.
 */
'use strict';

const Module = require('node:module');
const path = require('node:path');

const SHIM = path.join(__dirname, 'reactNativeHost.cjs');

if (!Module._vigorReactNativeShimInstalled) {
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function vigorResolveFilename(request, ...rest) {
    if (request === 'react-native') return SHIM;
    return resolveFilename.call(this, request, ...rest);
  };
  Module._vigorReactNativeShimInstalled = true;
}
