/**
 * RPC protocol between the main thread and the SQLite worker — DESIGN.md §7.4.
 * The worker owns the `opfs-sahpool` VFS handle; the main thread only ever
 * talks to it through these messages, never touching SQL directly.
 */

export interface InitRequestBody {
  kind: 'init';
  databaseName: string;
  vfsDirectory: string;
  poolCapacity?: number;
}

export interface RunRequestBody {
  kind: 'run';
  sql: string;
  params: unknown[];
}

export interface TxRequestBody {
  kind: 'begin' | 'commit' | 'rollback';
}

/** What the driver sends before an `id` is assigned. */
export type WorkerRequestBody = InitRequestBody | RunRequestBody | TxRequestBody;

export type WorkerRequest = WorkerRequestBody & { id: number };

export interface RunOkResponse {
  id: number;
  ok: true;
  rows: unknown[][];
  changes: number;
}

export interface RunErrResponse {
  id: number;
  ok: false;
  error: string;
}

export type WorkerResponse = RunOkResponse | RunErrResponse;
