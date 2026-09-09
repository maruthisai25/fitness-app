/**
 * Queries for the Progress tab. Keys and invalidations come from
 * `@vigor/core/queries` (DESIGN.md §7.2); the numbers come from the view-model
 * builders, never from a component.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  addDays,
  queryKeys,
  type BodyMetric,
  type Exercise,
  type ExerciseSession,
  type Id,
  type Insight,
  type LocalDate,
  type PersonalRecord,
  type ProgressPhoto,
  type WeeklyReview,
  type WorkoutWithExercises,
} from '@vigor/core';

import { useDb } from '../db/provider';

/** How far back the Progress charts look by default. */
export const PROGRESS_WINDOW_DAYS = 180;

export function useRecentWorkouts(days = PROGRESS_WINDOW_DAYS): UseQueryResult<WorkoutWithExercises[]> {
  const { repos } = useDb();
  return useQuery({
    queryKey: queryKeys.workoutsRecent(days),
    queryFn: () => repos.workouts.getRecent({ days }),
  });
}

/**
 * The exercises the user has actually trained in the window — a picker over the
 * whole 224-exercise library would bury them.
 */
export function useTrainedExercises(days = PROGRESS_WINDOW_DAYS): UseQueryResult<Exercise[]> {
  const { repos } = useDb();
  return useQuery({
    queryKey: [...queryKeys.exercises(), 'trained', days],
    queryFn: async () => {
      const workouts = await repos.workouts.getRecent({ days });
      const ids = new Set<Id>();
      for (const workout of workouts) {
        for (const slot of workout.exercises) {
          if (slot.sets.some((set) => set.completed && !set.isWarmup)) ids.add(slot.exerciseId);
        }
      }
      const exercises = await repos.exercises.getMany([...ids]);
      return exercises.sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export function useExerciseHistory(exerciseId: Id | null): UseQueryResult<ExerciseSession[]> {
  const { repos } = useDb();
  return useQuery({
    queryKey: queryKeys.exerciseHistory(exerciseId ?? 'none', 100),
    enabled: exerciseId != null,
    queryFn: () =>
      exerciseId == null
        ? Promise.resolve([])
        : repos.workouts.getExerciseHistory(exerciseId, { limit: 100 }),
  });
}

export function usePersonalRecords(exerciseId: Id | null): UseQueryResult<PersonalRecord[]> {
  const { repos } = useDb();
  return useQuery({
    queryKey: queryKeys.personalRecords(exerciseId ?? undefined),
    enabled: exerciseId != null,
    queryFn: () =>
      exerciseId == null ? Promise.resolve([]) : repos.records.listForExercise(exerciseId),
  });
}

export function useBodyMetrics(today: LocalDate, days = 365): UseQueryResult<BodyMetric[]> {
  const { repos } = useDb();
  const from = addDays(today, -days);
  return useQuery({
    queryKey: queryKeys.bodyMetricsRange(from, today),
    queryFn: () => repos.body.listMetrics({ from, to: today }),
  });
}

export function useProgressPhotos(): UseQueryResult<ProgressPhoto[]> {
  const { repos } = useDb();
  return useQuery({ queryKey: queryKeys.progressPhotos(), queryFn: () => repos.body.listPhotos() });
}

export function useOpenInsights(): UseQueryResult<Insight[]> {
  const { repos } = useDb();
  return useQuery({ queryKey: queryKeys.openInsights(), queryFn: () => repos.insights.listOpen() });
}

export function useWeeklyReviews(): UseQueryResult<WeeklyReview[]> {
  const { repos } = useDb();
  return useQuery({ queryKey: queryKeys.weeklyReviews(), queryFn: () => repos.reviews.list() });
}
