/**
 * The writes session mode performs, tested without rendering.
 *
 * The component test in `session.test.tsx` drives the same paths through the
 * screen; this file pins the behaviour the screen depends on: a confirmed set
 * lands in `sets` immediately (DESIGN.md §7.2), "can't do this" ranks through
 * the substitution engine (§5.5), and finishing writes what the records engine
 * found (§5.7).
 */
import { describe, expect, it } from 'vitest';

import { createTestDatabase } from '@vigor/db/testing';

import { seedExerciseLibrary } from '../src/db/seed';
import {
  applySubstitution,
  finishSession,
  loadSession,
  rankSubstitutes,
} from '../src/session/sessionData';
import {
  BACK_SQUAT_ID,
  FRONT_SQUAT_ID,
  PLANK_ID,
  TEST_DATE,
  createSessionFixture,
} from './fixtures';

describe('session writes', () => {
  it('loads the session with its slots and previous-session targets', async () => {
    const fixture = await createSessionFixture();
    try {
      const view = await loadSession(fixture.repos, fixture.workoutId);
      expect(view?.workout.title).toBe('Lower body — squat focus');
      expect(view?.exercises).toHaveLength(1);
      expect(view?.exercises[0].exercise?.name).toBe('Back squat');
      expect(view?.exercises[0].sets).toHaveLength(2);
      expect(view?.exercises[0].sets[0].lastReps).toBeNull();
      expect(view?.safetyActive).toBe(false);
    } finally {
      await fixture.close();
    }
  });

  it('records a confirmed set straight away', async () => {
    const fixture = await createSessionFixture();
    try {
      await fixture.repos.sets.record(fixture.setIds[0], {
        actualReps: 8,
        actualLoadKg: 62.5,
        rpe: 8,
        notes: null,
      });
      const rows = await fixture.repos.sets.listForWorkoutExercise(fixture.workoutExerciseId);
      expect(rows[0].completed).toBe(true);
      expect(rows[0].actualReps).toBe(8);
      expect(rows[0].actualLoadKg).toBe(62.5);
      expect(rows[0].completedAt).not.toBeNull();
      expect(rows[1].completed).toBe(false);
    } finally {
      await fixture.close();
    }
  });

  it('ranks the explicit substitution first', async () => {
    const fixture = await createSessionFixture();
    try {
      const offer = await rankSubstitutes(fixture.repos, {
        exerciseId: BACK_SQUAT_ID,
        reason: 'equipment_unavailable',
        excludeExerciseIds: [BACK_SQUAT_ID],
      });
      expect(offer.candidates[0]?.exerciseId).toBe(FRONT_SQUAT_ID);
      expect(offer.rationale.codes).toContain('SUBSTITUTION_RANKED');
    } finally {
      await fixture.close();
    }
  });

  it('re-derives the slot from the replacement, never carrying the old load across', async () => {
    const fixture = await createSessionFixture();
    try {
      // The planned slot is a 60 kg barbell back squat. Swapping in a plank —
      // a bodyweight, time-based exercise with no history — must not leave
      // 60 kg on the row: session mode falls back to `targetLoadKg` when the
      // load box is empty, so the number would be logged against the plank.
      const updated = await applySubstitution(fixture.repos, {
        workoutExerciseId: fixture.workoutExerciseId,
        toExerciseId: PLANK_ID,
        today: TEST_DATE,
      });

      expect(updated.exerciseId).toBe(PLANK_ID);
      expect(updated.substitutedFromExerciseId).toBe(BACK_SQUAT_ID);
      expect(updated.targetLoadKg).toBeNull();
      // The rationale on the row now describes the plank, not the squat.
      expect(updated.progressionDecision?.exerciseId).toBe(PLANK_ID);
      expect(updated.progressionDecision?.rationale.summary.length).toBeGreaterThan(0);

      const rows = await fixture.repos.sets.listForWorkoutExercise(fixture.workoutExerciseId);
      expect(rows.every((row) => row.targetReps === updated.targetRepMin)).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it('keeps a set that is already logged when the slot is swapped', async () => {
    const fixture = await createSessionFixture();
    try {
      await fixture.repos.sets.record(fixture.setIds[0], {
        actualReps: 5,
        actualLoadKg: 60,
        rpe: 8,
        notes: null,
      });
      await applySubstitution(fixture.repos, {
        workoutExerciseId: fixture.workoutExerciseId,
        toExerciseId: FRONT_SQUAT_ID,
        today: TEST_DATE,
      });

      const rows = await fixture.repos.sets.listForWorkoutExercise(fixture.workoutExerciseId);
      expect(rows[0].completed).toBe(true);
      expect(rows[0].actualLoadKg).toBe(60);
      expect(rows[0].targetReps).toBe(5);
    } finally {
      await fixture.close();
    }
  });

  it('writes the records the engine found when the session finishes', async () => {
    const fixture = await createSessionFixture();
    try {
      for (const setId of fixture.setIds) {
        await fixture.repos.sets.record(setId, {
          actualReps: 8,
          actualLoadKg: 60,
          rpe: 8,
          notes: null,
        });
      }
      await fixture.repos.workouts.start(fixture.workoutId);

      const summary = await finishSession(fixture.repos, {
        workoutId: fixture.workoutId,
        status: 'completed',
        unitSystem: 'metric',
      });

      expect(summary.totalSets).toBe(2);
      expect(summary.totalVolumeKg).toBe(960);
      expect(summary.celebrated.map((record) => record.kind).sort()).toEqual([
        'e1rm',
        'max_load',
      ]);
      expect(summary.quiet.some((record) => record.kind === 'session_volume')).toBe(true);

      const stored = await fixture.repos.records.listForExercise(BACK_SQUAT_ID);
      expect(stored.map((record) => record.kind).sort()).toEqual([
        'e1rm',
        'max_load',
        'max_reps_at_load',
        'session_volume',
      ]);
      expect(stored.every((record) => record.date === TEST_DATE)).toBe(true);

      const workout = await fixture.repos.workouts.get(fixture.workoutId);
      expect(workout?.status).toBe('completed');
      expect(workout?.finishedAt).not.toBeNull();
    } finally {
      await fixture.close();
    }
  });
});

describe('first-run seeding', () => {
  it('fills the library once and then leaves it alone', async () => {
    const db = await createTestDatabase();
    try {
      const first = await seedExerciseLibrary(db.repos);
      expect(first.seeded).toBe(true);
      expect(first.exercises).toBeGreaterThanOrEqual(200);
      expect(first.relations).toBeGreaterThan(0);

      const relations = await db.repos.exercises.listRelations();
      expect(relations.length).toBe(first.relations);
      // The seed keeps its own ids, so the relation graph still resolves.
      expect(await db.repos.exercises.get(relations[0].fromId)).not.toBeNull();
      expect(await db.repos.exercises.get(relations[0].toId)).not.toBeNull();

      const second = await seedExerciseLibrary(db.repos);
      expect(second.seeded).toBe(false);
      expect(second.exercises).toBe(first.exercises);
    } finally {
      await db.close();
    }
  });
});
