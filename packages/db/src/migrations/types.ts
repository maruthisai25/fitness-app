import type { IsoTimestamp } from '@vigor/core';

/** One generated migration, embedded at build time by `scripts/build-migrations.mjs`. */
export interface Migration {
  /** Journal position; migrations apply in ascending order. */
  idx: number;
  /** drizzle-kit file tag, e.g. `0000_init`. Primary key in `_migrations`. */
  tag: string;
  /** sha-256 of the generated `.sql` file, computed at build time. */
  hash: string;
  /** The file's statements, already split on drizzle-kit's breakpoints. */
  statements: string[];
}

/** One row of the `_migrations` bookkeeping table. */
export interface AppliedMigration {
  idx: number;
  tag: string;
  hash: string;
  appliedAt: IsoTimestamp;
}

/** What `migrate()` did, so callers can log or surface a first-run splash. */
export interface MigrationResult {
  /** Migrations applied by this call, in order. */
  applied: string[];
  /** Migrations that were already recorded in `_migrations`. */
  alreadyApplied: string[];
}
