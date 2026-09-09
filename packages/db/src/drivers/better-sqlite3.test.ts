/**
 * The `SqlDriver` contract, exercised through the better-sqlite3 driver.
 *
 * `apps/mobile` and `apps/web` implement `CreateExpoSqlDriver` and
 * `CreateWasmSqlDriver` against the same three rules, so this file doubles as
 * the executable specification they should copy their assertions from.
 */

import { describe, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from './better-sqlite3';
import { toSqliteParam } from './types';

async function withDriver<T>(
  fn: (driver: ReturnType<typeof createBetterSqlite3Driver>) => Promise<T>,
) {
  const driver = createBetterSqlite3Driver();
  try {
    await driver.run('CREATE TABLE t (id text PRIMARY KEY, n integer)', []);
    return await fn(driver);
  } finally {
    await driver.close();
  }
}

describe('SqlDriver contract', () => {
  it('returns positional rows, not objects', async () => {
    await withDriver(async (driver) => {
      await driver.run('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1]);
      const { rows } = await driver.run('SELECT id, n FROM t', []);
      expect(rows).toEqual([['a', 1]]);
    });
  });

  it('reports how many rows a write changed', async () => {
    await withDriver(async (driver) => {
      const insert = await driver.run('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1]);
      expect(insert.changes).toBe(1);
      expect(insert.rows).toEqual([]);

      const update = await driver.run('UPDATE t SET n = ?', [2]);
      expect(update.changes).toBe(1);
    });
  });

  it('commits a transaction that resolves', async () => {
    await withDriver(async (driver) => {
      await driver.transaction(async (tx) => {
        await tx.run('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1]);
        await tx.run('INSERT INTO t (id, n) VALUES (?, ?)', ['b', 2]);
      });
      const { rows } = await driver.run('SELECT count(*) FROM t', []);
      expect(rows[0]?.[0]).toBe(2);
    });
  });

  it('rolls a transaction back when it rejects', async () => {
    await withDriver(async (driver) => {
      await expect(
        driver.transaction(async (tx) => {
          await tx.run('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1]);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const { rows } = await driver.run('SELECT count(*) FROM t', []);
      expect(rows[0]?.[0]).toBe(0);
    });
  });

  it('maps nesting onto savepoints so the outer transaction survives', async () => {
    await withDriver(async (driver) => {
      await driver.transaction(async (tx) => {
        await tx.run('INSERT INTO t (id, n) VALUES (?, ?)', ['outer', 1]);
        await expect(
          tx.transaction(async (inner) => {
            await inner.run('INSERT INTO t (id, n) VALUES (?, ?)', ['inner', 2]);
            throw new Error('inner failed');
          }),
        ).rejects.toThrow('inner failed');
      });

      const { rows } = await driver.run('SELECT id FROM t', []);
      expect(rows).toEqual([['outer']]);
    });
  });

  it('rejects every statement once closed', async () => {
    const driver = createBetterSqlite3Driver();
    await driver.close();
    await expect(driver.run('SELECT 1', [])).rejects.toThrow(/closed/);
    // Closing twice is a no-op, so app teardown does not have to guard it.
    await expect(driver.close()).resolves.toBeUndefined();
  });

  it('names the failing statement in the error', async () => {
    await withDriver(async (driver) => {
      await expect(driver.run('SELECT * FROM nope', [])).rejects.toThrow(/SELECT \* FROM nope/);
    });
  });

  it('enforces the foreign keys declared in the schema', async () => {
    const driver = createBetterSqlite3Driver();
    await driver.run('CREATE TABLE parent (id text PRIMARY KEY)', []);
    await driver.run(
      'CREATE TABLE child (id text PRIMARY KEY, parentId text REFERENCES parent(id))',
      [],
    );
    await expect(
      driver.run('INSERT INTO child (id, parentId) VALUES (?, ?)', ['c', 'missing']),
    ).rejects.toThrow(/FOREIGN KEY/i);
    await driver.close();
  });
});

describe('toSqliteParam', () => {
  it('normalises the values a binding may receive', () => {
    expect(toSqliteParam(null)).toBeNull();
    expect(toSqliteParam(undefined)).toBeNull();
    expect(toSqliteParam(true)).toBe(1);
    expect(toSqliteParam(false)).toBe(0);
    expect(toSqliteParam(12.5)).toBe(12.5);
    expect(toSqliteParam('kg')).toBe('kg');
    expect(toSqliteParam(9n)).toBe(9);
    expect(toSqliteParam(new Date('2026-04-01T00:00:00.000Z'))).toBe('2026-04-01T00:00:00.000Z');
    expect(toSqliteParam(['a', 'b'])).toBe('["a","b"]');
  });
});
