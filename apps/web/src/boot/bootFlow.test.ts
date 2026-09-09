/**
 * The offline path a first run takes: seed the library, plan a session with the
 * rule-based planner, and read it back on Today — DESIGN.md §9 phases 1 and 3.
 * No network, no model, real repositories.
 */

import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadToday } from '../today/useTodayView';
import { planAndSaveWorkout } from '../today/plan';
import { seedExerciseLibrary } from './seedLibrary';

const DATE = '2026-09-10';

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
});

afterEach(async () => {
  await db.close();
});

describe('first run', () => {
  it('seeds the exercise library once', async () => {
    const first = await seedExerciseLibrary(db.repos);
    expect(first.seeded).toBe(true);
    expect(first.exercises).toBeGreaterThanOrEqual(200);
    expect(first.relations).toBeGreaterThan(0);

    const second = await seedExerciseLibrary(db.repos);
    expect(second.seeded).toBe(false);
    expect(await db.repos.exercises.list()).toHaveLength(first.exercises);
  });

  it('re-seeds the relation graph when a previous boot died between the two writes', async () => {
    // The exercises and the relations are separate transactions, so this state
    // is reachable: 224 rows, no relations. Skipping it would leave the
    // substitution engine without its explicit-substitution signal forever.
    const { exercises } = await import('@vigor/library').then((module) => module.loadSeed());
    await db.repos.exercises.createMany(exercises);
    expect(await db.repos.exercises.listRelations()).toHaveLength(0);

    const healed = await seedExerciseLibrary(db.repos);
    expect(healed.seeded).toBe(true);
    expect(healed.relations).toBeGreaterThan(0);
    expect(await db.repos.exercises.listRelations()).not.toHaveLength(0);
    // No duplicated exercises.
    expect(await db.repos.exercises.list()).toHaveLength(exercises.length);
  });

  it('plans today offline and shows it on Today', async () => {
    await seedExerciseLibrary(db.repos);
    await db.repos.profile.save({ displayName: 'You', trainingLocation: 'gym' });
    await db.repos.goals.create({ type: 'hypertrophy', priority: 1 });
    for (const category of ['barbell', 'dumbbell', 'bodyweight'] as const) {
      await db.repos.equipment.create({ name: category, category, available: true });
    }

    const workout = await planAndSaveWorkout(db.repos, { date: DATE });
    expect(workout.status).toBe('planned');
    expect(workout.source).toBe('rule');

    const stored = await db.repos.workouts.getWithExercises(workout.id);
    expect(stored?.exercises.length).toBeGreaterThan(0);
    // `createPlanned` writes one `sets` row per target set (DESIGN.md §4.2).
    expect(stored?.exercises[0].sets.length).toBe(stored?.exercises[0].targetSets);

    const today = await loadToday(db.repos, DATE);
    expect(today.view.workout.state).toBe('planned');
    expect(today.view.workout.workoutId).toBe(workout.id);
    expect(today.view.safetyActive).toBe(false);
    expect(today.deload.recommended).toBe(false);
  });

  it('holds the plan while a safety event is open', async () => {
    await seedExerciseLibrary(db.repos);
    await db.repos.profile.save({ displayName: 'You', trainingLocation: 'gym' });
    await db.repos.equipment.create({ name: 'Barbell', category: 'barbell', available: true });
    await db.repos.safety.create({
      date: DATE,
      kind: 'pain',
      text: 'Left knee complained on the way down.',
      source: 'readiness',
    });

    const workout = await planAndSaveWorkout(db.repos, { date: DATE });
    expect(workout.rationale?.codes).toContain('SAFETY_HOLD');

    const today = await loadToday(db.repos, DATE);
    expect(today.view.safetyActive).toBe(true);
    expect(today.view.safetyEvents).toHaveLength(1);
  });
});
