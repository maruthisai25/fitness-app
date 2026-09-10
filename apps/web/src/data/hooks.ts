/**
 * TanStack Query over the repositories — DESIGN.md §7.2. Every key comes from
 * `@vigor/core/queries` so invalidation rules are shared with mobile, and every
 * write goes through `useInvalidate(mutationName)` rather than an inline list.
 */

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  queryKeys,
  invalidationsFor,
  type Equipment,
  type Exercise,
  type ExerciseRelation,
  type ExerciseSession,
  type Id,
  type Insight,
  type LocalDate,
  type Memory,
  type MutationName,
  type PersonalRecord,
  type Profile,
  type Readiness,
  type SafetyEvent,
  type UnitSystem,
  type Workout,
  type WorkoutWithExercises,
} from '@vigor/core';
import type { ExerciseSearchFilter, Repositories } from '@vigor/db';
import { useCallback } from 'react';

import { useDb } from '../db/provider';
import { resyncForeground } from '../progress/foreground';

/** The repository surface, without pulling the whole context into a screen. */
export function useRepos(): Repositories {
  return useDb().repos;
}

/**
 * Mutations after which the reminder rules can answer differently, so the
 * foreground runner has to decide again rather than leaving an armed slot to
 * fire from a stale plan (DESIGN.md §7.3):
 *
 *  - `finishWorkout` — a finished session silences today's workout reminder;
 *  - `substituteExercise` / `createWorkout` / `updateWorkout` — the plan changed;
 *  - `logFood` — the meal-log and protein rules both move with a new log.
 */
const RESYNC_AFTER: ReadonlySet<MutationName> = new Set<MutationName>([
  'finishWorkout',
  'substituteExercise',
  'createWorkout',
  'updateWorkout',
  'logFood',
]);

/**
 * Invalidates exactly the key prefixes DESIGN.md §7.2 assigns to a mutation,
 * then resyncs the reminders when this mutation is one that can change what
 * they would say. Call it after a repository write; never invalidate by hand.
 */
export function useInvalidate(): (mutation: MutationName) => Promise<void> {
  const client = useQueryClient();
  return useCallback(
    async (mutation: MutationName) => {
      await Promise.all(
        invalidationsFor(mutation).map((queryKey) => client.invalidateQueries({ queryKey })),
      );
      if (RESYNC_AFTER.has(mutation)) resyncForeground();
    },
    [client],
  );
}

export function useEquipment(): UseQueryResult<Equipment[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.equipment(),
    queryFn: () => repos.equipment.list(),
    staleTime: 5 * 60_000,
  });
}

export function useProfile(): UseQueryResult<Profile | null> {
  const repos = useRepos();
  return useQuery({ queryKey: queryKeys.profile(), queryFn: () => repos.profile.get() });
}

/** The profile's unit system, defaulting to metric until the profile loads. */
export function useUnitSystem(): UnitSystem {
  return useProfile().data?.unitSystem ?? 'metric';
}

/** The whole library, custom rows included — small enough to keep in memory. */
export function useExercises(): UseQueryResult<Exercise[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.exercises(),
    queryFn: () => repos.exercises.list({ includeArchived: true }),
    staleTime: 5 * 60_000,
  });
}

/** `Map<id, Exercise>` for the many screens that render an exercise name. */
export function useExerciseIndex(): Map<Id, Exercise> {
  const { data } = useExercises();
  return new Map((data ?? []).map((exercise) => [exercise.id, exercise]));
}

export function useExerciseSearch(filter: ExerciseSearchFilter): UseQueryResult<Exercise[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.exerciseSearch(JSON.stringify(filter)),
    queryFn: () => repos.exercises.search(filter),
  });
}

export function useExercise(exerciseId: Id | undefined): UseQueryResult<Exercise | null> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.exercise(exerciseId ?? 'none'),
    queryFn: () => (exerciseId ? repos.exercises.get(exerciseId) : Promise.resolve(null)),
    enabled: exerciseId != null,
  });
}

export function useExerciseHistory(
  exerciseId: Id | undefined,
  limit?: number,
): UseQueryResult<ExerciseSession[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.exerciseHistory(exerciseId ?? 'none', limit),
    queryFn: () =>
      exerciseId
        ? repos.workouts.getExerciseHistory(exerciseId, { limit })
        : Promise.resolve<ExerciseSession[]>([]),
    enabled: exerciseId != null,
  });
}

export function usePersonalRecords(exerciseId: Id | undefined): UseQueryResult<PersonalRecord[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.personalRecords(exerciseId),
    queryFn: () =>
      exerciseId
        ? repos.records.listForExercise(exerciseId)
        : repos.records.listRecent({ limit: 20 }),
  });
}

export function useExerciseRelations(
  exerciseId: Id | undefined,
): UseQueryResult<ExerciseRelation[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: [...queryKeys.exercise(exerciseId ?? 'none'), 'relations'],
    queryFn: () =>
      exerciseId
        ? repos.exercises.listRelations(exerciseId)
        : Promise.resolve<ExerciseRelation[]>([]),
    enabled: exerciseId != null,
  });
}

export function useRecentWorkouts(
  days: number,
  today?: LocalDate,
): UseQueryResult<WorkoutWithExercises[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.workoutsRecent(days),
    queryFn: () => repos.workouts.getRecent({ days, today }),
  });
}

export function useWorkout(workoutId: Id | undefined): UseQueryResult<WorkoutWithExercises | null> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.workout(workoutId ?? 'none'),
    queryFn: () => (workoutId ? repos.workouts.getWithExercises(workoutId) : Promise.resolve(null)),
    enabled: workoutId != null,
  });
}

export function useWorkoutsOnDate(date: LocalDate): UseQueryResult<WorkoutWithExercises[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.workoutsByDate(date),
    queryFn: () => repos.workouts.getByDate(date),
  });
}

export function useOpenSafetyEvents(): UseQueryResult<SafetyEvent[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.openSafetyEvents(),
    queryFn: () => repos.safety.listOpen(),
  });
}

/**
 * Every safety event, open and resolved — You → Safety (DESIGN.md §7.1). Same
 * root as {@link useOpenSafetyEvents} with an extra key segment (the
 * `useOpenWorkouts` pattern below), so `resolveSafety`/`reportSafety`'s prefix
 * invalidation of `QUERY_ROOTS.safetyEvents` still reaches this query.
 */
export function useAllSafetyEvents(): UseQueryResult<SafetyEvent[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: [...queryKeys.safetyEvents(), 'all'],
    queryFn: () => repos.safety.list({ includeResolved: true }),
  });
}

export function useReadiness(date: LocalDate): UseQueryResult<Readiness | null> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.readiness(date),
    queryFn: () => repos.readiness.getByDate(date),
  });
}

/** Active memories, most recently updated first — You → Memories (DESIGN.md §4.2, §8). */
export function useActiveMemories(): UseQueryResult<Memory[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.activeMemories(),
    queryFn: () => repos.memories.listActive(),
  });
}

export function useOpenInsights(): UseQueryResult<Insight[]> {
  const repos = useRepos();
  return useQuery({ queryKey: queryKeys.openInsights(), queryFn: () => repos.insights.listOpen() });
}

/** Planned or in-progress sessions the Train tab can hand to session mode. */
export function useOpenWorkouts(days = 14, today?: LocalDate): UseQueryResult<Workout[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: [...queryKeys.workouts(), 'open', days],
    queryFn: async () => {
      const rows = await repos.workouts.getRecent({ days, today });
      return rows.filter((row) => row.status === 'planned' || row.status === 'in_progress');
    },
  });
}
