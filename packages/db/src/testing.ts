/**
 * Test harness — DESIGN.md §10: "repository tests against an in-memory
 * `better-sqlite3` driver implementing `SqlDriver`".
 *
 * Not exported from `src/index.ts`: it pulls in a Node-only binding and must
 * never reach an app bundle. Tests import it by path.
 */

import type { Id, IsoTimestamp } from '@vigor/core';

import { createBetterSqlite3Driver, type BetterSqlite3Driver } from './drivers/better-sqlite3';
import { migrate } from './migrations';
import { createRepositories, type Repositories } from './repositories';

/**
 * A clock that starts at a fixed instant and advances one second per read, so
 * rows written in sequence get strictly increasing timestamps and every
 * ordering assertion is reproducible.
 */
export function createTestClock(
  start = '2026-01-05T08:00:00.000Z',
  stepMs = 1000,
): { now: () => IsoTimestamp; advance: (ms: number) => void; set: (at: IsoTimestamp) => void } {
  let current = Date.parse(start);
  return {
    now(): IsoTimestamp {
      const value = new Date(current).toISOString();
      current += stepMs;
      return value;
    },
    advance(ms: number): void {
      current += ms;
    },
    set(at: IsoTimestamp): void {
      current = Date.parse(at);
    },
  };
}

/**
 * UUID v7-shaped ids from a counter. Real uuidv7 is already time-ordered, but a
 * counter makes a failing assertion readable: `...-000000000007`.
 */
export function createTestIds(prefix = '0195c0de'): () => Id {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-0000-7000-8000-${counter.toString(16).padStart(12, '0')}`;
  };
}

export interface TestDatabase {
  driver: BetterSqlite3Driver;
  repos: Repositories;
  clock: ReturnType<typeof createTestClock>;
  nextId: () => Id;
  close(): Promise<void>;
}

/** A migrated, empty in-memory database with every repository wired up. */
export async function createTestDatabase(
  options: { migrated?: boolean; start?: IsoTimestamp } = {},
): Promise<TestDatabase> {
  const driver = createBetterSqlite3Driver();
  const clock = createTestClock(options.start);
  const nextId = createTestIds();
  if (options.migrated !== false) {
    await migrate(driver, { now: clock.now });
  }
  const repos = createRepositories(driver, { now: clock.now, newId: nextId });
  return {
    driver,
    repos,
    clock,
    nextId,
    close: () => driver.close(),
  };
}

/** Every table the database currently holds, sorted. */
export async function listTableNames(driver: BetterSqlite3Driver): Promise<string[]> {
  const { rows } = await driver.run(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    [],
  );
  return rows.map((row) => String(row[0]));
}
