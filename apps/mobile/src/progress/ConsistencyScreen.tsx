/**
 * Consistency — weekly completion, the current streak, and what was missed.
 *
 * The streak comes from `computeStreak` (DESIGN.md §5.7: planned-day
 * completions, and a rest day never breaks it). The weekly bars are counts of
 * stored rows, not an estimate.
 */
import { useQuery } from '@tanstack/react-query';

import {
  addDays,
  computeStreak,
  expandRestDays,
  queryKeys,
  startOfWeek,
  type LocalDate,
  type WeekDay,
  type Workout,
} from '@vigor/core';

import { usePlatform, useRepos } from '../db/AppDataProvider';
import { LoadingScreen, Screen, ScreenBlurb, ScreenTitle } from '../ui/components';
import { BarChart } from '../ui/charts';
import { formatShortDate } from '../ui/DateStepper';
import {
  Caption,
  Card,
  CardTitle,
  DataRow,
  EmptyState,
  ItemRow,
  Note,
  Stat,
  StatRow,
  ErrorScreen,
} from '../ui/primitives';

export const CONSISTENCY_WEEKS = 12;

interface WeekBucket {
  weekStart: LocalDate;
  planned: number;
  completed: number;
}

/** Buckets workouts into weeks starting on the user's chosen day. */
export function bucketByWeek(
  workouts: readonly Workout[],
  weeks: readonly LocalDate[],
  weekStartsOn: WeekDay,
): WeekBucket[] {
  const buckets = new Map<LocalDate, WeekBucket>(
    weeks.map((weekStart) => [weekStart, { weekStart, planned: 0, completed: 0 }]),
  );
  for (const workout of workouts) {
    const bucket = buckets.get(startOfWeek(workout.date, weekStartsOn));
    if (!bucket) continue;
    bucket.planned += 1;
    if (workout.status === 'completed') bucket.completed += 1;
  }
  return weeks.map((weekStart) => buckets.get(weekStart) as WeekBucket);
}

export function ConsistencyScreen() {
  const repos = useRepos();
  const { clock } = usePlatform();
  const today = clock.today();

  const state = useQuery({
    queryKey: [...queryKeys.workouts(), 'consistency', today],
    queryFn: async () => {
      const settings = await repos.settings.getAll();
      const thisWeekStart = startOfWeek(today, settings.weekStartsOn);
      const from = addDays(thisWeekStart, -7 * (CONSISTENCY_WEEKS - 1));
      const workouts = await repos.workouts.listRange({ from, to: today });
      const weeks: LocalDate[] = [];
      for (let index = 0; index < CONSISTENCY_WEEKS; index += 1) {
        weeks.push(addDays(from, index * 7));
      }
      return { settings, workouts, weeks, from };
    },
  });

  if (state.isPending) return <LoadingScreen label="Loading your history…" />;
  if (state.error)
    return <ErrorScreen message={`Could not load history: ${state.error.message}`} />;
  if (!state.data) return <ErrorScreen message="History did not load." />;

  const { workouts, weeks, from, settings } = state.data;
  const buckets = bucketByWeek(workouts, weeks, settings.weekStartsOn);

  const streak = computeStreak({
    today,
    days: expandRestDays(
      from,
      today,
      workouts.map((workout) => ({
        date: workout.date,
        planned: true,
        completed: workout.status === 'completed',
      })),
    ),
  });

  const missed = workouts
    .filter(
      (workout) =>
        workout.status === 'skipped' ||
        workout.status === 'abandoned' ||
        (workout.status === 'planned' && workout.date < today),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalPlanned = buckets.reduce((total, bucket) => total + bucket.planned, 0);
  const totalCompleted = buckets.reduce((total, bucket) => total + bucket.completed, 0);

  return (
    <Screen>
      <ScreenTitle>Consistency</ScreenTitle>
      <ScreenBlurb>
        {`The last ${CONSISTENCY_WEEKS} weeks of sessions: what was on the calendar, and what you actually finished.`}
      </ScreenBlurb>

      <Card>
        <CardTitle>Streak</CardTitle>
        <StatRow>
          <Stat
            label="Current"
            value={String(streak.current)}
            unit="sessions"
            tone={streak.current > 0 ? 'good' : 'neutral'}
          />
          <Stat label="Longest" value={String(streak.longest)} unit="sessions" />
          <Stat
            label="Completed"
            value={
              totalPlanned === 0 ? '—' : `${Math.round((totalCompleted / totalPlanned) * 100)}%`
            }
            tone={totalCompleted / Math.max(1, totalPlanned) >= 0.75 ? 'good' : 'warn'}
          />
        </StatRow>
        <Note>{streak.rationale.summary}</Note>
        {streak.startedOn ? (
          <Caption>{`Running since ${formatShortDate(streak.startedOn)}.`}</Caption>
        ) : null}
      </Card>

      <BarChart
        title="Sessions completed per week"
        subtitle={`${totalCompleted} of ${totalPlanned} planned sessions finished.`}
        unit="sessions"
        bars={buckets.map((bucket) => ({
          label: formatShortDate(bucket.weekStart),
          value: bucket.completed,
        }))}
        highlightIndex={buckets.length - 1}
      />

      <Card>
        <CardTitle>Week by week</CardTitle>
        {buckets.map((bucket) => (
          <DataRow
            key={bucket.weekStart}
            label={`Week of ${formatShortDate(bucket.weekStart)}`}
            value={`${bucket.completed} / ${bucket.planned}`}
            tone={
              bucket.planned === 0
                ? 'neutral'
                : bucket.completed === bucket.planned
                  ? 'good'
                  : bucket.completed === 0
                    ? 'bad'
                    : 'warn'
            }
          />
        ))}
      </Card>

      <Card>
        <CardTitle>Missed sessions</CardTitle>
        {missed.length === 0 ? (
          <Caption>Nothing planned has been left behind in this window.</Caption>
        ) : (
          missed
            .slice(0, 20)
            .map((workout) => (
              <ItemRow
                key={workout.id}
                title={workout.title}
                subtitle={`${formatShortDate(workout.date)} · ${
                  workout.status === 'planned' ? 'never started' : workout.status
                }`}
                value={`${workout.plannedDurationMin} min`}
                tone="warn"
              />
            ))
        )}
      </Card>

      {workouts.length === 0 ? (
        <EmptyState
          title="No sessions in this window"
          detail="Plan or log a workout in Train and the weekly bars start filling in."
        />
      ) : null}
    </Screen>
  );
}
