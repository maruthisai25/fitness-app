import type {
  EquipmentCategory,
  Exercise,
  ExerciseRelation,
  ExerciseRelationKind,
  Id,
  MovementPattern,
} from '@vigor/core';
import { and, asc, eq, inArray, like, or, type SQL } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { exerciseRelations, exercises as exercisesTable } from '../schema';
import {
  chunk,
  definedOnly,
  firstOrNull,
  isEmptyPatch,
  jsonArrayContainsPattern,
  MAX_BOUND_PARAMS,
  requireRow,
} from './support';

export type ExerciseFields = Omit<Exercise, 'id'>;

/** A custom exercise the user added; library seeds pass every field. */
export type ExerciseDraft = Partial<ExerciseFields> &
  Pick<ExerciseFields, 'name' | 'slug' | 'movementPattern'>;

/** Inputs of the `search_exercises` coach tool (DESIGN.md §6.3). */
export interface ExerciseSearchFilter {
  pattern?: MovementPattern;
  /** Matches `primaryMuscles` or `secondaryMuscles`. */
  muscle?: string;
  /** Every listed category must appear on the exercise. */
  equipment?: readonly EquipmentCategory[];
  /** Substring of the name; SQLite `LIKE` is case-insensitive for ASCII. */
  query?: string;
  includeArchived?: boolean;
  limit?: number;
}

export interface ExerciseRepository {
  list(options?: { includeArchived?: boolean }): Promise<Exercise[]>;
  get(id: Id): Promise<Exercise | null>;
  getBySlug(slug: string): Promise<Exercise | null>;
  getMany(ids: readonly Id[]): Promise<Exercise[]>;
  search(filter?: ExerciseSearchFilter): Promise<Exercise[]>;
  create(draft: ExerciseDraft): Promise<Exercise>;
  /** Bulk insert for the seed library; existing slugs are left untouched. */
  createMany(drafts: readonly ExerciseDraft[]): Promise<Exercise[]>;
  update(id: Id, patch: Partial<ExerciseFields>): Promise<Exercise>;
  /** Soft removal — history keeps pointing at the row. */
  setArchived(id: Id, archived: boolean): Promise<Exercise>;
  remove(id: Id): Promise<void>;

  /** Edges out of `fromId`, optionally of one kind. */
  listRelations(fromId?: Id, kind?: ExerciseRelationKind): Promise<ExerciseRelation[]>;
  /** The exercises `fromId` points at with `kind`. */
  getRelated(fromId: Id, kind: ExerciseRelationKind): Promise<Exercise[]>;
  addRelation(relation: ExerciseRelation): Promise<ExerciseRelation>;
  addRelations(relations: readonly ExerciseRelation[]): Promise<void>;
  removeRelation(fromId: Id, toId: Id, kind: ExerciseRelationKind): Promise<void>;
}

/** Defaults for a user-created exercise; the seed library overrides all of them. */
const EXERCISE_DEFAULTS: Omit<ExerciseFields, 'name' | 'slug' | 'movementPattern'> = {
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: [],
  difficulty: 3,
  instructions: '',
  cues: [],
  isCustom: true,
  loadType: 'external',
  defaultRepRange: { min: 8, max: 12 },
  archived: false,
};

