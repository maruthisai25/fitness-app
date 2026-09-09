/**
 * Every route this app can be sent to, in one place.
 *
 * Screens (and, from phase 2, the coach UI) navigate through
 * `useVigorNavigation()` rather than spelling a path inline, so a route rename
 * is a one-line change here.
 */
import type { Id, LocalDate } from '@vigor/core';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';

export const routes = {
  today: '/',
  train: '/train',
  library: '/train/library',
  customExercise: '/train/custom-exercise',
  history: '/train/history',
  builder: '/train/builder',
  /** Full-screen session flow — DESIGN.md §7.1. */
  session: (workoutId: Id) => `/session/${workoutId}`,
  exercise: (exerciseId: Id) => `/train/exercise/${exerciseId}`,
  workout: (workoutId: Id) => `/train/workout/${workoutId}`,
  builderFor: (date: LocalDate) => `/train/builder?date=${date}`,
} as const;

export interface VigorNavigation {
  /** Opens session mode for a planned or in-progress workout. */
  openSession: (workoutId: Id) => void;
  /** Opens the exercise detail screen: instructions, history, chart, PRs. */
  openExercise: (exerciseId: Id) => void;
  openWorkout: (workoutId: Id) => void;
  openLibrary: () => void;
  openCustomExercise: () => void;
  openHistory: () => void;
  openBuilder: (date?: LocalDate) => void;
  openToday: () => void;
}

export function useVigorNavigation(): VigorNavigation {
  const router = useRouter();
  return useMemo(
    () => ({
      openSession: (workoutId) => router.push(routes.session(workoutId)),
      openExercise: (exerciseId) => router.push(routes.exercise(exerciseId)),
      openWorkout: (workoutId) => router.push(routes.workout(workoutId)),
      openLibrary: () => router.push(routes.library),
      openCustomExercise: () => router.push(routes.customExercise),
      openHistory: () => router.push(routes.history),
      openBuilder: (date) => router.push(date ? routes.builderFor(date) : routes.builder),
      openToday: () => router.replace(routes.today),
    }),
    [router],
  );
}
