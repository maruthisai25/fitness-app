/**
 * TanStack Query over the repositories — DESIGN.md §7.2.
 *
 * Query keys come from `@vigor/core/queries` so both shells invalidate the
 * same things after the same mutation; no key is ever spelled inline here.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  invalidationsFor,
  queryKeys,
  type Exercise,
  type ExerciseRelation,
  type Id,
  type LocalDate,
  type MutationName,
  type Profile,
  type SafetyEvent,
  type Settings,
  type UnitSystem,
} from '@vigor/core';
import { useCallback, useMemo } from 'react';

import { useRepos, usePlatform } from '../db/AppDataProvider';

/**
 * Invalidates every key prefix the named mutations touch. One call per write,
 * so a repository write and a cache refresh cannot drift apart.
 */
export function useInvalidate(): (...mutations: MutationName[]) => Promise<void> {
  const client = useQueryClient();
  return useCallback(
    async (...mutations: MutationName[]) => {
      await Promise.all(
        mutations.flatMap((mutation) =>
          invalidationsFor(mutation).map((queryKey) => client.invalidateQueries({ queryKey })),
        ),
      );
    },
    [client],
  );
}

/** Today as the user's calendar day — read once per mount from the Clock adapter. */
export function useToday(): LocalDate {
  const { clock } = usePlatform();
  return useMemo(() => clock.today(), [clock]);
}

export function useProfileQuery(): UseQueryResult<Profile | null> {
  const { profile } = useRepos();
  return useQuery({ queryKey: queryKeys.profile(), queryFn: () => profile.get() });
}

/** The unit system every displayed number is converted into — DESIGN.md §5.10. */
export function useUnitSystem(): UnitSystem {
  const { data } = useProfileQuery();
  return data?.unitSystem ?? 'metric';
}

export function useSettingsQuery(): UseQueryResult<Settings> {
  const { settings } = useRepos();
  return useQuery({ queryKey: queryKeys.settings(), queryFn: () => settings.getAll() });
}

/** The whole library, cached once — screens filter it in memory. */
export function useExercisesQuery(): UseQueryResult<Exercise[]> {
  const { exercises } = useRepos();
  return useQuery({ queryKey: queryKeys.exercises(), queryFn: () => exercises.list() });
}

/** Name lookups for workout rows, which only store `exerciseId`. */
export function useExerciseMap(): Map<Id, Exercise> {
  const { data } = useExercisesQuery();
  return useMemo(() => new Map((data ?? []).map((exercise) => [exercise.id, exercise])), [data]);
}

export function useRelationsQuery(): UseQueryResult<ExerciseRelation[]> {
  const { exercises } = useRepos();
  return useQuery({
    queryKey: [...queryKeys.exercises(), 'relations'],
    queryFn: () => exercises.listRelations(),
  });
}

/**
 * Unresolved safety events — DESIGN.md §6.5. While this is non-empty the
 * banner shows, the planner holds and session mode says so.
 */
export function useOpenSafetyEvents(): UseQueryResult<SafetyEvent[]> {
  const { safety } = useRepos();
  return useQuery({ queryKey: queryKeys.openSafetyEvents(), queryFn: () => safety.listOpen() });
}

export function useResolveSafetyEvent() {
  const { safety } = useRepos();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: Id; note?: string }) =>
      safety.resolve(input.id, input.note),
    onSuccess: () => invalidate('resolveSafety'),
  });
}
