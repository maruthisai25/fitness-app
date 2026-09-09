/**
 * First-run seeding of the exercise library — DESIGN.md §4.1 (`exercises`,
 * `exercise_relations`), §9 phase 0 ("`library` seed (≥ 200 exercises)").
 *
 * Runs once, straight after `migrate(driver)`, writing the checked-in seed from
 * `@vigor/library` ids and all, so the relation graph the substitution engine
 * walks (DESIGN.md §5.5) keeps pointing at the right rows.
 *
 * The exercises and the relations are two separate transactions. On mobile the
 * OS can kill the app between them — the exercises would be there, the relation
 * graph empty, and every later boot would see 224 rows and skip. So each table
 * is checked on its own; both writes ignore rows that already exist.
 */
import type { Repositories } from '@vigor/db';
import { loadSeed } from '@vigor/library';

export interface SeedResult {
  /** True when this boot inserted exercises, relations, or both. */
  seeded: boolean;
  exercises: number;
  relations: number;
}

/** Populates whichever half of the library is missing. Idempotent. */
export async function seedExerciseLibrary(repos: Repositories): Promise<SeedResult> {
  const [existing, existingRelations] = await Promise.all([
    repos.exercises.list({ includeArchived: true }),
    repos.exercises.listRelations(),
  ]);

  const needsExercises = existing.length === 0;
  const needsRelations = existingRelations.length === 0;
  if (!needsExercises && !needsRelations) {
    return { seeded: false, exercises: existing.length, relations: existingRelations.length };
  }

  const { exercises, relations } = loadSeed();
  const insertedExercises = needsExercises
    ? (await repos.exercises.createMany(exercises)).length
    : existing.length;
  if (needsRelations) await repos.exercises.addRelations(relations);

  return {
    seeded: true,
    exercises: insertedExercises,
    relations: needsRelations ? relations.length : existingRelations.length,
  };
}
