/**
 * `SqlDriver` over better-sqlite3 — DESIGN.md §10: "repository tests against an
 * in-memory `better-sqlite3` driver implementing `SqlDriver`".
 *
 * Node only. Never imported by `apps/mobile` or `apps/web`; the platform
 * drivers implement `CreateExpoSqlDriver` / `CreateWasmSqlDriver` from
 * `./types` instead. Keeping this in `packages/db` means the schema, the
 * migrations and the repositories are all exercised by the same code the apps
 * run, with only the binding swapped.
 */

import Database from 'better-sqlite3';

import type { SqlDriver } from '../driver';
import { type ClosableSqlDriver, FOREIGN_KEYS_PRAGMA, toSqliteParam } from './types';

export interface BetterSqlite3DriverOptions {
  /** File path, or `:memory:` (the default) for a throwaway test database. */
  filename?: string;
  /** Called with every statement before it runs. */
  onStatement?: (sql: string, params: readonly unknown[]) => void;
}

/** A better-sqlite3 driver, plus the raw handle for test setup and teardown. */
export interface BetterSqlite3Driver extends ClosableSqlDriver {
  readonly database: Database.Database;
}

/**
 * better-sqlite3 is synchronous and single-connection, so a transaction is just
 * a `BEGIN`/`COMMIT` pair on the one handle and nested calls become SAVEPOINTs.
 * `db.transaction()` is not usable here: it refuses async callbacks.
 */
export function createBetterSqlite3Driver(
  options: BetterSqlite3DriverOptions = {},
): BetterSqlite3Driver {
  const database = new Database(options.filename ?? ':memory:');
  database.pragma('journal_mode = WAL');
  database.exec(FOREIGN_KEYS_PRAGMA);

  let closed = false;
  let depth = 0;

  function run(sql: string, params: unknown[]): Promise<{ rows: unknown[][]; changes: number }> {
    if (closed) {
      return Promise.reject(new Error('better-sqlite3 driver: the database is closed'));
    }
    options.onStatement?.(sql, params);
    const bindings = params.map(toSqliteParam);
    try {
      const statement = database.prepare(sql);
      if (statement.reader) {
        const rows = statement.raw().all(...bindings) as unknown[][];
        return Promise.resolve({ rows, changes: 0 });
      }
      const info = statement.run(...bindings);
      return Promise.resolve({ rows: [], changes: info.changes });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return Promise.reject(new Error(`SQL failed: ${message}\n  statement: ${sql}`, { cause }));
    }
  }

  const driver: BetterSqlite3Driver = {
    database,
    run,
    async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
      const isOutermost = depth === 0;
      const savepoint = `vigor_sp_${depth}`;
      database.exec(isOutermost ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
      depth += 1;
      try {
        const result = await fn(driver);
        database.exec(isOutermost ? 'COMMIT' : `RELEASE ${savepoint}`);
        return result;
      } catch (error) {
        database.exec(isOutermost ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
        throw error;
      } finally {
        depth -= 1;
      }
    },
    close(): Promise<void> {
      if (!closed) {
        closed = true;
        database.close();
      }
      return Promise.resolve();
    },
  };

  return driver;
}
