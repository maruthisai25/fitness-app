import type { Rationale, WorkoutPlan } from '@vigor/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '../testing';

const RATIONALE: Rationale = {
  codes: ['PROGRESS_LOAD'],
  facts: { lastLoadKg: 20, topOfRange: 12 },
  summary: 'Every working set hit the top of the range at RPE 8, so the load goes up.',
};

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
});

afterEach(async () => {
  await db.close();
});

async function seedExercise(slug: string) {
  return db.repos.exercises.create({
    name: slug.replace(/-/g, ' '),
    slug,
    movementPattern: 'horizontal_push',
    primaryMuscles: ['chest'],
    equipment: ['dumbbell'],
    loadType: 'external',
  });
}

function planFor(exerciseId: string, date: string): WorkoutPlan {
  return {
    date,
    title: 'Upper A',
    focus: ['chest', 'back'],
    plannedDurationMin: 45,
    source: 'rule',
    readinessId: null,
    notes: null,
    rationale: RATIONALE,
    exercises: [
      {
        exerciseId,
        order: 0,
        targetSets: 3,
        targetRepMin: 8,
        targetRepMax: 12,
        targetLoadKg: 20,
        restSec: 90,
        tempo: null,
        substitutedFromExerciseId: null,
        progressionDecision: null,
        notes: null,
      },
    ],
  };
}

describe('workouts.createPlanned', () => {
  it('writes the workout, its exercises and one set row per target set', async () => {
    const exercise = await seedExercise('db-press');
    const workout = await db.repos.workouts.createPlanned(planFor(exercise.id, '2026-03-02'));

    expect(workout.status).toBe('planned');
    expect(workout.source).toBe('rule');
    expect(workout.rationale).toEqual(RATIONALE);

    const full = await db.repos.workouts.getWithExercises(workout.id);
    expect(full?.exercises).toHaveLength(1);
    const slot = full?.exercises[0];
    expect(slot?.targetLoadKg).toBe(20);
    expect(slot?.sets).toHaveLength(3);
    expect(slot?.sets.map((set) => set.setIndex)).toEqual([0, 1, 2]);
    // Double progression targets the bottom of the range first (DESIGN.md §5.1).
    expect(slot?.sets.every((set) => set.targetReps === 8)).toBe(true);
    expect(slot?.sets.every((set) => !set.completed)).toBe(true);
  });

  it('rejects a plan that does not satisfy the core schema', async () => {
    const exercise = await seedExercise('db-row');
    const plan = planFor(exercise.id, 'the second of March');
    await expect(db.repos.workouts.createPlanned(plan)).rejects.toThrow();
  });

  it('renumbers exercise order from zero', async () => {
    const first = await seedExercise('db-fly');
    const second = await seedExercise('db-curl');
    const plan = planFor(first.id, '2026-03-03');
    const slot = plan.exercises[0]!;
    plan.exercises = [
      { ...slot, order: 7 },
      { ...slot, exerciseId: second.id, order: 3 },
    ];

    const workout = await db.repos.workouts.createPlanned(plan);
    const full = await db.repos.workouts.getWithExercises(workout.id);
    expect(full?.exercises.map((row) => row.order)).toEqual([0, 1]);
    expect(full?.exercises.map((row) => row.exerciseId)).toEqual([second.id, first.id]);
  });
});

describe('workouts CRUD', () => {
  it('creates, reads back and updates a workout', async () => {
    const created = await db.repos.workouts.create({ date: '2026-03-04', title: 'Legs' });
    expect(created.status).toBe('planned');

    const read = await db.repos.workouts.get(created.id);
    expect(read).toEqual(created);

    const started = await db.repos.workouts.start(created.id);
    expect(started.status).toBe('in_progress');
    expect(started.startedAt).not.toBeNull();

    const finished = await db.repos.workouts.finish(created.id);
    expect(finished.status).toBe('completed');
    expect(finished.finishedAt).not.toBeNull();
    // `start` must not be undone by `finish`.
    expect(finished.startedAt).toBe(started.startedAt);
  });

  it('appends exercises in order and reorders them', async () => {
    const workout = await db.repos.workouts.create({ date: '2026-03-05', title: 'Push' });
    const press = await seedExercise('bb-bench');
    const dip = await seedExercise('bw-dip');

    const first = await db.repos.workouts.addExercise(workout.id, { exerciseId: press.id });
    const second = await db.repos.workouts.addExercise(workout.id, { exerciseId: dip.id });
    expect([first.order, second.order]).toEqual([0, 1]);

    const reordered = await db.repos.workouts.reorderExercises(workout.id, [second.id, first.id]);
    expect(reordered.map((row) => row.exerciseId)).toEqual([dip.id, press.id]);
  });

  it('deletes a workout together with its exercises and sets', async () => {
    const exercise = await seedExercise('db-pullover');
    const workout = await db.repos.workouts.createPlanned(planFor(exercise.id, '2026-03-06'));

    await db.repos.workouts.remove(workout.id);

    expect(await db.repos.workouts.get(workout.id)).toBeNull();
    expect(await db.repos.workouts.listExercises(workout.id)).toEqual([]);
    expect(await db.repos.sets.listForWorkout(workout.id)).toEqual([]);
  });

  it('returns the inclusive window ending today for getRecent', async () => {
    for (const date of ['2026-03-01', '2026-03-05', '2026-03-07']) {
      await db.repos.workouts.create({ date, title: `Session ${date}` });
    }

    const recent = await db.repos.workouts.getRecent({ days: 3, today: '2026-03-07' });
    expect(recent.map((row) => row.date)).toEqual(['2026-03-07', '2026-03-05']);
  });
});

