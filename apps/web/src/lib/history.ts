/**
 * Turns the rows `workouts.getRecent` returns into the `ExerciseSession[]`
 * shape every engine in `@vigor/core` reads (progression §5.1, plateau §5.3,
 * planner §5.4, stats §7.2). One query feeds every engine, instead of one
 * `getExerciseHistory` call per exercise.
 */

import type { ExerciseSession, Id, WorkoutStatus, WorkoutWithExercises } from '@vigor/core';

/** History is what actually happened, so only finished sessions count. */
const DEFAULT_STATUSES: readonly WorkoutStatus[] = ['completed'];

/** Flattens one workout's exercise slots into engine-shaped sessions. */
export function sessionsOf(workout: WorkoutWithExercises): ExerciseSession[] {
  return workout.exercises.map((slot) => ({
    workoutId: workout.id,
    workoutExerciseId: slot.id,
    exerciseId: slot.exerciseId,
    date: workout.date,
    status: workout.status,
    targetRepMin: slot.targetRepMin,
    targetRepMax: slot.targetRepMax,
    targetLoadKg: slot.targetLoadKg,
    sets: slot.sets,
  }));
}

/** Every session of every exercise, newest first, keyed by `exerciseId`. */
export function buildHistoryByExercise(
  workouts: readonly WorkoutWithExercises[],
  statuses: readonly WorkoutStatus[] = DEFAULT_STATUSES,
): Record<Id, ExerciseSession[]> {
  const byExercise: Record<Id, ExerciseSession[]> = {};
  for (const workout of workouts) {
    if (!statuses.includes(workout.status)) continue;
    for (const session of sessionsOf(workout)) {
      (byExercise[session.exerciseId] ??= []).push(session);
    }
  }
  for (const sessions of Object.values(byExercise)) {
    sessions.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  }
  return byExercise;
}

/** The ids of every exercise the user has actually logged work against. */
export function exercisedIds(workouts: readonly WorkoutWithExercises[]): Id[] {
  const ids = new Set<Id>();
  for (const workout of workouts) {
    if (workout.status !== 'completed') continue;
    for (const slot of workout.exercises) {
      if (slot.sets.some((set) => set.completed && !set.isWarmup)) ids.add(slot.exerciseId);
    }
  }
  return [...ids];
}
