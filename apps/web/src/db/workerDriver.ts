import type { ClosableSqlDriver, CreateWasmSqlDriver, SqlDriver } from '@vigor/db';

import type { WorkerRequest, WorkerRequestBody, WorkerResponse } from './protocol';

const DEFAULT_DATABASE_NAME = 'vigor.db';
const DEFAULT_VFS_DIRECTORY = '/vigor';

interface Pending {
  resolve: (r: { rows: unknown[][]; changes: number }) => void;
  reject: (e: Error) => void;
}

/**
 * `apps/web`'s half of DESIGN.md §4's `CreateWasmSqlDriver` contract: opens
 * the SQLite worker, initializes its `opfs-sahpool` database, and hands back
 * a `ClosableSqlDriver` — nothing above this module needs to know SQLite
 * runs off the main thread at all.
 */
export const createWasmSqlDriver: CreateWasmSqlDriver = (options = {}) => {
  const databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
  const vfsDirectory = options.vfsDirectory ?? DEFAULT_VFS_DIRECTORY;
  const onStatement = options.onStatement;

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    let nextId = 1;
    const pending = new Map<number, Pending>();
    let settledInit = false;

    function send(request: WorkerRequestBody): Promise<{ rows: unknown[][]; changes: number }> {
      const id = nextId++;
      return new Promise((res, rej) => {
        pending.set(id, { resolve: res, reject: rej });
        worker.postMessage({ ...request, id } as WorkerRequest);
      });
    }

    worker.onerror = (event: ErrorEvent) => {
      if (!settledInit) {
        settledInit = true;
        reject(new Error(`VigorEngine: SQLite worker failed to start: ${event.message}`));
      }
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      if (message.ok) {
        waiting.resolve({ rows: message.rows, changes: message.changes });
      } else {
        waiting.reject(new Error(message.error));
      }
    };

    send({ kind: 'init', databaseName, vfsDirectory, poolCapacity: options.poolCapacity }).then(
      () => {
        settledInit = true;
        resolve(new WorkerSqlDriver(worker, send, onStatement));
      },
      (error: unknown) => {
        settledInit = true;
        worker.terminate();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
};

class WorkerSqlDriver implements ClosableSqlDriver {
  private closed = false;

  constructor(
    private readonly worker: Worker,
    private readonly send: (
      request: WorkerRequestBody,
    ) => Promise<{ rows: unknown[][]; changes: number }>,
    private readonly onStatement?: (sql: string, params: readonly unknown[]) => void,
  ) {}

  run(sql: string, params: unknown[]): Promise<{ rows: unknown[][]; changes: number }> {
    if (this.closed) {
      return Promise.reject(new Error('VigorEngine: SQLite driver is closed'));
    }
    this.onStatement?.(sql, params);
    return this.send({ kind: 'run', sql, params });
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    // One physical connection behind the worker's single message queue, so
    // the "transaction driver" is the same driver — statements sent while
    // `fn` runs are still strictly ordered between BEGIN and COMMIT/ROLLBACK.
    await this.send({ kind: 'begin' });
    try {
      const result = await fn(this);
      await this.send({ kind: 'commit' });
      return result;
    } catch (error) {
      await this.send({ kind: 'rollback' });
      throw error;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.worker.terminate();
  }
}
