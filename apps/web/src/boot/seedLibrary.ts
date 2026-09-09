/**
 * First-run seeding of the exercise library — DESIGN.md §9 phase 0/1: the
 * `exercises` and `exercise_relations` tables are populated from
 * `@vigor/library` after migrations.
 *
 * The two tables are written in two transactions, so a boot that is killed
 * between them leaves the exercises in place and the relation graph empty —
 * and an empty graph silently costs the substitution engine its explicit
 * `substitution` signal (§5.5) and makes `PROGRESS_VARIATION` unreachable
 * (§5.1 rule 5). Both writes are therefore checked separately and both are
 * idempotent (`createMany` skips existing slugs, `addRelations` ignores
 * duplicates), so a partially seeded database really does heal itself on the
 * next boot.
 */

import type { Repositories } from '@vigor/db';
import { loadSeed } from '@vigor/library';

export interface SeedResult {
  /** True when this boot inserted exercises, relations, or both. */
  seeded: boolean;
  exercises: number;
  relations: number;
}

/** Populates whichever half of the library is missing. */
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
