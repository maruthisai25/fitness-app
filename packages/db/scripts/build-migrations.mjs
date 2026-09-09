/**
 * Turns the drizzle-kit output in `migrations/` into `src/migrations/generated.ts`.
 *
 * `migrate(driver)` must run on Hermes and in a Web Worker, where there is no
 * filesystem, so the SQL is embedded in a TypeScript module instead of read at
 * runtime. Each migration's sha-256 is computed here, once, and stored in
 * `_migrations` so a rewritten file is detected without hashing on device.
 *
 * Usage: pnpm --filter @vigor/db migrations:build
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(packageRoot, 'migrations');
const journalPath = join(migrationsDir, 'meta', '_journal.json');
const outPath = join(packageRoot, 'src', 'migrations', 'generated.ts');

/** @typedef {{ idx: number, tag: string, when: number }} JournalEntry */

/** @returns {JournalEntry[]} */
function readJournal() {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  if (journal.dialect !== 'sqlite') {
    throw new Error(`expected a sqlite journal, found dialect "${journal.dialect}"`);
  }
  /** @type {JournalEntry[]} */
  const entries = journal.entries ?? [];
  return [...entries].sort((a, b) => a.idx - b.idx);
}

/**
 * drizzle-kit separates statements with `--> statement-breakpoint`. Trailing
 * semicolons are kept: the drivers execute one statement per `run()` call.
 *
 * @param {string} sql
 * @returns {string[]}
 */
function splitStatements(sql) {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function main() {
  const entries = readJournal();
  const orphans = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .filter((name) => !entries.some((entry) => `${entry.tag}.sql` === name));
  if (orphans.length > 0) {
    throw new Error(`migration file(s) missing from the journal: ${orphans.join(', ')}`);
  }

  const migrations = entries.map((entry) => {
    const sql = readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8');
    return {
      idx: entry.idx,
      tag: entry.tag,
      hash: createHash('sha256').update(sql).digest('hex'),
      statements: splitStatements(sql),
    };
  });

  const body = migrations
    .map((migration) => {
      const statements = migration.statements
        .map((statement) => `      ${JSON.stringify(statement)},`)
        .join('\n');
      return [
        '  {',
        `    idx: ${migration.idx},`,
        `    tag: ${JSON.stringify(migration.tag)},`,
        `    hash: ${JSON.stringify(migration.hash)},`,
        '    statements: [',
        statements,
        '    ],',
        '  },',
      ].join('\n');
    })
    .join('\n');

  const file = `/**
 * GENERATED FILE — do not edit.
 *
 * Produced by \`scripts/build-migrations.mjs\` from the drizzle-kit output in
 * \`packages/db/migrations\`. Regenerate with:
 *
 *   pnpm --filter @vigor/db migrations:generate   # schema diff -> .sql
 *   pnpm --filter @vigor/db migrations:build      # .sql -> this file
 */

import type { Migration } from './types';

/** Every migration, in journal order. */
export const MIGRATIONS: readonly Migration[] = [
${body}
];
`;

  writeFileSync(outPath, file, 'utf8');
  const statementCount = migrations.reduce((total, m) => total + m.statements.length, 0);
  process.stdout.write(
    `build-migrations: ${migrations.length} migration(s), ${statementCount} statement(s) -> src/migrations/generated.ts\n`,
  );
}

main();
