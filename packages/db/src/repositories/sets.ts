import type { Id, IsoTimestamp, SetRecord } from '@vigor/core';
import { asc, desc, eq, inArray } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { sets as setsTable, workoutExercises } from '../schema';
import {
  chunk,
  definedOnly,
  firstOrNull,
  isEmptyPatch,
  MAX_BOUND_PARAMS,
  requireRow,
} from './support';

export type SetFields = Omit<SetRecord, 'id' | 'workoutExerciseId'>;

export type SetDraft = Partial<SetFields>;

/** DESIGN.md §4.2 — what session mode confirms for one set. */
export interface SetResult {
  actualReps?: number | null;
  actualLoadKg?: number | null;
  /** 1–10, halves allowed. */
  rpe?: number | null;
  notes?: string | null;
  /** Defaults to now; pass it to keep a replayed queue idempotent. */
  completedAt?: IsoTimestamp;
}

export interface SetRepository {
  /**
   * DESIGN.md §4.2. Writes what the user actually did and marks the set
   * completed. Session mode calls this on every confirmation so a crash loses
   * at most the row being edited (DESIGN.md §7.2).
   */
  record(setId: Id, result: SetResult): Promise<SetRecord>;

  get(id: Id): Promise<SetRecord | null>;
  listForWorkoutExercise(workoutExerciseId: Id): Promise<SetRecord[]>;
  listForWorkout(workoutId: Id): Promise<SetRecord[]>;
  /** Appends a set after the last one on that exercise. */
  add(workoutExerciseId: Id, draft?: SetDraft): Promise<SetRecord>;
  update(id: Id, patch: Partial<SetFields>): Promise<SetRecord>;
  /** Clears the logged result and the completion flag. */
  clearResult(id: Id): Promise<SetRecord>;
  remove(id: Id): Promise<void>;
}

export function createSetRepository(db: VigorDb): SetRepository {
  async function get(id: Id): Promise<SetRecord | null> {
    const rows = await db.orm.select().from(setsTable).where(eq(setsTable.id, id)).limit(1);
    return firstOrNull(rows);
  }

  async function update(id: Id, patch: Partial<SetFields>): Promise<SetRecord> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'sets', id);
    }
    const [row] = await db.orm
      .update(setsTable)
      .set(fields)
      .where(eq(setsTable.id, id))
      .returning();
    return requireRow(row as SetRecord | undefined, 'sets', id);
  }

  return {
    async record(setId: Id, result: SetResult): Promise<SetRecord> {
      return update(setId, {
        ...definedOnly(result),
        completed: true,
        completedAt: result.completedAt ?? db.now(),
      });
    },
    get,
    async listForWorkoutExercise(workoutExerciseId: Id): Promise<SetRecord[]> {
      return db.orm
        .select()
        .from(setsTable)
        .where(eq(setsTable.workoutExerciseId, workoutExerciseId))
        .orderBy(asc(setsTable.setIndex));
    },
    async listForWorkout(workoutId: Id): Promise<SetRecord[]> {
      const owned = await db.orm
        .select({ id: workoutExercises.id })
        .from(workoutExercises)
        .where(eq(workoutExercises.workoutId, workoutId))
        .orderBy(asc(workoutExercises.order));
      const rows: SetRecord[] = [];
      for (const batch of chunk(
        owned.map((row) => row.id),
        MAX_BOUND_PARAMS,
      )) {
        const found = await db.orm
          .select()
          .from(setsTable)
          .where(inArray(setsTable.workoutExerciseId, batch))
          .orderBy(asc(setsTable.workoutExerciseId), asc(setsTable.setIndex));
        rows.push(...found);
      }
      return rows;
    },
    async add(workoutExerciseId: Id, draft: SetDraft = {}): Promise<SetRecord> {
      const last = await db.orm
        .select({ setIndex: setsTable.setIndex })
        .from(setsTable)
        .where(eq(setsTable.workoutExerciseId, workoutExerciseId))
        .orderBy(desc(setsTable.setIndex))
        .limit(1);
      const nextIndex = last[0] ? last[0].setIndex + 1 : 0;
      const row: SetRecord = {
        id: db.newId(),
        workoutExerciseId,
        setIndex: draft.setIndex ?? nextIndex,
        targetReps: draft.targetReps ?? 0,
        actualReps: draft.actualReps ?? null,
        actualLoadKg: draft.actualLoadKg ?? null,
        rpe: draft.rpe ?? null,
        completed: draft.completed ?? false,
        isWarmup: draft.isWarmup ?? false,
        notes: draft.notes ?? null,
        completedAt: draft.completedAt ?? null,
      };
      const [inserted] = await db.orm.insert(setsTable).values(row).returning();
      return inserted as SetRecord;
    },
    update,
    clearResult: (id) =>
      update(id, {
        actualReps: null,
        actualLoadKg: null,
        rpe: null,
        completed: false,
        completedAt: null,
      }),
    async remove(id: Id): Promise<void> {
      await db.orm.delete(setsTable).where(eq(setsTable.id, id));
    },
  };
}
