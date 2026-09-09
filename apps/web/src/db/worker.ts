/// <reference lib="webworker" />
/**
 * The SQLite worker — DESIGN.md §4, §7.4.
 *
 * Owns the one `opfs-sahpool` database connection. Runs as a dedicated module
 * worker (`vite.config.ts` sets `worker.format: 'es'`) so the VFS's
 * synchronous file access handles never share a thread with the UI, and no
 * COOP/COEP headers are required (DESIGN.md §4).
 *
 * Statement content belongs to `packages/db` — this file forwards whatever
 * SQL the main-thread driver sends and enforces the two rules
 * `packages/db/src/drivers/types.ts` documents for every platform driver:
 * foreign keys on, and params routed through `toSqliteParam`.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { BindingSpec, Database, SqlValue } from '@sqlite.org/sqlite-wasm';
import { FOREIGN_KEYS_PRAGMA, toSqliteParam } from '@vigor/db';

import type { InitRequestBody, WorkerRequest, WorkerResponse } from './protocol';

let dbPromise: Promise<Database> | null = null;

async function openDatabase(opts: InitRequestBody): Promise<Database> {
  const sqlite3 = await sqlite3InitModule();
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({
    name: 'vigor-opfs',
    directory: opts.vfsDirectory,
    initialCapacity: opts.poolCapacity,
  });
  const db = new poolUtil.OpfsSAHPoolDb(`/${opts.databaseName}`);
  db.exec(FOREIGN_KEYS_PRAGMA);
  return db;
}

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

function runStatement(
  db: Database,
  sql: string,
  params: unknown[],
): { rows: unknown[][]; changes: number } {
  const rows = db.exec({
    sql,
    bind: params.map(toSqliteParam) as unknown as BindingSpec,
    rowMode: 'array',
    returnValue: 'resultRows',
  }) as SqlValue[][];
  return { rows, changes: Number(db.changes(false)) };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  try {
    if (message.kind === 'init') {
      dbPromise = openDatabase(message);
      await dbPromise;
      post({ id: message.id, ok: true, rows: [], changes: 0 });
      return;
    }

    if (!dbPromise) {
      throw new Error('VigorEngine: SQLite worker received a statement before init');
    }
    const db = await dbPromise;

    if (message.kind === 'run') {
      const { rows, changes } = runStatement(db, message.sql, message.params);
      post({ id: message.id, ok: true, rows, changes });
      return;
    }

    const sql =
      message.kind === 'begin' ? 'BEGIN' : message.kind === 'commit' ? 'COMMIT' : 'ROLLBACK';
    const { changes } = runStatement(db, sql, []);
    post({ id: message.id, ok: true, rows: [], changes });
  } catch (error) {
    post({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
