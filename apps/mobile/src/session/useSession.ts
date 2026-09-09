/**
 * Session-mode hooks — DESIGN.md §7.1, §7.2.
 *
 * The data work lives in `./sessionData` (React-free and directly testable);
 * this module only binds it to TanStack Query and the shared invalidation
 * rules of `@vigor/core/queries`.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { queryKeys, type Id, type UnitSystem } from '@vigor/core';

import { useInvalidate, useToday } from '../data/queries';
import { useRepos } from '../db/AppDataProvider';
import { useReminderResync } from '../progress/useProgressForeground';
import { applySubstitution, finishSession, loadSession, type SessionView } from './sessionData';

export {
  applySubstitution,
  finishSession,
  loadSession,
  rankSubstitutes,
  type FinishRecord,
  type FinishSummary,
  type SessionExerciseView,
  type SessionSetView,
  type SessionView,
  type SubstitutionOffer,
} from './sessionData';

export function useSessionQuery(workoutId: Id): UseQueryResult<SessionView | null> {
  const repos = useRepos();
  return useQuery({
    queryKey: [...queryKeys.workout(workoutId), 'session'],
    queryFn: () => loadSession(repos, workoutId),
  });
}

/** What the user confirmed for one set, already converted to canonical units. */
export interface ConfirmSetInput {
  setId: Id;
  actualReps: number | null;
  actualLoadKg: number | null;
  rpe: number | null;
  notes: string | null;
}

/** DESIGN.md §7.2 — every confirmation is flushed before anything else happens. */
export function useConfirmSet() {
  const { sets } = useRepos();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ConfirmSetInput) =>
      sets.record(input.setId, {
        actualReps: input.actualReps,
        actualLoadKg: input.actualLoadKg,
        rpe: input.rpe,
        notes: input.notes,
      }),
    onSuccess: () => invalidate('recordSet'),
  });
}

export function useStartSession() {
  const { workouts } = useRepos();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (workoutId: Id) => workouts.start(workoutId),
    onSuccess: () => invalidate('updateWorkout'),
  });
}

/**
 * Applies the substitution the user picked. The slot's targets are re-derived
 * from the replacement's own history by `applySubstitution` — carrying the
 * previous exercise's load across would prescribe, and silently log, a number
 * that never applied to the new movement.
 */
export function useSubstituteExercise() {
  const repos = useRepos();
  const invalidate = useInvalidate();
  const resyncReminders = useReminderResync();
  const today = useToday();
  return useMutation({
    mutationFn: (input: { workoutExerciseId: Id; toExerciseId: Id }) =>
      applySubstitution(repos, {
        workoutExerciseId: input.workoutExerciseId,
        toExerciseId: input.toExerciseId,
        today,
      }),
    onSuccess: async () => {
      await invalidate('substituteExercise');
      // The plan changed, so what the workout reminder would say changed too.
      resyncReminders();
    },
  });
}

export function useFinishSession() {
  const repos = useRepos();
  const invalidate = useInvalidate();
  const resyncReminders = useReminderResync();
  return useMutation({
    mutationFn: (input: {
      workoutId: Id;
      status: 'completed' | 'abandoned';
      unitSystem: UnitSystem;
    }) => finishSession(repos, input),
    onSuccess: async () => {
      await invalidate('finishWorkout');
      // DESIGN.md §7.3: a finished session silences today's workout reminder.
      // Re-decide now rather than leaving a scheduled notification to fire.
      resyncReminders();
    },
  });
}
