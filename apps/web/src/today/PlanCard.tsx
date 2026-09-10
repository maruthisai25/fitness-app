/**
 * Today's plan — DESIGN.md §7.1: a planned session starts session mode; with
 * nothing planned the rule-based planner (§5.4) builds one offline. The coach
 * takes this slot over in phase 2 (`CoachSlot name="todayPlan"`).
 */

import { radius, space } from '@vigor/ui-tokens';
import type { DeloadRecommendation, LocalDate, TodayView, WorkoutWithExercises } from '@vigor/core';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { CoachSlot } from '../coach/slots';
import { TodayQuickActions } from '../coach/TodayPlanSlot';
import { Card, EmptyState, SectionHeading, Stat, WhyDisclosure } from '../components/ui';
import { useExerciseIndex, useInvalidate, useRepos } from '../data/hooks';
import { repRangeText } from '../lib/display';
import { sessionPath } from '../session/path';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { planAndSaveWorkout } from './plan';

export function PlanCard({
  date,
  view,
  workoutsToday,
  deload,
  deloadAccepted,
  safetyActive,
}: {
  date: LocalDate;
  view: TodayView;
  workoutsToday: readonly WorkoutWithExercises[];
  deload: DeloadRecommendation;
  deloadAccepted: boolean;
  safetyActive: boolean;
}): ReactNode {
  const repos = useRepos();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const exerciseIndex = useExerciseIndex();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const card = view.workout;
  const workout = workoutsToday.find((row) => row.id === card.workoutId) ?? null;

  async function planToday(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const saved = await planAndSaveWorkout(repos, {
        date,
        deload: deloadAccepted ? deload : null,
      });
      await invalidate('createWorkout');
      navigate(sessionPath(saved.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeading>Today’s session</SectionHeading>

      {safetyActive && (
        <p style={{ color: themeColor.warn, marginTop: 0, fontSize: fontSize.label }}>
          A safety event is open, so the planner holds loads and takes a set off every exercise.
        </p>
      )}

      {card.state === 'none' && (
        <div>
          <CoachSlot
            name="todayPlan"
            fallback={
              <EmptyState>
                Nothing is planned yet. The rule-based planner can build one from your goals,
                equipment and the last few weeks of training — no network needed.
              </EmptyState>
            }
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void planToday()}
            style={{
              marginTop: space.md,
              padding: `${space.sm}px ${space.lg}px`,
              borderRadius: radius.md,
              border: 'none',
              background: themeColor.accent,
              color: themeColor.textOnAccent,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {busy ? 'Planning…' : 'Plan today’s workout'}
          </button>
          {deloadAccepted && (
            <p style={{ color: themeColor.textMuted, fontSize: fontSize.label }}>
              Your accepted deload is applied to the plan.
            </p>
          )}
          {error && <p style={{ color: themeColor.bad }}>{error}</p>}
        </div>
      )}

      {card.state !== 'none' && (
        <div>
          <p style={{ margin: 0, color: themeColor.text, fontSize: fontSize.subheading }}>
            {card.title}
          </p>
          <div style={{ display: 'flex', gap: space.xl, flexWrap: 'wrap', marginTop: space.md }}>
            <Stat label="Exercises" value={card.exerciseCount} />
            <Stat label="Sets" value={`${card.setsCompleted}/${card.setsPlanned}`} />
            <Stat label="Planned" value={card.plannedDurationMin ?? '—'} unit="min" />
          </div>

          {workout && (
            <ul
              className="tabular"
              style={{
                listStyle: 'none',
                padding: 0,
                margin: `${space.md}px 0 0`,
                color: themeColor.textMuted,
              }}
            >
              {workout.exercises.map((slot) => {
                const slotExercise = exerciseIndex.get(slot.exerciseId);
                return (
                  <li key={slot.id}>
                    {slotExercise?.name ?? 'Exercise'} — {slot.targetSets} ×{' '}
                    {/* A plank's target is seconds and a carry's is metres — never a bare
                        number that reads as reps (DESIGN.md §5.1 rule 5). */}
                    {repRangeText(
                      { min: slot.targetRepMin, max: slot.targetRepMax },
                      slotExercise?.loadType ?? 'external',
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <WhyDisclosure rationale={card.rationale} />

          {card.workoutId && card.state !== 'completed' && (
            <div style={{ marginTop: space.md }}>
              <TodayQuickActions workoutId={card.workoutId} />
            </div>
          )}

          <div style={{ display: 'flex', gap: space.md, marginTop: space.lg, flexWrap: 'wrap' }}>
            {card.workoutId && card.state !== 'completed' && (
              <Link
                to={sessionPath(card.workoutId)}
                style={{
                  padding: `${space.sm}px ${space.lg}px`,
                  borderRadius: radius.md,
                  background: themeColor.accent,
                  color: themeColor.textOnAccent,
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                {card.state === 'in_progress' ? 'Resume session' : 'Start session'}
              </Link>
            )}
            {card.workoutId && (
              <Link
                to={`/train/workout/${card.workoutId}`}
                style={{
                  padding: `${space.sm}px ${space.lg}px`,
                  borderRadius: radius.md,
                  border: `1px solid ${themeColor.border}`,
                  color: themeColor.text,
                  textDecoration: 'none',
                }}
              >
                See the detail
              </Link>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
