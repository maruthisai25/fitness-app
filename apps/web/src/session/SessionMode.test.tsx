/**
 * Session mode component tests — DESIGN.md §10 ("component tests for session
 * mode") against the in-memory database from `@vigor/db/testing`.
 *
 * They cover the three behaviours the flow lives or dies by: a confirmed set is
 * written immediately (§7.2), "can't do this" replaces the exercise through the
 * substitution engine (§5.5), and the finish summary shows the records the PR
 * engine found (§5.7).
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Exercise, Workout } from '@vigor/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addExercise,
  createHarness,
  planFor,
  renderAt,
  TEST_DATE,
  type Harness,
} from '../testing/harness';
import { useSessionStore } from './sessionStore';
import { SessionMode } from './SessionMode';

let harness: Harness;
let squat: Exercise;
let frontSquat: Exercise;
let workout: Workout;

beforeEach(async () => {
  useSessionStore.getState().reset();
  harness = await createHarness();
  squat = await addExercise(harness.repos, { name: 'Back Squat', slug: 'back-squat' });
  frontSquat = await addExercise(harness.repos, {
    name: 'Front Squat',
    slug: 'front-squat',
    difficulty: 3,
  });
  await harness.repos.exercises.addRelation({
    fromId: squat.id,
    toId: frontSquat.id,
    kind: 'substitution',
    note: 'Same pattern, easier on the lower back.',
  });
  workout = await harness.repos.workouts.createPlanned(planFor(squat.id, { sets: 1 }));
});

afterEach(async () => {
  // `globals: false`, so RTL's automatic cleanup is not registered: unmount
  // first, let any in-flight repository read settle, then close the database.
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await harness.db.close();
});

function renderSession(): void {
  renderAt(harness, `/session/${workout.id}`, '/session/:workoutId', <SessionMode />);
}

describe('session mode', () => {
  it('writes the set to the database as soon as it is confirmed', async () => {
    renderSession();
    await screen.findByRole('heading', { name: 'Back Squat' });

    const reps = await screen.findByLabelText('Set 1 reps');
    fireEvent.change(reps, { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Set 1 load in kg'), { target: { value: '62.5' } });
    fireEvent.click(screen.getByRole('button', { name: '8.5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm set 1' }));

    await waitFor(async () => {
      const sets = await harness.repos.sets.listForWorkout(workout.id);
      expect(sets[0].completed).toBe(true);
      expect(sets[0].actualReps).toBe(10);
      // Canonical metric storage — the profile is metric, so 62.5 kg round-trips.
      expect(sets[0].actualLoadKg).toBe(62.5);
      expect(sets[0].rpe).toBe(8.5);
    });
  });

  it('replaces the exercise when the substitution sheet applies a pick', async () => {
    renderSession();
    await screen.findByRole('heading', { name: 'Back Squat' });

    fireEvent.click(screen.getByRole('button', { name: /Can't do this/i }));
    const useIt = await screen.findByRole('button', { name: 'Use Front Squat' });
    fireEvent.click(useIt);

    await waitFor(async () => {
      const slots = await harness.repos.workouts.listExercises(workout.id);
      expect(slots[0].exerciseId).toBe(frontSquat.id);
      expect(slots[0].substitutedFromExerciseId).toBe(squat.id);
    });
  });

  it('celebrates the new personal records the engine found on finish', async () => {
    renderSession();
    await screen.findByRole('heading', { name: 'Back Squat' });

    fireEvent.change(await screen.findByLabelText('Set 1 reps'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Set 1 load in kg'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm set 1' }));

    await waitFor(async () => {
      const sets = await harness.repos.sets.listForWorkout(workout.id);
      expect(sets[0].completed).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finish session' }));

    // Epley: 60 kg × 10 reps → 80 kg estimated 1RM, the first record on file.
    expect(await screen.findByText(/New personal record/i)).toBeTruthy();
    expect(screen.getByText('Back Squat · Estimated 1RM')).toBeTruthy();

    const records = await harness.repos.records.listForExercise(squat.id);
    expect(records.some((record) => record.kind === 'e1rm' && record.value === 80)).toBe(true);
    expect(records.some((record) => record.kind === 'max_load' && record.value === 60)).toBe(true);

    const stored = await harness.repos.workouts.get(workout.id);
    expect(stored?.status).toBe('completed');
    expect(stored?.date).toBe(TEST_DATE);
  });
});

describe('session mode — an imperial profile (DESIGN.md §5.10)', () => {
  it('stores canonical kg and reads the logged load back exactly as typed', async () => {
    await harness.db.close();
    harness = await createHarness({ unitSystem: 'imperial' });
    squat = await addExercise(harness.repos, { name: 'Back Squat', slug: 'back-squat' });
    workout = await harness.repos.workouts.createPlanned(planFor(squat.id, { sets: 1 }));

    renderAt(harness, `/session/${workout.id}`, '/session/:workoutId', <SessionMode />);
    await screen.findByRole('heading', { name: 'Back Squat' });

    fireEvent.change(await screen.findByLabelText('Set 1 reps'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Set 1 load in lb'), { target: { value: '22.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm set 1' }));

    await waitFor(async () => {
      const sets = await harness.repos.sets.listForWorkout(workout.id);
      expect(sets[0].completed).toBe(true);
      // Storage is canonical metric — 22.5 lb is 10.205828 kg.
      expect(sets[0].actualLoadKg).toBeCloseTo(10.205828, 6);
    });

    // …and the confirmed row shows 22.5 lb again, not the 5 lb progression step.
    expect(await screen.findByText(/22\.5 lb/)).toBeTruthy();
    expect(screen.queryByText(/× 25 lb/)).toBeNull();
    expect(screen.queryByText(/× 20 lb/)).toBeNull();
  });
});

describe('session mode — a timed exercise (DESIGN.md §5.1 rule 5)', () => {
  it('labels the count in seconds and never says "reps"', async () => {
    await harness.db.close();
    harness = await createHarness();
    const plank = await addExercise(harness.repos, {
      name: 'Front Plank',
      slug: 'front-plank',
      movementPattern: 'core',
      equipment: ['bodyweight'],
      loadType: 'time',
      defaultRepRange: { min: 30, max: 45 },
    });
    workout = await harness.repos.workouts.createPlanned(
      planFor(plank.id, { sets: 1, loadKg: null, repMin: 30, repMax: 45 }),
    );

    const view = renderAt(
      harness,
      `/session/${workout.id}`,
      '/session/:workoutId',
      <SessionMode />,
    );
    await screen.findByRole('heading', { name: 'Front Plank' });

    expect(screen.getByLabelText('Set 1 seconds')).toBeTruthy();
    // A timed exercise carries no external load, so there is no load box.
    expect(screen.queryByLabelText(/Set 1 load/)).toBeNull();
    expect(view.container.textContent).toContain('30–45 seconds');
    expect(view.container.textContent).not.toMatch(/\breps\b/);
  });
});
