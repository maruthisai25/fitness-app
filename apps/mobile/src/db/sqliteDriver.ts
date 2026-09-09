/**
 * `SqlDriver` over `expo-sqlite` (DESIGN.md §4: "Mobile implements it with
 * `expo-sqlite`"). This is the mobile half of `@vigor/db`'s
 * `CreateExpoSqlDriver` contract; `apps/web` implements the wasm half.
 *
 * The three rules `packages/db/src/drivers/types.ts` states, and how they are
 * met here:
 *
 *   1. `run` returns positional rows. `expo-sqlite`'s `getAllAsync` hands back
 *      objects keyed by column name, so each row is flattened with
 *      `Object.values`, which preserves the `SELECT` column order.
 *   2. `transaction` hands `fn` a driver bound to the same connection and
 *      rolls back when `fn` rejects. `withExclusiveTransactionAsync` owns the
 *      outermost BEGIN/COMMIT; nested calls map to SAVEPOINTs so a repository
 *      that opens a transaction inside another one still composes.
 *   3. `PRAGMA foreign_keys = ON` is issued on the fresh connection before any
 *      statement runs, so the schema's `ON DELETE` cascades fire.
 */
import { openDatabaseAsync } from 'expo-sqlite';
import type { SQLiteBindParams, SQLiteDatabase } from 'expo-sqlite';

import { FOREIGN_KEYS_PRAGMA, toSqliteParam } from '@vigor/db';
import type { ClosableSqlDriver, CreateExpoSqlDriver, SqlDriver } from '@vigor/db';

/** Statements that return rows rather than a change count. */
const SELECT_PATTERN = /^\s*(select|pragma|with)/i;

const DEFAULT_DATABASE_NAME = 'vigorengine.db';

interface WrapOptions {
  onStatement?: (sql: string, params: readonly unknown[]) => void;
  /** SAVEPOINT nesting depth; 0 means "no transaction open on this driver". */
  depth: number;
}

function wrap(db: SQLiteDatabase, options: WrapOptions): SqlDriver {
  const { onStatement, depth } = options;

  const driver: SqlDriver = {
    async run(sql, params) {
      onStatement?.(sql, params);
      const bound = params.map(toSqliteParam) as SQLiteBindParams;
      if (SELECT_PATTERN.test(sql)) {
        const rows = await db.getAllAsync<Record<string, unknown>>(sql, bound);
        return { rows: rows.map((row) => Object.values(row)), changes: 0 };
      }
      const result = await db.runAsync(sql, bound);
      return { rows: [], changes: result.changes };
    },

    async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
      if (depth > 0) {
        // Already inside a transaction: nest with a SAVEPOINT so an inner
        // failure unwinds only its own work.
        const name = `vigor_sp_${depth}`;
        await db.execAsync(`SAVEPOINT ${name}`);
        try {
          const value = await fn(wrap(db, { onStatement, depth: depth + 1 }));
          await db.execAsync(`RELEASE ${name}`);
          return value;
        } catch (error) {
          await db.execAsync(`ROLLBACK TO ${name}`);
          await db.execAsync(`RELEASE ${name}`);
          throw error;
        }
      }

      let outcome!: T;
      // `withExclusiveTransactionAsync` commits when the callback resolves and
      // rolls back — then rethrows — when it rejects, so reaching the return
      // statement means `outcome` was assigned.
      await db.withExclusiveTransactionAsync(async () => {
        outcome = await fn(wrap(db, { onStatement, depth: 1 }));
      });
      return outcome;
    },
  };

  return driver;
}

/**
 * Opens (or creates) the on-device database and wraps it as a
 * `ClosableSqlDriver`. Call `migrate(driver)` on the result before building
 * repositories — DESIGN.md §4.
 */
export const createExpoSqlDriver: CreateExpoSqlDriver = async (options = {}) => {
  const { databaseName = DEFAULT_DATABASE_NAME, onStatement, useWal = true } = options;
  const db = await openDatabaseAsync(databaseName, { enableChangeListener: false });
  if (useWal) {
    await db.execAsync('PRAGMA journal_mode = WAL');
  }
  await db.execAsync(FOREIGN_KEYS_PRAGMA);

  const base = wrap(db, { onStatement, depth: 0 });
  const closable: ClosableSqlDriver = {
    run: base.run,
    transaction: base.transaction,
    async close() {
      await db.closeAsync();
    },
  };
  return closable;
};
