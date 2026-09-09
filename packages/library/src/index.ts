/**
 * `@vigor/library` — the seed exercise library (JSON), its loader, and the
 * substitution graph. DESIGN.md §3, §4.1 (`exercises`, `exercise_relations`),
 * §5.5 (substitution engine ranks candidates using this graph).
 *
 * The seed data lives in `./data/exercises.json` and `./data/relations.json`
 * and is validated against `@vigor/core`'s zod schemas by `validate()`.
 */

import { exerciseRelationSchema, exerciseSchema } from '@vigor/core';
import type { Exercise, ExerciseRelation, ExerciseRelationKind, Id } from '@vigor/core';
import { z } from 'zod';

import exercisesData from './data/exercises.json';
import relationsData from './data/relations.json';
import { isMuscle } from './muscles';

/** Everything the seeder needs to populate `exercises` and `exercise_relations`. */
export interface ExerciseLibrary {
  /** Bumped when the seed data changes, so migrations can re-seed. */
  version: number;
  exercises: Exercise[];
  relations: ExerciseRelation[];
}

/** Bumped whenever `data/exercises.json` or `data/relations.json` changes shape or content. */
export const SEED_VERSION = 1;

const seedExerciseArraySchema = z.array(exerciseSchema);
const seedRelationArraySchema = z.array(exerciseRelationSchema);

let cachedLibrary: ExerciseLibrary | undefined;

/**
 * Parses and returns the seed library. Throws (via zod) if the checked-in
 * JSON has drifted from the `Exercise` / `ExerciseRelation` shape — this is
 * the same validation `validate()` reports on without throwing.
 *
 * The parsed result is cached: the seed files never change at runtime.
 */
export function loadSeed(): ExerciseLibrary {
  if (!cachedLibrary) {
    const exercises = seedExerciseArraySchema.parse(exercisesData) as Exercise[];
    const relations = seedRelationArraySchema.parse(relationsData) as ExerciseRelation[];
    cachedLibrary = { version: SEED_VERSION, exercises, relations };
  }
  return cachedLibrary;
}

let exerciseIndex: Map<Id, Exercise> | undefined;

function getIndex(): Map<Id, Exercise> {
  if (!exerciseIndex) {
    exerciseIndex = new Map(loadSeed().exercises.map((e) => [e.id, e]));
  }
  return exerciseIndex;
}

/** Look up one seed exercise by id, or `undefined` if it does not exist. */
export function getExercise(id: Id): Exercise | undefined {
  return getIndex().get(id);
}

/**
 * The substitution-graph helper (DESIGN.md §5.5): every exercise reachable
 * from `id` by a relation of the given `kind`, in the direction the relation
 * was declared (`fromId` → `toId`). Pass no `kind` to get every neighbour
 * regardless of relation kind.
 */
export function neighbors(id: Id, kind?: ExerciseRelationKind): Exercise[] {
  const { relations } = loadSeed();
  const index = getIndex();
  const out: Exercise[] = [];
  for (const rel of relations) {
    if (rel.fromId !== id) continue;
    if (kind && rel.kind !== kind) continue;
    const target = index.get(rel.toId);
    if (target) out.push(target);
  }
  return out;
}

/** One problem found while validating the seed library. */
export interface SeedValidationIssue {
  code: string;
  message: string;
}

/**
 * Runs the zod schemas over the seed data and every additional invariant the
 * checked-in JSON must hold (referential integrity, uniqueness). Never
 * throws — callers (and the test suite) inspect `ok` / `issues` instead.
 */
export function validate(): { ok: boolean; issues: SeedValidationIssue[] } {
  const issues: SeedValidationIssue[] = [];

  const exercisesResult = seedExerciseArraySchema.safeParse(exercisesData);
  if (!exercisesResult.success) {
    issues.push({ code: 'EXERCISE_SCHEMA', message: exercisesResult.error.message });
    return { ok: false, issues };
  }
  const relationsResult = seedRelationArraySchema.safeParse(relationsData);
  if (!relationsResult.success) {
    issues.push({ code: 'RELATION_SCHEMA', message: relationsResult.error.message });
    return { ok: false, issues };
  }

  const exercises = exercisesResult.data as Exercise[];
  const relations = relationsResult.data as ExerciseRelation[];

  const seenIds = new Set<Id>();
  const seenSlugs = new Set<string>();
  for (const ex of exercises) {
    if (seenIds.has(ex.id)) {
      issues.push({ code: 'DUPLICATE_ID', message: `duplicate exercise id: ${ex.id}` });
    }
    seenIds.add(ex.id);
    if (seenSlugs.has(ex.slug)) {
      issues.push({ code: 'DUPLICATE_SLUG', message: `duplicate exercise slug: ${ex.slug}` });
    }
    seenSlugs.add(ex.slug);
    for (const muscle of [...ex.primaryMuscles, ...ex.secondaryMuscles]) {
      if (!isMuscle(muscle)) {
        issues.push({
          code: 'UNKNOWN_MUSCLE',
          message: `${ex.id} references unknown muscle "${muscle}"`,
        });
      }
    }
  }

  for (const rel of relations) {
    if (!seenIds.has(rel.fromId)) {
      issues.push({
        code: 'DANGLING_RELATION',
        message: `relation.fromId not found: ${rel.fromId}`,
      });
    }
    if (!seenIds.has(rel.toId)) {
      issues.push({ code: 'DANGLING_RELATION', message: `relation.toId not found: ${rel.toId}` });
    }
  }

  return { ok: issues.length === 0, issues };
}

export { MUSCLES, isMuscle } from './muscles';
export type { Muscle } from './muscles';