export function createExerciseRepository(db: VigorDb): ExerciseRepository {
  async function get(id: Id): Promise<Exercise | null> {
    const rows = await db.orm
      .select()
      .from(exercisesTable)
      .where(eq(exercisesTable.id, id))
      .limit(1);
    return firstOrNull(rows);
  }

  function buildDraft(draft: ExerciseDraft): Exercise {
    return {
      id: db.newId(),
      ...EXERCISE_DEFAULTS,
      ...definedOnly(draft),
      name: draft.name,
      slug: draft.slug,
      movementPattern: draft.movementPattern,
    };
  }

  async function search(filter: ExerciseSearchFilter = {}): Promise<Exercise[]> {
    const conditions: SQL[] = [];
    if (!filter.includeArchived) conditions.push(eq(exercisesTable.archived, false));
    if (filter.pattern) conditions.push(eq(exercisesTable.movementPattern, filter.pattern));
    if (filter.muscle) {
      const pattern = jsonArrayContainsPattern(filter.muscle);
      const muscleMatch = or(
        like(exercisesTable.primaryMuscles, pattern),
        like(exercisesTable.secondaryMuscles, pattern),
      );
      if (muscleMatch) conditions.push(muscleMatch);
    }
    for (const category of filter.equipment ?? []) {
      conditions.push(like(exercisesTable.equipment, jsonArrayContainsPattern(category)));
    }
    if (filter.query) {
      const escaped = filter.query.replace(/[%_]/g, '');
      if (escaped.length > 0) conditions.push(like(exercisesTable.name, `%${escaped}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const query = db.orm
      .select()
      .from(exercisesTable)
      .where(where)
      .orderBy(asc(exercisesTable.name));
    return filter.limit !== undefined ? query.limit(filter.limit) : query;
  }

  async function update(id: Id, patch: Partial<ExerciseFields>): Promise<Exercise> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'exercises', id);
    }
    const [row] = await db.orm
      .update(exercisesTable)
      .set(fields)
      .where(eq(exercisesTable.id, id))
      .returning();
    return requireRow(row as Exercise | undefined, 'exercises', id);
  }

  async function listRelations(
    fromId?: Id,
    kind?: ExerciseRelationKind,
  ): Promise<ExerciseRelation[]> {
    const conditions: SQL[] = [];
    if (fromId) conditions.push(eq(exerciseRelations.fromId, fromId));
    if (kind) conditions.push(eq(exerciseRelations.kind, kind));
    return db.orm
      .select()
      .from(exerciseRelations)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
  }

  return {
    async list(options: { includeArchived?: boolean } = {}): Promise<Exercise[]> {
      const query = db.orm.select().from(exercisesTable);
      return options.includeArchived
        ? query.orderBy(asc(exercisesTable.name))
        : query.where(eq(exercisesTable.archived, false)).orderBy(asc(exercisesTable.name));
    },
    get,
    async getBySlug(slug: string): Promise<Exercise | null> {
      const rows = await db.orm
        .select()
        .from(exercisesTable)
        .where(eq(exercisesTable.slug, slug))
        .limit(1);
      return firstOrNull(rows);
    },
    async getMany(ids: readonly Id[]): Promise<Exercise[]> {
      const found: Exercise[] = [];
      for (const batch of chunk(ids, MAX_BOUND_PARAMS)) {
        const rows = await db.orm
          .select()
          .from(exercisesTable)
          .where(inArray(exercisesTable.id, batch));
        found.push(...rows);
      }
      return found;
    },
    search,
    async create(draft: ExerciseDraft): Promise<Exercise> {
      const [row] = await db.orm.insert(exercisesTable).values(buildDraft(draft)).returning();
      return row as Exercise;
    },
    async createMany(drafts: readonly ExerciseDraft[]): Promise<Exercise[]> {
      if (drafts.length === 0) return [];
      return db.transaction(async (tx) => {
        const inserted: Exercise[] = [];
        for (const draft of drafts) {
          const rows = await tx.orm
            .insert(exercisesTable)
            .values(buildDraft(draft))
            .onConflictDoNothing({ target: exercisesTable.slug })
            .returning();
          if (rows[0]) inserted.push(rows[0]);
        }
        return inserted;
      });
    },
    update,
    setArchived: (id, archived) => update(id, { archived }),
    async remove(id: Id): Promise<void> {
      await db.orm.delete(exercisesTable).where(eq(exercisesTable.id, id));
    },

    listRelations,
    async getRelated(fromId: Id, kind: ExerciseRelationKind): Promise<Exercise[]> {
      const relations = await listRelations(fromId, kind);
      if (relations.length === 0) return [];
      const ids = relations.map((relation) => relation.toId);
      const found: Exercise[] = [];
      for (const batch of chunk(ids, MAX_BOUND_PARAMS)) {
        const rows = await db.orm
          .select()
          .from(exercisesTable)
          .where(inArray(exercisesTable.id, batch));
        found.push(...rows);
      }
      return found;
    },
    async addRelation(relation: ExerciseRelation): Promise<ExerciseRelation> {
      const [row] = await db.orm
        .insert(exerciseRelations)
        .values(relation)
        .onConflictDoUpdate({
          target: [exerciseRelations.fromId, exerciseRelations.toId, exerciseRelations.kind],
          set: { note: relation.note },
        })
        .returning();
      return row as ExerciseRelation;
    },
    async addRelations(relations: readonly ExerciseRelation[]): Promise<void> {
      if (relations.length === 0) return;
      await db.transaction(async (tx) => {
        for (const relation of relations) {
          await tx.orm.insert(exerciseRelations).values(relation).onConflictDoNothing();
        }
      });
    },
    async removeRelation(fromId: Id, toId: Id, kind: ExerciseRelationKind): Promise<void> {
      await db.orm
        .delete(exerciseRelations)
        .where(
          and(
            eq(exerciseRelations.fromId, fromId),
            eq(exerciseRelations.toId, toId),
            eq(exerciseRelations.kind, kind),
          ),
        );
    },
  };
}
