#!/usr/bin/env node
/**
 * Builds the web app only when `dist/` is missing or older than the source.
 *
 * `playwright.config.ts`'s `webServer` used to run `pnpm run build` on every
 * `pnpm --filter web test:e2e`, which re-runs `tsc --noEmit` and a full Vite
 * production build (including the SQLite wasm asset) even when nothing
 * changed. This makes repeated runs skip straight to `vite preview` once a
 * build is already fresh.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distIndex = join(root, 'dist', 'index.html');

// Everything a production build actually reads from. Anything outside this
// list (docs, e2e specs, test files) never invalidates the build.
const WATCH_DIRS = ['src', 'public'];
const WATCH_FILES = [
  'index.html',
  'vite.config.ts',
  'package.json',
  'tsconfig.json',
  '../../pnpm-lock.yaml',
];

function newestMtimeMs(path) {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  for (const entry of readdirSync(path)) {
    newest = Math.max(newest, newestMtimeMs(join(path, entry)));
  }
  return newest;
}

function isStale() {
  if (!existsSync(distIndex)) return true;
  const builtAtMs = statSync(distIndex).mtimeMs;
  const sourceMtimeMs = Math.max(
    0,
    ...WATCH_DIRS.map((dir) => newestMtimeMs(join(root, dir))),
    ...WATCH_FILES.map((file) => newestMtimeMs(join(root, file))),
  );
  return sourceMtimeMs > builtAtMs;
}

/**
 * Runs the same two steps as the `build` script (`tsc --noEmit && vite
 * build`), but through the local `.bin` shims directly rather than through
 * `pnpm run` — this script itself may run from inside a `pnpm`-managed
 * `webServer` process, and re-entering `pnpm` there is one layer of
 * indirection this only needs to avoid, not depend on.
 */
function runLocalBin(name, args) {
  const shim = join(root, 'node_modules', '.bin', name + (process.platform === 'win32' ? '.cmd' : ''));
  execSync(`"${shim}" ${args.join(' ')}`, { cwd: root, stdio: 'inherit' });
}

if (isStale()) {
  console.log('[ensure-build] dist/ is missing or stale — building…');
  runLocalBin('tsc', ['--noEmit']);
  runLocalBin('vite', ['build']);
} else {
  console.log('[ensure-build] dist/ is fresh — reusing the existing build.');
}

// `playwright.config.ts`'s `webServer` wants one foreground command that
// ends up serving `baseURL` — building (or not) and then previewing here
// keeps that command a single `node scripts/ensure-build.mjs`, with no
// `pnpm run` step for Playwright to wait on or reap.
console.log('[ensure-build] starting the preview server…');
runLocalBin('vite', ['preview', '--port', '4173']);
