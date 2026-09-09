/**
 * Workout history — DESIGN.md §7.1 Train. Sessions grouped by week, newest
 * first, honouring `settings.weekStartsOn`. Volume and set counts come from the
 * core set arithmetic, never from a component.
 */

import { radius, space } from '@vigor/ui-tokens';
import { formatNumber, startOfWeek, type LocalDate, type WorkoutWithExercises } from '@vigor/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Card, EmptyState, SectionHeading } from '../components/ui';
import { useExerciseIndex, useRecentWorkouts, useUnitSystem } from '../data/hooks';
import { useDb } from '../db/provider';
import { loadUnit, loadValue } from '../lib/display';
import { formatDate, todayLocalDate } from '../lib/localDate';
import { volumeOf } from '../session/finish';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

/** Sixteen weeks is enough to see a training block without paging. */
export const HISTORY_DAYS = 112;

const STATUS_TONE: Record<string, string> = {
  completed: themeColor.good,
  in_progress: themeColor.accent,
  planned: themeColor.textMuted,
  skipped: themeColor.warn,
  abandoned: themeColor.bad,
};

export function WorkoutHistory(): ReactNode {
  const today = todayLocalDate();
  const { settings } = useDb();
  const unitSystem = useUnitSystem();
  const { data: workouts = [], isPending } = useRecentWorkouts(HISTORY_DAYS, today);
  const exerciseIndex = useExerciseIndex();

  if (isPending) return <p style={{ color: themeColor.textMuted }}>Loading your history…</p>;

  if (workouts.length === 0) {
    return (
      <EmptyState>
        No sessions in the last {HISTORY_DAYS / 7} weeks. Plan one from Today, or build it by hand
        in the workout builder.
      </EmptyState>
    );
  }

  const weeks = new Map<LocalDate, WorkoutWithExercises[]>();
  for (const workout of workouts) {
    const weekStart = startOfWeek(workout.date, settings.weekStartsOn);
    weeks.set(weekStart, [...(weeks.get(weekStart) ?? []), workout]);
  }

  return (
    <div>
      <SectionHeading
        actions={
          <Link to="/train/builder" style={{ color: themeColor.accent, fontSize: fontSize.label }}>
            Build a workout
          </Link>
        }
      >
        History
      </SectionHeading>

      {[...weeks.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([weekStart, rows]) => {
          const completed = rows.filter((row) => row.status === 'completed').length;
          const volume = rows.reduce((total, row) => total + volumeOf(row).totalVolumeKg, 0);
          return (
            <Card key={weekStart} style={{ marginBottom: space.lg }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: space.md,
                  flexWrap: 'wrap',
                  marginBottom: space.md,
                }}
              >
                <strong style={{ color: themeColor.text }}>Week of {formatDate(weekStart)}</strong>
                <span className="tabular" style={{ color: themeColor.textMuted }}>
                  {completed}/{rows.length} completed ·{' '}
                  {formatNumber(Math.round(loadValue(volume, unitSystem)))} {loadUnit(unitSystem)}{' '}
                  moved
                </span>
              </div>

              <ul
                style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: space.sm }}
              >
                {rows.map((workout) => {
                  const counts = volumeOf(workout);
                  return (
                    <li key={workout.id}>
                      <Link
                        to={`/train/workout/${workout.id}`}
                        style={{
                          display: 'block',
                          padding: space.md,
                          borderRadius: radius.md,
                          border: `1px solid ${themeColor.border}`,
                          textDecoration: 'none',
                          background: themeColor.surfaceRaised,
                        }}
                      >
                        <span style={{ color: themeColor.text, fontSize: fontSize.subheading }}>
                          {workout.title}
                        </span>
                        <span
                          style={{
                            color: STATUS_TONE[workout.status] ?? themeColor.textMuted,
                            fontSize: fontSize.caption,
                            marginLeft: space.sm,
                            textTransform: 'uppercase',
                          }}
                        >
                          {workout.status.replace('_', ' ')}
                        </span>
                        <span
                          className="tabular"
                          style={{
                            display: 'block',
                            color: themeColor.textMuted,
                            fontSize: fontSize.label,
                          }}
                        >
                          {formatDate(workout.date)} · {counts.setsCompleted}/{counts.setsPlanned}{' '}
                          sets ·{' '}
                          {workout.exercises
                            .map((slot) => exerciseIndex.get(slot.exerciseId)?.name ?? 'Exercise')
                            .join(', ')}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
    </div>
  );
}
