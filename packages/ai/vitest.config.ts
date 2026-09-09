import { defineConfig } from 'vitest/config';

/**
 * `packages/ai` tests run against the real in-memory better-sqlite3 database
 * from `@vigor/db/testing` and a scripted fake Anthropic client, so they need
 * the Node environment and never touch the network (DESIGN.md §10). The only
 * exception is the live token-count check, which skips itself unless
 * `VIGOR_LIVE_AI=1`.
 */
export default defineConfig({
  test: {
    name: 'ai',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
