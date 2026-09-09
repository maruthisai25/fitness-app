/**
 * The single storage seam — DESIGN.md §4.
 *
 * One repository codebase runs against both platforms through this interface:
 *   - mobile implements it with `expo-sqlite`
 *   - web implements it with `@sqlite.org/sqlite-wasm` (`opfs-sahpool` VFS,
 *     inside a Web Worker, reached over a small RPC)
 *   - tests implement it with an in-memory `better-sqlite3` database
 *
 * Nothing outside `packages/db` may hold a driver or write SQL (DESIGN.md §4.2).
 */
export interface SqlDriver {
  /**
   * Runs one statement.
   *
   * @param sql    a single SQL statement with `?` placeholders
   * @param params positional bindings, already converted to SQLite scalars
   * @returns `rows` as positional column arrays (empty for writes) and the
   *          number of rows the statement changed
   */
  run(sql: string, params: unknown[]): Promise<{ rows: unknown[][]; changes: number }>;

  /**
   * Runs `fn` inside a transaction, committing when it resolves and rolling
   * back when it rejects. The driver handed to `fn` must be used for every
   * statement in the transaction; using the outer driver escapes it.
   */
  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T>;
}
