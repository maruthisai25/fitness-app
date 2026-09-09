/**
 * The `sessionCoach` slot — "inside session mode, above the current exercise"
 * (`apps/web/src/coach/slots.tsx`). A quick way to ask about the exercise the
 * lifter is looking at right now; the substitution ask lives on the "Can't do
 * this" sheet itself (`SubstitutionSheet.tsx`), next to the local engine's
 * own ranking.
 */

import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';

import { Card } from '../components/ui';
import { useExerciseIndex, useWorkout } from '../data/hooks';
import { useSessionStore } from '../session/sessionStore';
import { InlineCoachAsk } from './InlineCoachAsk';

export function SessionCoachSlot(): ReactNode {
  const workoutId = useSessionStore((state) => state.workoutId);
  const activeIndex = useSessionStore((state) => state.activeIndex);
  const { data: workout } = useWorkout(workoutId ?? undefined);
  const exerciseIndex = useExerciseIndex();

  const slot = workout?.exercises[Math.min(activeIndex, workout.exercises.length - 1)];
  if (!workout || !slot) return null;
  const exerciseName = exerciseIndex.get(slot.exerciseId)?.name ?? 'this exercise';

  return (
    <Card style={{ marginBottom: space.lg }}>
      <InlineCoachAsk
        label={`Ask the coach about ${exerciseName}`}
        busyLabel="Asking the coach…"
        prompt={`How does ${exerciseName} look for me today (workoutExerciseId: ${slot.id}, workoutId: ${workout.id})? Anything you would change about it before I start?`}
      />
    </Card>
  );
}
