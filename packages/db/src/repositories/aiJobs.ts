import type { AiJob, AiJobKind, AiJobStatus, Id } from '@vigor/core';
import { and, asc, eq, inArray, lt, type SQL } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { aiJobs as aiJobsTable } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type AiJobFields = Omit<AiJob, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * DESIGN.md §8 — "jobs are idempotent by `id`". Pass an `id` derived from what
 * the job is about (the `food_logs` row, the week start) and re-enqueueing the
 * same work is a no-op instead of a duplicate API call.
 */
export type AiJobDraft = {
  kind: AiJobKind;
  payload: Record<string, unknown>;
  id?: Id;
  resultRef?: string | null;
};

export interface AiJobRepository {
  /** Inserts the job, or returns the existing row when the id is already taken. */
  enqueue(draft: AiJobDraft): Promise<AiJob>;
  get(id: Id): Promise<AiJob | null>;
  list(filter?: { status?: AiJobStatus; kind?: AiJobKind; limit?: number }): Promise<AiJob[]>;
  /** Oldest queued jobs first — the queue drains in order (DESIGN.md §8). */
  listQueued(options?: { limit?: number }): Promise<AiJob[]>;
  /** Marks the job running and counts the attempt. */
  markRunning(id: Id): Promise<AiJob>;
  markDone(id: Id, resultRef?: string | null): Promise<AiJob>;
  markFailed(id: Id, error: string): Promise<AiJob>;
  /** Returns a failed job to the queue after its backoff has elapsed. */
  requeue(id: Id): Promise<AiJob>;
  remove(id: Id): Promise<void>;
  /** Drops finished jobs older than `before`, keeping the queue table small. */
  pruneDone(before: string): Promise<number>;
}

export function createAiJobRepository(db: VigorDb): AiJobRepository {
  async function get(id: Id): Promise<AiJob | null> {
    const rows = await db.orm.select().from(aiJobsTable).where(eq(aiJobsTable.id, id)).limit(1);
    return firstOrNull(rows);
  }

  async function update(id: Id, patch: Partial<AiJobFields>): Promise<AiJob> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'ai_jobs', id);
    }
    const [row] = await db.orm
      .update(aiJobsTable)
      .set({ ...fields, updatedAt: db.now() })
      .where(eq(aiJobsTable.id, id))
      .returning();
    return requireRow(row as AiJob | undefined, 'ai_jobs', id);
  }

  return {
    async enqueue(draft: AiJobDraft): Promise<AiJob> {
      const timestamp = db.now();
      const row: AiJob = {
        id: draft.id ?? db.newId(),
        kind: draft.kind,
        payload: draft.payload,
        status: 'queued',
        attempts: 0,
        resultRef: draft.resultRef ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastError: null,
      };
      const inserted = await db.orm
        .insert(aiJobsTable)
        .values(row)
        .onConflictDoNothing({ target: aiJobsTable.id })
        .returning();
      if (inserted[0]) return inserted[0];
      const existing = await get(row.id);
      return requireRow(existing ?? undefined, 'ai_jobs', row.id);
    },
    get,
    async list(
      filter: { status?: AiJobStatus; kind?: AiJobKind; limit?: number } = {},
    ): Promise<AiJob[]> {
      const conditions: SQL[] = [];
      if (filter.status) conditions.push(eq(aiJobsTable.status, filter.status));
      if (filter.kind) conditions.push(eq(aiJobsTable.kind, filter.kind));
      const query = db.orm
        .select()
        .from(aiJobsTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(aiJobsTable.createdAt), asc(aiJobsTable.id));
      return filter.limit !== undefined ? query.limit(filter.limit) : query;
    },
    async listQueued(options: { limit?: number } = {}): Promise<AiJob[]> {
      const query = db.orm
        .select()
        .from(aiJobsTable)
        .where(eq(aiJobsTable.status, 'queued'))
        .orderBy(asc(aiJobsTable.createdAt), asc(aiJobsTable.id));
      return options.limit !== undefined ? query.limit(options.limit) : query;
    },
    async markRunning(id: Id): Promise<AiJob> {
      return db.transaction(async (tx) => {
        const rows = await tx.orm.select().from(aiJobsTable).where(eq(aiJobsTable.id, id)).limit(1);
        const current = requireRow(rows[0], 'ai_jobs', id);
        const [row] = await tx.orm
          .update(aiJobsTable)
          .set({ status: 'running', attempts: current.attempts + 1, updatedAt: db.now() })
          .where(eq(aiJobsTable.id, id))
          .returning();
        return row as AiJob;
      });
    },
    markDone: (id, resultRef = null) => update(id, { status: 'done', resultRef, lastError: null }),
    markFailed: (id, error) => update(id, { status: 'failed', lastError: error }),
    requeue: (id) => update(id, { status: 'queued' }),
    async remove(id: Id): Promise<void> {
      await db.orm.delete(aiJobsTable).where(eq(aiJobsTable.id, id));
    },
    async pruneDone(before: string): Promise<number> {
      const stale = await db.orm
        .select({ id: aiJobsTable.id })
        .from(aiJobsTable)
        .where(and(eq(aiJobsTable.status, 'done'), lt(aiJobsTable.updatedAt, before)));
      if (stale.length === 0) return 0;
      await db.orm.delete(aiJobsTable).where(
        inArray(
          aiJobsTable.id,
          stale.map((row) => row.id),
        ),
      );
      return stale.length;
    },
  };
}
