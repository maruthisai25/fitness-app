/**
 * Small helpers shared by the repository modules. Nothing here touches SQL —
 * `packages/db` is the only place SQL exists and it lives in the repositories
 * and `migrate()` (DESIGN.md §4.2).
 */

/** Raised when a repository is asked to update or read a row that is not there. */
export class RowNotFoundError extends Error {
  readonly table: string;
  readonly id: string;

  constructor(table: string, id: string) {
    super(`${table}: no row with id "${id}"`);
    this.name = 'RowNotFoundError';
    this.table = table;
    this.id = id;
  }
}

/** Narrows a single-row query result, raising with the table and id on a miss. */
export function requireRow<T>(row: T | undefined, table: string, id: string): T {
  if (row === undefined) throw new RowNotFoundError(table, id);
  return row;
}

/** First element, or `undefined`. Repositories return `null` for "no row". */
export function firstOrNull<T>(rows: T[]): T | null {
  return rows.length > 0 ? (rows[0] as T) : null;
}

/**
 * Drops keys whose value is `undefined` so a partial patch never overwrites a
 * column with NULL. `null` is kept: it is how a caller clears a nullable field.
 */
export function definedOnly<T extends object>(patch: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/** True when a patch would change nothing, so the repository can skip the write. */
export function isEmptyPatch(patch: object): boolean {
  return Object.keys(patch).length === 0;
}

/**
 * Matches one entry inside a json-encoded string array column.
 *
 * The library columns (`primaryMuscles`, `equipment`, `tags`, …) are json text,
 * and SQLite's json1 extension is not guaranteed on every platform build, so
 * membership is a `LIKE` over the encoded form. `JSON.stringify` supplies the
 * quoting, which also escapes any `%` or `_` the caller passes.
 */
export function jsonArrayContainsPattern(value: string): string {
  return `%${JSON.stringify(value)}%`;
}

/** Groups rows by a key, preserving input order inside each group. */
export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = groups.get(k);
    if (bucket) bucket.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

/** Chunks a list so a generated `IN (...)` never exceeds SQLite's parameter cap. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** SQLite's default `SQLITE_MAX_VARIABLE_NUMBER` is 999; stay well under it. */
export const MAX_BOUND_PARAMS = 500;
