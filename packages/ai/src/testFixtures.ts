/**
 * Test-only fixtures: a migrated in-memory database with a believable profile,
 * equipment, a small exercise library and real logged history, plus a
 * `CoachDeps` over it.
 *
 * Not exported from `src/index.ts` — it pulls in `@vigor/db/testing`, which
 * depends on a Node-only binding and must never reach an app bundle.
 */

import type { Exercise, Id, LocalDate } from '@vigor/core';
import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';

import { createCoachDeps, type CoachClock, type CoachDeps } from './deps';
import { createCoachTools, findCoachTool, type CoachTool, type CoachToolName } from './tools';

export const TEST_TODAY: LocalDate = '2026-09-10';

/** A clock pinned to {@link TEST_TODAY} with strictly increasing instants. */
export function createFixedClock(today: LocalDate = TEST_TODAY): CoachClock {
  let tick = 0;
  return {
    now: () => {
      tick += 1;
      return new Date(Date.parse(`${today}T06:00:00.000Z`) + tick * 1000).toISOString();
    },
    today: () => today,
  };
}

export interface AiTestEnv {
  db: TestDatabase;
  deps: CoachDeps;
  exercises: Record<string, Exercise>;
  today: LocalDate;
  close(): Promise<void>;
}

const LIBRARY: {
  key: string;
  name: string;
  slug: string;
  pattern: Exercise['movementPattern'];
  equipment: Exercise['equipment'];
  primary: string[];
  difficulty: Exercise['difficulty'];
  loadType: Exercise['loadType'];
  repRange: { min: number; max: number };
}[] = [
  {
    key: 'bench',
    name: 'Barbell Bench Press',
    slug: 'barbell-bench-press',
    pattern: 'horizontal_push',
    equipment: ['barbell'],
    primary: ['chest', 'triceps'],
    difficulty: 3,
    loadType: 'external',
    repRange: { min: 6, max: 10 },
  },
  {
    key: 'dbBench',
    name: 'Dumbbell Bench Press',
    slug: 'dumbbell-bench-press',
    pattern: 'horizontal_push',
    equipment: ['dumbbell'],
    primary: ['chest', 'triceps'],
    difficulty: 2,
    loadType: 'external',
    repRange: { min: 8, max: 12 },
  },
  {
    key: 'pushup',
    name: 'Push-up',
    slug: 'push-up',
    pattern: 'horizontal_push',
    equipment: ['bodyweight'],
    primary: ['chest', 'triceps'],
    difficulty: 2,
    loadType: 'bodyweight',
    repRange: { min: 8, max: 15 },
  },
  {
    key: 'row',
    name: 'Barbell Row',
    slug: 'barbell-row',
    pattern: 'horizontal_pull',
    equipment: ['barbell'],
    primary: ['back', 'biceps'],
    difficulty: 3,
    loadType: 'external',
    repRange: { min: 6, max: 10 },
  },
  {
    key: 'squat',
    name: 'Barbell Back Squat',
    slug: 'barbell-back-squat',
    pattern: 'squat',
    equipment: ['barbell'],
    primary: ['quads', 'glutes'],
    difficulty: 4,
    loadType: 'external',
    repRange: { min: 5, max: 8 },
  },
];

/** A migrated database with a profile, kit, five exercises and a clock. */
export async function createAiTestEnv(today: LocalDate = TEST_TODAY): Promise<AiTestEnv> {
  // The database clock and the coach clock share a start instant, so anything
  // that compares a stored `updatedAt` against "now" — the job queue's backoff,
  // above all — behaves the way it does in the app.
  const db = await createTestDatabase({ start: `${today}T06:00:00.000Z` });
  const { repos } = db;

  await repos.profile.save({
    displayName: 'Ravi',
    fitnessLevel: 'intermediate',
    trainingExperienceMonths: 30,
    preferredDurationMin: 45,
    preferredStyles: ['strength', 'hypertrophy'],
    trainingLocation: 'gym',
    unitSystem: 'metric',
    foodRegion: 'IN',
    activityLevel: 'moderate',
    heightCm: 176,
    weightKg: 74,
  });
  await repos.goals.create({ type: 'hypertrophy', priority: 1, targetNote: 'More size across the back' });
  await repos.goals.create({ type: 'consistency', priority: 2 });
  await repos.equipment.create({ name: 'Barbell and plates', category: 'barbell', available: true, loadIncrementKg: 2.5 });
  await repos.equipment.create({ name: 'Dumbbells', category: 'dumbbell', available: true, loadIncrementKg: 2 });

  const exercises: Record<string, Exercise> = {};
  for (const entry of LIBRARY) {
    const created = await repos.exercises.create({
      name: entry.name,
      slug: entry.slug,
      movementPattern: entry.pattern,
      equipment: entry.equipment,
      primaryMuscles: entry.primary,
      secondaryMuscles: [],
      difficulty: entry.difficulty,
      loadType: entry.loadType,
      defaultRepRange: entry.repRange,
      instructions: `${entry.name}: brace, move under control, finish the rep.`,
      cues: ['Brace before the rep', 'Full range'],
    });
    exercises[entry.key] = created;
  }
  await repos.exercises.addRelation({
    fromId: exercises.bench.id,
    toId: exercises.dbBench.id,
    kind: 'substitution',
    note: 'Same pattern, lighter setup',
  });

  const deps = createCoachDeps({ repos, clock: createFixedClock(today) });
  return { db, deps, exercises, today, close: () => db.close() };
}

/** The named tool, built over this environment's deps. */
export function toolFor(env: AiTestEnv, name: CoachToolName): CoachTool {
  return findCoachTool(createCoachTools(env.deps), name);
}

/** Validates the input the way the runner does, runs the tool, parses the JSON. */
export async function runTool(
  tool: CoachTool,
  input: unknown,
): Promise<Record<string, unknown>> {
  const parsed = tool.parse(input);
  const result = await tool.run(parsed);
  return JSON.parse(typeof result === 'string' ? result : JSON.stringify(result)) as Record<
    string,
    unknown
  >;
}

export interface LogSessionOptions {
  exerciseId: Id;
  date: LocalDate;
  loadKg: number | null;
  /** One entry per working set. */
  reps: number[];
  rpe?: number | null;
  targetRepMin?: number;
  targetRepMax?: number;
}

/** Writes one completed session so the progression engine has real history. */
export async function logSession(env: AiTestEnv, options: LogSessionOptions): Promise<Id> {
  const { repos } = env.db;
  const workout = await repos.workouts.create({
    date: options.date,
    title: 'Logged session',
    status: 'completed',
    source: 'manual',
    plannedDurationMin: 45,
  });
  const entry = await repos.workouts.addExercise(workout.id, {
    exerciseId: options.exerciseId,
    order: 0,
    targetSets: options.reps.length,
    targetRepMin: options.targetRepMin ?? 6,
    targetRepMax: options.targetRepMax ?? 10,
    targetLoadKg: options.loadKg,
    restSec: 120,
  });
  for (const [index, reps] of options.reps.entries()) {
    const set = await repos.sets.add(entry.id, {
      setIndex: index,
      targetReps: options.targetRepMax ?? 10,
      isWarmup: false,
    });
    await repos.sets.record(set.id, {
      actualReps: reps,
      actualLoadKg: options.loadKg,
      rpe: options.rpe ?? null,
    });
  }
  return workout.id;
}
