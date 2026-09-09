/**
 * `@vigor/db` — Drizzle schema, migrations and repositories over a `SqlDriver`.
 * DESIGN.md §3, §4.
 *
 * Typical app start-up:
 *
 * ```ts
 * const driver = await createExpoSqlDriver();   // or createWasmSqlDriver()
 * await migrate(driver);
 * const repos = createRepositories(driver);
 * ```
 */

export type { SqlDriver } from './driver';

export { createDb } from './client';
export type { DbOptions, Orm, VigorDb } from './client';

export * as schema from './schema';
export { MIGRATIONS_TABLE } from './schema';
export type { Schema } from './schema';

export { MIGRATIONS, migrate, MigrationIntegrityError, readAppliedMigrations } from './migrations';
export type { AppliedMigration, Migration, MigrationResult } from './migrations';

export { FOREIGN_KEYS_PRAGMA, toSqliteParam } from './drivers/types';
export type {
  ClosableSqlDriver,
  CreateExpoSqlDriver,
  CreateWasmSqlDriver,
  ExpoSqlDriverOptions,
  SqlDriverOptions,
  WasmSqlDriverOptions,
} from './drivers/types';

export {
  daysBetween,
  isLocalDate,
  localDateFromTimestamp,
  shiftLocalDate,
  windowEndingOn,
} from './dates';

export * from './repositories';
