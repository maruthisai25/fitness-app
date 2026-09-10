/**
 * Fixtures for the mobile tests — no React, so a plain repository test can
 * import them without pulling the whole component tree in.
 *
 * DESIGN.md §10 asks for tests against an in-memory `better-sqlite3` driver;
 * `@vigor/db/testing` provides exactly that, so these run the real migrations,
 * the real repositories and the real engines.
 */
import type { Exercise, Id, WorkoutPlan } from '@vigor/core';
import type { Repositories } from '@vigor/db';
import { createTestDatabase } from '@vigor/db/testing';
import type { PlatformAdapters } from '@vigor/platform';

export const TEST_DATE = '2026-09-10';

export const BACK_SQUAT_ID = '0195c0de-0000-7000-8000-00000000ba01';
export const FRONT_SQUAT_ID = '0195c0de-0000-7000-8000-00000000ba02';
export const PLANK_ID = '0195c0de-0000-7000-8000-00000000ba03';

/**
 * Fake adapters: nothing in a test may reach a device API.
 *
 * Plain functions, not spies — this module is shared by the vitest projects
 * and the jest-expo rendering project, so it must not import either runner.
 * A test that needs to assert on a call wraps the one adapter it cares about
 * with its own spy.
 */
export function createFakePlatform(): PlatformAdapters {
  return {
    secureStore: {
      get: async () => null,
      set: async () => undefined,
      remove: async () => undefined,
      isHardwareBacked: () => false,
    },
    fileStore: {
      write: async (ref: string) => ({ ref, mimeType: 'application/json', byteLength: 0 }),
      readBase64: async () => null,
      remove: async () => undefined,
      list: async () => [],
      exists: async () => false,
    },
    notifications: {
      requestPermission: async () => true,
      hasPermission: async () => true,
      schedule: async () => undefined,
      cancel: async () => undefined,
      cancelAll: async () => undefined,
      supportsBackgroundDelivery: () => true,
    },
    network: {
      isOnline: async () => false,
      subscribe: () => () => undefined,
    },
    clock: {
      now: () => `${TEST_DATE}T09:00:00.000Z`,
      today: () => TEST_DATE,
    },
    crypto: {
      encryptJson: async () => {
        throw new Error('crypto is not wired up in component tests');
      },
      decryptJson: async () => {
        throw new Error('crypto is not wired up in component tests');
      },
    } as unknown as PlatformAdapters['crypto'],
  };
}

function exercise(overrides: Partial<Exercise> & Pick<Exercise, 'id' | 'name' | 'slug'>): Exercise {
  return {
    movementPattern: 'squat',
    primaryMuscles: ['quads'],
    secondaryMuscles: ['glutes'],
    equipment: ['barbell'],
    difficulty: 3,
    instructions: 'Brace, sit between your hips, drive the floor away.',
    cues: ['Ribs down'],
    isCustom: false,
    loadType: 'external',
    defaultRepRange: { min: 5, max: 8 },
    archived: false,
    ...overrides,
  };
}

export interface SessionFixture {
  repos: Repositories;
  platform: PlatformAdapters;
  close: () => Promise<void>;
  workoutId: Id;
  workoutExerciseId: Id;
  setIds: Id[];
}

/**
 * A migrated database with a profile, a barbell, three exercises and one
 * planned two-set squat session ready for session mode.
 */
export async function createSessionFixture(): Promise<SessionFixture> {
  const db = await createTestDatabase();
  const repos = db.repos;

  await repos.profile.save({
    displayName: 'Test athlete',
    unitSystem: 'metric',
    trainingLocation: 'gym',
    preferredDurationMin: 45,
    fitnessLevel: 'intermediate',
  });
  await repos.equipment.create({ name: 'Barbell', category: 'barbell', available: true });
  await repos.goals.create({ type: 'strength', priority: 1, active: true });

  await repos.exercises.createMany([
    exercise({ id: BACK_SQUAT_ID, name: 'Back squat', slug: 'back-squat' }),
    exercise({ id: FRONT_SQUAT_ID, name: 'Front squat', slug: 'front-squat', difficulty: 4 }),
    exercise({
      id: PLANK_ID,
      name: 'Plank',
      slug: 'plank',
      movementPattern: 'core',
      equipment: ['bodyweight'],
      loadType: 'time',
      primaryMuscles: ['abs'],
      defaultRepRange: { min: 30, max: 60 },
    }),
  ]);
  await repos.exercises.addRelations([
    { fromId: BACK_SQUAT_ID, toId: FRONT_SQUAT_ID, kind: 'substitution', note: null },
  ]);

  const plan: WorkoutPlan = {
    date: TEST_DATE,
    title: 'Lower body — squat focus',
    focus: ['quads'],
    plannedDurationMin: 40,
    source: 'rule',
    readinessId: null,
    notes: null,
    rationale: {
      codes: ['RULE_BASED_PLAN'],
      facts: { exerciseIds: [BACK_SQUAT_ID] },
      summary: 'Squat led today because it was the least recently trained pattern.',
    },
    exercises: [
      {
        exerciseId: BACK_SQUAT_ID,
        order: 0,
        targetSets: 2,
        targetRepMin: 5,
        targetRepMax: 8,
        targetLoadKg: 60,
        restSec: 120,
        tempo: null,
        substitutedFromExerciseId: null,
        // A planned slot normally carries the engine's decision — that is what
        // the "Why?" disclosure on the exercise card reads (DESIGN.md §2.3).
        progressionDecision: {
          exerciseId: BACK_SQUAT_ID,
          action: 'hold_load',
          targetLoadKg: 60,
          targetRepMin: 5,
          targetRepMax: 8,
          targetSets: 2,
          restSec: 120,
          suggestedExerciseId: null,
          loadDeltaKg: 0,
          rationale: {
            codes: ['HOLD_BUILD_REPS'],
            facts: { targetReps: 5 },
            summary: 'Holding the load and building reps toward the top of the range.',
          },
        },
        notes: null,
      },
    ],
  };

  const workout = await repos.workouts.createPlanned(plan);
  const slots = await repos.workouts.listExercises(workout.id);

  return {
    repos,
    platform: createFakePlatform(),
    close: db.close,
    workoutId: workout.id,
    workoutExerciseId: slots[0].id,
    setIds: slots[0].sets.map((set) => set.id),
  };
}
