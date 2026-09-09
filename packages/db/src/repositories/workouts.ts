import {
  workoutPlanSchema,
  type ExerciseSession,
  type Id,
  type LocalDate,
  type SetRecord,
  type Workout,
  type WorkoutExercise,
  type WorkoutExerciseWithSets,
  type WorkoutPlan,
  type WorkoutPlanExercise,
  type WorkoutStatus,
  type WorkoutWithExercises,
} from '@vigor/core';
import { and, asc, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { localDateFromTimestamp, windowEndingOn } from '../dates';
import { sets as setsTable, workoutExercises, workouts as workoutsTable } from '../schema';
import {
  chunk,
  definedOnly,
  firstOrNull,
  groupBy,
  isEmptyPatch,
  MAX_BOUND_PARAMS,
  requireRow,
} from './support';

export type WorkoutFields = Omit<Workout, 'id'>;

export type WorkoutDraft = Partial<WorkoutFields> & Pick<WorkoutFields, 'date' | 'title'>;

export type WorkoutExerciseFields = Omit<WorkoutExercise, 'id' | 'workoutId'>;

export type WorkoutExerciseDraft = Partial<WorkoutExerciseFields> &
  Pick<WorkoutExerciseFields, 'exerciseId'>;

/**
 * History is what actually happened, so only finished sessions count by
 * default. The progression engine (DESIGN.md §5.1) reads exactly this.
 */
export const HISTORY_STATUSES: readonly WorkoutStatus[] = ['completed'];

const WORKOUT_DEFAULTS: Omit<WorkoutFields, 'date' | 'title'> = {
  status: 'planned',
  source: 'manual',
  focus: [],
  plannedDurationMin: 45,
  startedAt: null,
  finishedAt: null,
  readinessId: null,
  rationale: null,
  coachMessageId: null,
  notes: null,
};

const WORKOUT_EXERCISE_DEFAULTS: Omit<WorkoutExerciseFields, 'exerciseId'> = {
  order: 0,
  targetSets: 3,
  targetRepMin: 8,
  targetRepMax: 12,
  targetLoadKg: null,
  restSec: 90,
  tempo: null,
  substitutedFromExerciseId: null,
  progressionDecision: null,
  notes: null,
};

export interface WorkoutRepository {
  /** DESIGN.md §4.2. The inclusive `days`-long window ending today. */
  getRecent(options: { days: number; today?: LocalDate }): Promise<WorkoutWithExercises[]>;
  /** DESIGN.md §4.2. Most recent session first; sets ordered by `setIndex`. */
  getExerciseHistory(
    exerciseId: Id,
    options?: { limit?: number; statuses?: readonly WorkoutStatus[] },
  ): Promise<ExerciseSession[]>;
  /**
   * DESIGN.md §4.2. Writes the plan, its exercises and one `sets` row per
   * target set so session mode has rows to fill in from the first tap.
   */
  createPlanned(plan: WorkoutPlan): Promise<Workout>;

  get(id: Id): Promise<Workout | null>;
  getWithExercises(id: Id): Promise<WorkoutWithExercises | null>;
  getByDate(date: LocalDate): Promise<WorkoutWithExercises[]>;
  listRange(range: { from: LocalDate; to: LocalDate }): Promise<Workout[]>;
  create(draft: WorkoutDraft): Promise<Workout>;
  update(id: Id, patch: Partial<WorkoutFields>): Promise<Workout>;
  setStatus(id: Id, status: WorkoutStatus): Promise<Workout>;
  /** Marks the session started, stamping `startedAt` if it is not set yet. */
  start(id: Id): Promise<Workout>;
  /** Marks the session finished and stamps `finishedAt`. */
  finish(id: Id, status?: Extract<WorkoutStatus, 'completed' | 'abandoned'>): Promise<Workout>;
  remove(id: Id): Promise<void>;

  listExercises(workoutId: Id): Promise<WorkoutExerciseWithSets[]>;
  getExercise(workoutExerciseId: Id): Promise<WorkoutExercise | null>;
  addExercise(workoutId: Id, draft: WorkoutExerciseDraft): Promise<WorkoutExercise>;
  updateExercise(
    workoutExerciseId: Id,
    patch: Partial<WorkoutExerciseFields>,
  ): Promise<WorkoutExercise>;
  removeExercise(workoutExerciseId: Id): Promise<void>;
  /** Rewrites `order` to match the given id sequence. */
  reorderExercises(workoutId: Id, orderedIds: readonly Id[]): Promise<WorkoutExerciseWithSets[]>;
}

export function createWorkoutRepository(db: VigorDb): WorkoutRepository {
  async function loadSetsFor(workoutExerciseIds: readonly Id[]): Promise<SetRecord[]> {
    const rows: SetRecord[] = [];
    for (const batch of chunk(workoutExerciseIds, MAX_BOUND_PARAMS)) {
      const found = await db.orm
        .select()
        .from(setsTable)
        .where(inArray(setsTable.workoutExerciseId, batch))
        .orderBy(asc(setsTable.workoutExerciseId), asc(setsTable.setIndex));
      rows.push(...found);
    }
    return rows;
  }

  async function attachExercises(rows: Workout[]): Promise<WorkoutWithExercises[]> {
    if (rows.length === 0) return [];
    const workoutIds = rows.map((row) => row.id);

    const exerciseRows: WorkoutExercise[] = [];
    for (const batch of chunk(workoutIds, MAX_BOUND_PARAMS)) {
      const found = await db.orm
        .select()
        .from(workoutExercises)
        .where(inArray(workoutExercises.workoutId, batch))
        .orderBy(asc(workoutExercises.workoutId), asc(workoutExercises.order));
      exerciseRows.push(...found);
    }

    const setRows = await loadSetsFor(exerciseRows.map((row) => row.id));
    const setsByExercise = groupBy(setRows, (row) => row.workoutExerciseId);
    const exercisesByWorkout = groupBy(exerciseRows, (row) => row.workoutId);

    return rows.map((workout) => ({
      ...workout,
      exercises: (exercisesByWorkout.get(workout.id) ?? []).map((exercise) => ({
        ...exercise,
        sets: setsByExercise.get(exercise.id) ?? [],
      })),
    }));
  }

  async function get(id: Id): Promise<Workout | null> {
    const rows = await db.orm.select().from(workoutsTable).where(eq(workoutsTable.id, id)).limit(1);
    return firstOrNull(rows);
  }

  async function update(id: Id, patch: Partial<WorkoutFields>): Promise<Workout> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'workouts', id);
    }
    const [row] = await db.orm
      .update(workoutsTable)
      .set(fields)
      .where(eq(workoutsTable.id, id))
      .returning();
    return requireRow(row as Workout | undefined, 'workouts', id);
  }

  async function listExercises(workoutId: Id): Promise<WorkoutExerciseWithSets[]> {
    const rows = await db.orm
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId))
      .orderBy(asc(workoutExercises.order));
    const setRows = await loadSetsFor(rows.map((row) => row.id));
    const setsByExercise = groupBy(setRows, (row) => row.workoutExerciseId);
    return rows.map((row) => ({ ...row, sets: setsByExercise.get(row.id) ?? [] }));
  }

  /**
   * The planned set rows for one exercise slot. `targetReps` is the bottom of
   * the range: under double progression (DESIGN.md §5.1) that is the number
   * every working set must reach before the load moves.
   */
  function plannedSets(workoutExerciseId: Id, exercise: WorkoutPlanExercise): SetRecord[] {
    return Array.from({ length: exercise.targetSets }, (_unused, setIndex) => ({
      id: db.newId(),
      workoutExerciseId,
      setIndex,
      targetReps: exercise.targetRepMin,
      actualReps: null,
      actualLoadKg: null,
      rpe: null,
      completed: false,
      isWarmup: false,
      notes: null,
      completedAt: null,
    }));
  }

  return {
    async getRecent(options: { days: number; today?: LocalDate }): Promise<WorkoutWithExercises[]> {
      const today = options.today ?? localDateFromTimestamp(db.now());
      const { from, to } = windowEndingOn(today, options.days);
      const rows = await db.orm
        .select()
        .from(workoutsTable)
        .where(and(gte(workoutsTable.date, from), lte(workoutsTable.date, to)))
        .orderBy(desc(workoutsTable.date), desc(workoutsTable.id));
      return attachExercises(rows);
    },

    async getExerciseHistory(
      exerciseId: Id,
      options: { limit?: number; statuses?: readonly WorkoutStatus[] } = {},
    ): Promise<ExerciseSession[]> {
      const statuses = options.statuses ?? HISTORY_STATUSES;
      if (statuses.length === 0) return [];

      const conditions: SQL[] = [
        eq(workoutExercises.exerciseId, exerciseId),
        inArray(workoutsTable.status, [...statuses]),
      ];
      const query = db.orm
        .select({ workout: workoutsTable, exercise: workoutExercises })
        .from(workoutExercises)
        .innerJoin(workoutsTable, eq(workoutExercises.workoutId, workoutsTable.id))
        .where(and(...conditions))
        // Newest session first. `finishedAt` breaks ties inside one day, and the
        // UUID v7 id is the final, always-present tiebreaker.
        .orderBy(
          desc(workoutsTable.date),
          desc(workoutsTable.finishedAt),
          desc(workoutsTable.id),
          asc(workoutExercises.order),
        );
      const joined = options.limit !== undefined ? await query.limit(options.limit) : await query;

      const setRows = await loadSetsFor(joined.map((row) => row.exercise.id));
      const setsByExercise = groupBy(setRows, (row) => row.workoutExerciseId);

      return joined.map(({ workout, exercise }) => ({
        workoutId: workout.id,
        workoutExerciseId: exercise.id,
        exerciseId: exercise.exerciseId,
        date: workout.date,
        status: workout.status,
        targetRepMin: exercise.targetRepMin,
        targetRepMax: exercise.targetRepMax,
        targetLoadKg: exercise.targetLoadKg,
        sets: setsByExercise.get(exercise.id) ?? [],
      }));
    },

    async createPlanned(plan: WorkoutPlan): Promise<Workout> {
      const parsed = workoutPlanSchema.parse(plan);
      const workoutId = db.newId();
      const workout: Workout = {
        id: workoutId,
        date: parsed.date,
        status: 'planned',
        source: parsed.source,
        title: parsed.title,
        focus: parsed.focus,
        plannedDurationMin: parsed.plannedDurationMin,
        startedAt: null,
        finishedAt: null,
        readinessId: parsed.readinessId,
        rationale: parsed.rationale,
        coachMessageId: null,
        notes: parsed.notes,
      };

      return db.transaction(async (tx) => {
        const [inserted] = await tx.orm.insert(workoutsTable).values(workout).returning();

        const ordered = [...parsed.exercises].sort((a, b) => a.order - b.order);
        for (const [index, exercise] of ordered.entries()) {
          const workoutExerciseId = db.newId();
          const row: WorkoutExercise = {
            id: workoutExerciseId,
            workoutId,
            order: index,
            exerciseId: exercise.exerciseId,
            targetSets: exercise.targetSets,
            targetRepMin: exercise.targetRepMin,
            targetRepMax: exercise.targetRepMax,
            targetLoadKg: exercise.targetLoadKg,
            restSec: exercise.restSec,
            tempo: exercise.tempo,
            substitutedFromExerciseId: exercise.substitutedFromExerciseId,
            progressionDecision: exercise.progressionDecision,
            notes: exercise.notes,
          };
          await tx.orm.insert(workoutExercises).values(row);
          const setRows = plannedSets(workoutExerciseId, exercise);
          if (setRows.length > 0) await tx.orm.insert(setsTable).values(setRows);
        }

        return inserted as Workout;
      });
    },

    get,
    async getWithExercises(id: Id): Promise<WorkoutWithExercises | null> {
      const workout = await get(id);
      if (!workout) return null;
      const [withExercises] = await attachExercises([workout]);
      return withExercises ?? null;
    },
    async getByDate(date: LocalDate): Promise<WorkoutWithExercises[]> {
      const rows = await db.orm
        .select()
        .from(workoutsTable)
        .where(eq(workoutsTable.date, date))
        .orderBy(asc(workoutsTable.id));
      return attachExercises(rows);
    },
    async listRange(range: { from: LocalDate; to: LocalDate }): Promise<Workout[]> {
      return db.orm
        .select()
        .from(workoutsTable)
        .where(and(gte(workoutsTable.date, range.from), lte(workoutsTable.date, range.to)))
        .orderBy(desc(workoutsTable.date), desc(workoutsTable.id));
    },
    async create(draft: WorkoutDraft): Promise<Workout> {
      const row: Workout = {
        id: db.newId(),
        ...WORKOUT_DEFAULTS,
        ...definedOnly(draft),
        date: draft.date,
        title: draft.title,
      };
      const [inserted] = await db.orm.insert(workoutsTable).values(row).returning();
      return inserted as Workout;
    },
    update,
    setStatus: (id, status) => update(id, { status }),
    async start(id: Id): Promise<Workout> {
      const current = await get(id);
      const workout = requireRow(current ?? undefined, 'workouts', id);
      return update(id, { status: 'in_progress', startedAt: workout.startedAt ?? db.now() });
    },
    finish: (id, status = 'completed') => update(id, { status, finishedAt: db.now() }),
    async remove(id: Id): Promise<void> {
      // Explicit cascade: `PRAGMA foreign_keys` is a per-connection setting and
      // a platform driver could miss it, so the repository does not rely on it.
      await db.transaction(async (tx) => {
        const owned = await tx.orm
          .select({ id: workoutExercises.id })
          .from(workoutExercises)
          .where(eq(workoutExercises.workoutId, id));
        for (const batch of chunk(
          owned.map((row) => row.id),
          MAX_BOUND_PARAMS,
        )) {
          await tx.orm.delete(setsTable).where(inArray(setsTable.workoutExerciseId, batch));
        }
        await tx.orm.delete(workoutExercises).where(eq(workoutExercises.workoutId, id));
        await tx.orm.delete(workoutsTable).where(eq(workoutsTable.id, id));
      });
    },

    listExercises,
    async getExercise(workoutExerciseId: Id): Promise<WorkoutExercise | null> {
      const rows = await db.orm
        .select()
        .from(workoutExercises)
        .where(eq(workoutExercises.id, workoutExerciseId))
        .limit(1);
      return firstOrNull(rows);
    },
    async addExercise(workoutId: Id, draft: WorkoutExerciseDraft): Promise<WorkoutExercise> {
      const existing = await db.orm
        .select({ order: workoutExercises.order })
        .from(workoutExercises)
        .where(eq(workoutExercises.workoutId, workoutId))
        .orderBy(desc(workoutExercises.order))
        .limit(1);
      const nextOrder = existing[0] ? existing[0].order + 1 : 0;
      const row: WorkoutExercise = {
        id: db.newId(),
        workoutId,
        ...WORKOUT_EXERCISE_DEFAULTS,
        order: draft.order ?? nextOrder,
        ...definedOnly(draft),
        exerciseId: draft.exerciseId,
      };
      const [inserted] = await db.orm.insert(workoutExercises).values(row).returning();
      return inserted as WorkoutExercise;
    },
    async updateExercise(
      workoutExerciseId: Id,
      patch: Partial<WorkoutExerciseFields>,
    ): Promise<WorkoutExercise> {
      const fields = definedOnly(patch);
      if (isEmptyPatch(fields)) {
        const rows = await db.orm
          .select()
          .from(workoutExercises)
          .where(eq(workoutExercises.id, workoutExerciseId))
          .limit(1);
        return requireRow(rows[0], 'workout_exercises', workoutExerciseId);
      }
      const [row] = await db.orm
        .update(workoutExercises)
        .set(fields)
        .where(eq(workoutExercises.id, workoutExerciseId))
        .returning();
      return requireRow(row as WorkoutExercise | undefined, 'workout_exercises', workoutExerciseId);
    },
    async removeExercise(workoutExerciseId: Id): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.orm.delete(setsTable).where(eq(setsTable.workoutExerciseId, workoutExerciseId));
        await tx.orm.delete(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId));
      });
    },
    async reorderExercises(
      workoutId: Id,
      orderedIds: readonly Id[],
    ): Promise<WorkoutExerciseWithSets[]> {
      await db.transaction(async (tx) => {
        for (const [order, id] of orderedIds.entries()) {
          await tx.orm
            .update(workoutExercises)
            .set({ order })
            .where(and(eq(workoutExercises.id, id), eq(workoutExercises.workoutId, workoutId)));
        }
      });
      return listExercises(workoutId);
    },
  };
}
