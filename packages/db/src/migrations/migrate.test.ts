import { describe, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../drivers/better-sqlite3';
import { createTestClock, listTableNames } from '../testing';
import { MIGRATIONS } from './generated';
import { migrate, MigrationIntegrityError, readAppliedMigrations } from './migrate';

/** Every table named in DESIGN.md §4.1, plus the two this package adds. */
const DESIGN_TABLES = [
  'ai_jobs',
  'body_metrics',
  'conversations',
  'equipment',
  'exercise_relations',
  'exercises',
  'food_items',
  'food_logs',
  'goals',
  'insights',
  'inventory_items',
  'meal_plans',
  'memories',
  'messages',
  'nutrition_targets',
  'personal_records',
  'profile',
  'progress_photos',
  'readiness',
  'recipes',
  'safety_events',
  'saved_meals',
  'sets',
  'settings',
  'weekly_reviews',
  'workout_exercises',
  'workouts',
];

describe('migrate', () => {
  it('creates every DESIGN.md §4.1 table from an empty database', async () => {
    const driver = createBetterSqlite3Driver();
    const result = await migrate(driver, { now: createTestClock().now });

    expect(result.applied).toEqual(MIGRATIONS.map((migration) => migration.tag));
    expect(result.alreadyApplied).toEqual([]);

    const tables = await listTableNames(driver);
    for (const table of DESIGN_TABLES) {
      expect(tables).toContain(table);
    }
    expect(tables).toContain('_migrations');
    expect(tables).toContain('memory_forgets');
    await driver.close();
  });

  it('records what it applied in _migrations', async () => {
    const driver = createBetterSqlite3Driver();
    const clock = createTestClock('2026-02-01T00:00:00.000Z');
    await migrate(driver, { now: clock.now });

    const applied = await readAppliedMigrations(driver);
    expect(applied).toHaveLength(MIGRATIONS.length);
    expect(applied[0]?.tag).toBe(MIGRATIONS[0]?.tag);
    expect(applied[0]?.hash).toBe(MIGRATIONS[0]?.hash);
    expect(applied[0]?.appliedAt).toBe('2026-02-01T00:00:00.000Z');
    await driver.close();
  });

  it('is a no-op the second time it runs', async () => {
    const driver = createBetterSqlite3Driver();
    await migrate(driver);
    const second = await migrate(driver);

    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toEqual(MIGRATIONS.map((migration) => migration.tag));
    await driver.close();
  });

  it('applies only the migrations that are missing', async () => {
    const driver = createBetterSqlite3Driver();
    const first = MIGRATIONS[0];
    if (!first) throw new Error('expected at least one generated migration');

    await migrate(driver, { migrations: [first] });
    const added = {
      idx: first.idx + 1,
      tag: '9999_add_scratch',
      hash: 'deadbeef',
      statements: ['CREATE TABLE `scratch` (`id` text PRIMARY KEY NOT NULL)'],
    };
    const result = await migrate(driver, { migrations: [first, added] });

    expect(result.applied).toEqual(['9999_add_scratch']);
    expect(result.alreadyApplied).toEqual([first.tag]);
    expect(await listTableNames(driver)).toContain('scratch');
    await driver.close();
  });

  it('rolls a failing migration back and leaves earlier ones applied', async () => {
    const driver = createBetterSqlite3Driver();
    const first = MIGRATIONS[0];
    if (!first) throw new Error('expected at least one generated migration');

    const broken = {
      idx: first.idx + 1,
      tag: '9999_broken',
      hash: 'broken',
      statements: [
        'CREATE TABLE `half_written` (`id` text PRIMARY KEY NOT NULL)',
        'CREATE TABLE `half_written` (`id` text)',
      ],
    };

    await expect(migrate(driver, { migrations: [first, broken] })).rejects.toThrow(/half_written/);

    const tables = await listTableNames(driver);
    expect(tables).toContain('workouts');
    expect(tables).not.toContain('half_written');
    expect((await readAppliedMigrations(driver)).map((row) => row.tag)).toEqual([first.tag]);
    await driver.close();
  });

  it('refuses a database whose applied migration no longer matches this build', async () => {
    const driver = createBetterSqlite3Driver();
    const first = MIGRATIONS[0];
    if (!first) throw new Error('expected at least one generated migration');

    await migrate(driver, { migrations: [first] });
    const edited = { ...first, hash: `${first.hash.slice(0, -1)}0` };

    await expect(migrate(driver, { migrations: [edited] })).rejects.toBeInstanceOf(
      MigrationIntegrityError,
    );
    await driver.close();
  });

  it('refuses a database migrated by a newer build', async () => {
    const driver = createBetterSqlite3Driver();
    const first = MIGRATIONS[0];
    if (!first) throw new Error('expected at least one generated migration');
    const future = {
      idx: first.idx + 1,
      tag: '9999_from_the_future',
      hash: 'future',
      statements: ['CREATE TABLE `future` (`id` text PRIMARY KEY NOT NULL)'],
    };

    await migrate(driver, { migrations: [first, future] });

    await expect(migrate(driver, { migrations: [first] })).rejects.toThrow(/9999_from_the_future/);
    await driver.close();
  });
});
