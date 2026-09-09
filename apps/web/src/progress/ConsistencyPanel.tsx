/**
 * Progress → Consistency. DESIGN.md §7.1 "consistency" and §5.7 streaks:
 * "streaks count planned-day completions; a rest day never breaks a streak" —
 * so the streak here is `computeStreak`'s, not a count this component invents.
 */

import {
  addDays,
  buildWeeklyReview,
  computeStreak,
  endOfWeek,
  startOfWeek,
  type LocalDate,
  type StreakDay,
  type WeekDay,
  type WeeklyReviewStats,
  type WorkoutWithExercises,
} from '@vigor/core';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import { BarChart } from '../components/charts';
import { Card, EmptyState, Pill, Section, Stat } from '../components/ui';
import { useDb } from '../db/provider';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { PROGRESS_WINDOW_DAYS, useRecentWorkouts } from './data';

/** One planned day per calendar date that has a workout on it. */
export function streakDaysFrom(workouts: readonly WorkoutWithExercises[]): StreakDay[] {
  const byDate = new Map<LocalDate, StreakDay>();
  for (const workout of workouts) {
    const current = byDate.get(workout.date) ?? {
      date: workout.date,
      planned: true,
      completed: false,
    };
    if (workout.status === 'completed') current.completed = true;
    byDate.set(workout.date, current);
  }
  return [...byDate.values()];
}

/**
 * One `buildWeeklyReview` per week that has sessions in it, oldest first.
 *
 * The counts on this screen are the weekly review's counts (DESIGN.md §5.9) —
 * completed, planned and missed all come out of the core builder, so
 * Consistency and the Weekly review can never disagree about the same week.
 * The exercise list is irrelevant here: nothing below reads volume by muscle.
 */
export function weeklyStats(
  workouts: readonly WorkoutWithExercises[],
  weekStartsOn: WeekDay,
): WeeklyReviewStats[] {
  const weekStarts = [
    ...new Set(workouts.map((workout) => startOfWeek(workout.date, weekStartsOn))),
  ].sort((a, b) => a.localeCompare(b));
  return weekStarts.map((weekOf) =>
    buildWeeklyReview({ weekOf, weekStartsOn, workouts, exercises: [] }),
  );
}

/**
 * The sessions behind the builder's `missedSessions` count: skipped, abandoned,
 * or still planned once their own week has run out.
 */
export function missedSessions(
  workouts: readonly WorkoutWithExercises[],
  weekStartsOn: WeekDay,
): WorkoutWithExercises[] {
  return workouts
    .filter(
      (workout) =>
        workout.status === 'skipped' ||
        workout.status === 'abandoned' ||
        (workout.status === 'planned' && workout.date < endOfWeek(workout.date, weekStartsOn)),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function ConsistencyPanel({ today }: { today: LocalDate }): ReactNode {
  const { settings } = useDb();
  const workouts = useRecentWorkouts();

  const rows = workouts.data ?? [];

  const streak = useMemo(
    () => computeStreak({ today, days: streakDaysFrom(rows) }),
    [rows, today],
  );
  const weeks = useMemo(
    () => weeklyStats(rows, settings.weekStartsOn),
    [rows, settings.weekStartsOn],
  );
  const missed = useMemo(
    () => missedSessions(rows, settings.weekStartsOn),
    [rows, settings.weekStartsOn],
  );

  if (workouts.isPending) return <EmptyState>Loading your sessions…</EmptyState>;
  if (rows.length === 0) {
    return (
      <EmptyState>
        No sessions in the last {PROGRESS_WINDOW_DAYS} days. Plan one in Train and this fills in.
      </EmptyState>
    );
  }

  const totalPlanned = weeks.reduce((total, week) => total + week.training.workoutsPlanned, 0);
  const totalCompleted = weeks.reduce((total, week) => total + week.training.workoutsCompleted, 0);
  const totalMissed = weeks.reduce((total, week) => total + week.training.missedSessions, 0);

  return (
    <div>
      <Card style={{ marginBottom: space.xl }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: space.lg,
          }}
        >
          <Stat
            label="Current streak"
            value={String(streak.current)}
            unit={streak.current === 1 ? 'session' : 'sessions'}
            tone={streak.current > 0 ? 'accent' : 'text'}
          />
          <Stat label="Longest streak" value={String(streak.longest)} unit="sessions" />
          <Stat
            label="Completed"
            value={`${totalCompleted} / ${totalPlanned}`}
            tone={totalCompleted === totalPlanned ? 'good' : 'text'}
          />
          <Stat label="Missed" value={String(totalMissed)} tone={totalMissed > 0 ? 'warn' : 'good'} />
        </div>
        <p
          style={{
            margin: `${space.md}px 0 0`,
            color: themeColor.textMuted,
            fontSize: fontSize.label,
            lineHeight: 1.5,
          }}
        >
          {streak.rationale.summary}
        </p>
      </Card>

      <Section title="Weekly completion">
        <BarChart
          title="Sessions completed per week"
          subtitle="Every bar is one week; the number is how many planned sessions you finished."
          unit="sessions"
          points={weeks.map((week) => ({
            label: week.weekStart,
            value: week.training.workoutsCompleted,
          }))}
          maxValue={Math.max(1, ...weeks.map((week) => week.training.workoutsPlanned))}
          labelEvery={Math.max(1, Math.ceil(weeks.length / 8))}
        />
      </Section>

      <Section title="Missed planned sessions">
        {missed.length === 0 ? (
          <EmptyState>
            Nothing planned has been missed in this window. Rest days do not count against you.
          </EmptyState>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {missed.map((workout) => (
              <li
                key={workout.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: space.md,
                  padding: `${space.sm}px 0`,
                  borderTop: `1px solid ${themeColor.border}`,
                }}
              >
                <span style={{ color: themeColor.text, fontSize: fontSize.label }}>
                  <span className="tabular">{workout.date}</span> · {workout.title}
                </span>
                <Pill tone={workout.status === 'abandoned' ? 'warn' : 'muted'}>
                  {workout.status === 'planned'
                    ? 'never started'
                    : workout.status === 'abandoned'
                      ? 'stopped part-way'
                      : 'skipped'}
                </Pill>
              </li>
            ))}
          </ul>
        )}
        {streak.lastMissedOn && (
          <p
            className="tabular"
            style={{ color: themeColor.textFaint, fontSize: fontSize.caption }}
          >
            Streak last broken on {streak.lastMissedOn}
            {streak.startedOn ? `; current run started ${streak.startedOn}` : ''}.
          </p>
        )}
        <p style={{ color: themeColor.textFaint, fontSize: fontSize.caption }}>
          Window: {addDays(today, -PROGRESS_WINDOW_DAYS)} to {today}.
        </p>
      </Section>
    </div>
  );
}