describe('workouts.getExerciseHistory', () => {
  it('returns completed sessions newest first with sets in set order', async () => {
    const exercise = await seedExercise('db-incline-press');

    for (const date of ['2026-04-01', '2026-04-08', '2026-04-15']) {
      const workout = await db.repos.workouts.createPlanned(planFor(exercise.id, date));
      const [slot] = await db.repos.workouts.listExercises(workout.id);
      for (const set of slot!.sets) {
        await db.repos.sets.record(set.id, { actualReps: 10, actualLoadKg: 20, rpe: 8 });
      }
      await db.repos.workouts.finish(workout.id);
    }

    const history = await db.repos.workouts.getExerciseHistory(exercise.id);

    expect(history.map((session) => session.date)).toEqual([
      '2026-04-15',
      '2026-04-08',
      '2026-04-01',
    ]);
    expect(history.every((session) => session.status === 'completed')).toBe(true);
    for (const session of history) {
      expect(session.exerciseId).toBe(exercise.id);
      expect(session.sets.map((set) => set.setIndex)).toEqual([0, 1, 2]);
      expect(session.sets.every((set) => set.actualLoadKg === 20)).toBe(true);
    }
  });

  it('honours the limit and keeps the newest sessions', async () => {
    const exercise = await seedExercise('bb-squat');
    for (const date of ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04']) {
      const workout = await db.repos.workouts.createPlanned(planFor(exercise.id, date));
      await db.repos.workouts.finish(workout.id);
    }

    const history = await db.repos.workouts.getExerciseHistory(exercise.id, { limit: 2 });
    expect(history.map((session) => session.date)).toEqual(['2026-05-04', '2026-05-03']);
  });

  it('excludes planned and skipped sessions by default', async () => {
    const exercise = await seedExercise('bb-deadlift');
    const done = await db.repos.workouts.createPlanned(planFor(exercise.id, '2026-06-01'));
    await db.repos.workouts.finish(done.id);
    const skipped = await db.repos.workouts.createPlanned(planFor(exercise.id, '2026-06-02'));
    await db.repos.workouts.setStatus(skipped.id, 'skipped');
    await db.repos.workouts.createPlanned(planFor(exercise.id, '2026-06-03'));

    const history = await db.repos.workouts.getExerciseHistory(exercise.id);
    expect(history.map((session) => session.date)).toEqual(['2026-06-01']);

    const withPlanned = await db.repos.workouts.getExerciseHistory(exercise.id, {
      statuses: ['completed', 'planned', 'skipped'],
    });
    expect(withPlanned.map((session) => session.date)).toEqual([
      '2026-06-03',
      '2026-06-02',
      '2026-06-01',
    ]);
  });
});

describe('sets.record', () => {
  it('stores the result and marks the set completed', async () => {
    const exercise = await seedExercise('db-lateral-raise');
    const workout = await db.repos.workouts.createPlanned(planFor(exercise.id, '2026-07-01'));
    const [slot] = await db.repos.workouts.listExercises(workout.id);
    const target = slot!.sets[0]!;

    const recorded = await db.repos.sets.record(target.id, {
      actualReps: 12,
      actualLoadKg: 22.5,
      rpe: 8.5,
      notes: 'felt easy',
    });

    expect(recorded.completed).toBe(true);
    expect(recorded.actualReps).toBe(12);
    expect(recorded.actualLoadKg).toBe(22.5);
    expect(recorded.rpe).toBe(8.5);
    expect(recorded.notes).toBe('felt easy');
    expect(recorded.completedAt).not.toBeNull();

    const reread = await db.repos.sets.get(target.id);
    expect(reread).toEqual(recorded);

    const cleared = await db.repos.sets.clearResult(target.id);
    expect(cleared.completed).toBe(false);
    expect(cleared.actualReps).toBeNull();
    expect(cleared.completedAt).toBeNull();
  });

  it('appends an extra set after the planned ones', async () => {
    const exercise = await seedExercise('db-hammer-curl');
    const workout = await db.repos.workouts.createPlanned(planFor(exercise.id, '2026-07-02'));
    const [slot] = await db.repos.workouts.listExercises(workout.id);

    const extra = await db.repos.sets.add(slot!.id, { targetReps: 8 });
    expect(extra.setIndex).toBe(3);

    const all = await db.repos.sets.listForWorkoutExercise(slot!.id);
    expect(all.map((set) => set.setIndex)).toEqual([0, 1, 2, 3]);
  });
});
