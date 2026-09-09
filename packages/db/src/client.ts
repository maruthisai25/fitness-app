/**
 * sqlite-proxy wiring — DESIGN.md §4.
 *
 * One repository codebase runs against every platform by pushing all IO through
 * the `SqlDriver` seam: Drizzle builds the SQL, the driver executes it. Nothing
 * here imports a concrete SQLite binding, so this module loads unchanged on
 * Node, Hermes and the browser.
 */

import { newId as defaultNewId, type Id, type IsoTimestamp } from '@vigor/core';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import type { SqlDriver } from './driver';
import { schema, type Schema } from './schema';

/** The Drizzle handle bound to one `SqlDriver`. */
export type Orm = SqliteRemoteDatabase<Schema>;

/** Injectable clock and id source, so tests get deterministic rows. */
export interface DbOptions {
  /** Returns the current time as an ISO 8601 UTC string. */
  now?: () => IsoTimestamp;
  /** Returns a fresh UUID v7. */
  newId?: () => Id;
}

/**
 * Everything a repository needs: the query builder, the raw driver for
 * transactions, and the injectable clock/id source.
 */
export interface VigorDb {
  readonly orm: Orm;
  readonly driver: SqlDriver;
  readonly now: () => IsoTimestamp;
  readonly newId: () => Id;
  /**
   * Runs `fn` against a database handle bound to a transaction. Statements
   * issued through the outer handle inside `fn` escape the transaction, so
   * always use the handle that is passed in.
   */
  transaction<T>(fn: (tx: VigorDb) => Promise<T>): Promise<T>;
}

/**
 * Adapts a `SqlDriver` to Drizzle's sqlite-proxy callback.
 *
 * sqlite-proxy expects positional rows (arrays of column values), which is
 * exactly what `SqlDriver.run` returns. `get` is the one special case: Drizzle
 * wants the single row itself, and `undefined` when there is none.
 */
function proxyCallback(driver: SqlDriver) {
  return async (
    sql: string,
    params: unknown[],
    method: 'run' | 'all' | 'values' | 'get',
  ): Promise<{ rows: unknown[] }> => {
    const { rows } = await driver.run(sql, params);
    if (method === 'get') {
      return { rows: rows[0] as unknown[] };
    }
    return { rows };
  };
}

function defaultNow(): IsoTimestamp {
  return new Date().toISOString();
}

/** Wraps a driver in a Drizzle handle. Does not run migrations — call `migrate()`. */
export function createDb(driver: SqlDriver, options: DbOptions = {}): VigorDb {
  const now = options.now ?? defaultNow;
  const newId = options.newId ?? defaultNewId;
  const orm = drizzle(proxyCallback(driver), { schema }) as Orm;

  const db: VigorDb = {
    orm,
    driver,
    now,
    newId,
    async transaction<T>(fn: (tx: VigorDb) => Promise<T>): Promise<T> {
      return driver.transaction(async (txDriver) => fn(createDb(txDriver, { now, newId })));
    },
  };

  return db;
}
