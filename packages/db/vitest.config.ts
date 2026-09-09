import { defineConfig } from 'vitest/config';

/**
 * Repository tests run against an in-memory better-sqlite3 database
 * (DESIGN.md §10), so they need the Node environment and its native bindings.
 */
export default defineConfig({
  test: {
    name: 'db',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
