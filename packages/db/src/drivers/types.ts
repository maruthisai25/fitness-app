/**
 * Factory signatures for the platform `SqlDriver` implementations — DESIGN.md §4.
 *
 * `packages/db` owns the schema, the repositories and this contract; the app
 * agents implement the two platform drivers against these types without
 * touching anything else in this package.
 *
 *   apps/mobile -> `createExpoSqlDriver` over `expo-sqlite`
 *   apps/web    -> `createWasmSqlDriver` over `@sqlite.org/sqlite-wasm`
 *                  (`opfs-sahpool` VFS, inside a Web Worker, reached by RPC)
 *
 * Both must satisfy the same three rules, which the repositories rely on:
 *
 *   1. `run` returns positional rows — arrays of column values, not objects.
 *   2. `transaction` hands `fn` a driver whose statements join the transaction,
 *      commits when `fn` resolves and rolls back when it rejects. Nesting is
 *      allowed and maps to SAVEPOINTs.
 *   3. `PRAGMA foreign_keys = ON` is set on the connection before any
 *      statement runs, so the `ON DELETE cascade` clauses in the schema fire.
 */

import type { SqlDriver } from '../driver';

/** A `SqlDriver` that owns a connection and can release it. */
export interface ClosableSqlDriver extends SqlDriver {
  /** Closes the underlying connection. Later calls to `run` must reject. */
  close(): Promise<void>;
}

/** Options common to every platform driver. */
export interface SqlDriverOptions {
  /**
   * File name inside the platform's app-private database directory, e.g.
   * `vigor.db`. Never an absolute path: the sandbox root differs per platform.
   */
  databaseName?: string;
  /** Called with every statement before it runs. For debug builds only. */
  onStatement?: (sql: string, params: readonly unknown[]) => void;
}

/** `apps/mobile` — `expo-sqlite`, opened with `openDatabaseAsync`. */
export interface ExpoSqlDriverOptions extends SqlDriverOptions {
  /**
   * Enables SQLite's write-ahead log. Recommended on device: session mode
   * writes a row per confirmed set while the UI keeps reading.
   */
  useWal?: boolean;
}

/**
 * `apps/web` — `@sqlite.org/sqlite-wasm` on the `opfs-sahpool` VFS, owned by a
 * Web Worker so the main thread never blocks on IO (DESIGN.md §7.4).
 */
export interface WasmSqlDriverOptions extends SqlDriverOptions {
  /**
   * OPFS directory the sah-pool VFS installs into, e.g. `/vigor`. The pool is
   * per-origin, so a distinct name keeps dev and preview builds apart.
   */
  vfsDirectory?: string;
  /** How many file handles the sah-pool VFS pre-allocates. */
  poolCapacity?: number;
}

/** Implemented in `apps/mobile`. */
export type CreateExpoSqlDriver = (options?: ExpoSqlDriverOptions) => Promise<ClosableSqlDriver>;

/** Implemented in `apps/web`. */
export type CreateWasmSqlDriver = (options?: WasmSqlDriverOptions) => Promise<ClosableSqlDriver>;

/** The statement every driver must issue on a fresh connection (rule 3 above). */
export const FOREIGN_KEYS_PRAGMA = 'PRAGMA foreign_keys = ON';

/**
 * Normalises a bound parameter to a SQLite scalar.
 *
 * Drizzle already maps booleans and json through the column definitions, but a
 * driver receives raw statements from `migrate()` too, and platform bindings
 * differ on what they reject. Every driver should route its params through this.
 */
export function toSqliteParam(value: unknown): string | number | null | Uint8Array {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value instanceof Uint8Array) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  return JSON.stringify(value);
}
