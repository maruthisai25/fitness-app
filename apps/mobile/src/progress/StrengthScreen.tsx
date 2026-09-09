/**
 * Strength — DESIGN.md §7.1 "per-exercise stats and PRs", §7.2 view-model
 * builders.
 *
 * Pick an exercise you have actually trained and the screen renders what
 * `buildExerciseStats` and `buildProgressSeries` already worked out: estimated
 * 1RM over time, session volume, working sets per week, and every personal
 * record. No arithmetic happens here.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import {
  addDays,
  buildExerciseStats,
  buildProgressSeries,
  formatLoad,
  queryKeys,
  unitLabel,
  type Id,
  type PersonalRecordKind,
  type UnitSystem,
} from '@vigor/core';

import { usePlatform, useRepos } from '../db/AppDataProvider';
import { LoadingScreen, Screen, ScreenBlurb, ScreenTitle, TextField } from '../ui/components';
import { BarChart, LineChart } from '../ui/charts';
import { formatShortDate } from '../ui/DateStepper';
import {
  Caption,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  EmptyState,
  ItemRow,
  Note,
  Stat,
  StatRow,
  ErrorScreen,
} from '../ui/primitives';

/** How far back the charts look. A quarter is enough to see a trend. */
export const STRENGTH_WINDOW_DAYS = 180;

const PR_LABEL: Record<PersonalRecordKind, string> = {
  e1rm: 'Estimated 1RM',
  max_load: 'Heaviest load',
  max_reps_at_load: 'Most reps at a load',
  session_volume: 'Biggest session',
};

/** DESIGN.md §5.7 — e1RM and max load are celebrated; the rest are listed quietly. */
const LOUD_KINDS = new Set<PersonalRecordKind>(['e1rm', 'max_load']);

export function StrengthScreen() {
  const repos = useRepos();
  const { clock } = usePlatform();
  const today = clock.today();
  const from = addDays(today, -(STRENGTH_WINDOW_DAYS - 1));

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<Id | null>(null);

  const trained = useQuery({
    queryKey: [...queryKeys.exercises(), 'trained', from, today],
    queryFn: async () => {
      const [workouts, profile] = await Promise.all([
        repos.workouts.getRecent({ days: STRENGTH_WINDOW_DAYS, today }),
        repos.profile.get(),
      ]);
      const ids = [
        ...new Set(workouts.flatMap((workout) => workout.exercises.map((slot) => slot.exerciseId))),
      ];
      const exercises = await repos.exercises.getMany(ids);
      return {
        workouts,
        exercises: exercises.sort((a, b) => a.name.localeCompare(b.name)),
        unitSystem: (profile?.unitSystem ?? 'metric') as UnitSystem,
      };
    },
  });

  const exerciseId = selectedId ?? trained.data?.exercises[0]?.id ?? null;

  const detail = useQuery({
    enabled: exerciseId != null,
    queryKey: queryKeys.exerciseStats(exerciseId ?? 'none'),
    queryFn: async () => {
      if (exerciseId == null) return null;
      const [sessions, records, exercise] = await Promise.all([
        repos.workouts.getExerciseHistory(exerciseId, { limit: 60 }),
        repos.records.listForExercise(exerciseId),
        repos.exercises.get(exerciseId),
      ]);
      return { sessions, records, exercise };
    },
  });

  if (trained.isPending) return <LoadingScreen label="Loading your training history…" />;
  if (trained.error) {
    return <ErrorScreen message={`Could not load history: ${trained.error.message}`} />;
  }

  const unitSystem = trained.data?.unitSystem ?? 'metric';
  const matches = (trained.data?.exercises ?? []).filter((exercise) =>
    exercise.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  if ((trained.data?.exercises.length ?? 0) === 0) {
    return (
      <Screen>
        <ScreenTitle>Strength</ScreenTitle>
        <EmptyState
          title="No logged sets yet"
          detail="Finish a session in Train and this screen fills in: estimated 1RM per exercise, volume, and every record you set."
        />
      </Screen>
    );
  }

  const stats =
    detail.data?.exercise != null
      ? buildExerciseStats({
          exercise: detail.data.exercise,
          sessions: detail.data.sessions,
          personalRecords: detail.data.records,
          unitSystem,
        })
      : null;

  const e1rmSeries =
    detail.data?.exercise != null
      ? buildProgressSeries({
          metric: 'e1rm',
          from,
          to: today,
          sessions: detail.data.sessions,
          unitSystem,
          exerciseName: detail.data.exercise.name,
        })
      : null;

  const volumeSeries =
    detail.data?.exercise != null
      ? buildProgressSeries({
          metric: 'session_volume',
          from,
          to: today,
          sessions: detail.data.sessions,
          unitSystem,
        })
      : null;

  const weeklySets = buildProgressSeries({
    metric: 'weekly_sets',
    from,
    to: today,
    workouts: trained.data?.workouts ?? [],
    unitSystem,
  });

  return (
    <Screen>
      <ScreenTitle>Strength</ScreenTitle>
      <ScreenBlurb>
        Estimated 1RM uses Epley on sets of twelve reps or fewer, the same maths the progression
        engine uses to decide your next load.
      </ScreenBlurb>

      <TextField
        label="Find an exercise"
        placeholder="Bench press"
        value={search}
        onChangeText={setSearch}
      />
      <ChipRow>
        {matches.slice(0, 24).map((exercise) => (
          <Chip
            key={exercise.id}
            label={exercise.name}
            selected={exercise.id === exerciseId}
            onPress={() => setSelectedId(exercise.id)}
          />
        ))}
      </ChipRow>
      {matches.length === 0 ? (
        <Caption>Nothing trained in the last {STRENGTH_WINDOW_DAYS} days matches that.</Caption>
      ) : null}

      {detail.isFetching ? <Caption>Loading that exercise…</Caption> : null}

      {stats ? (
        <View>
          <Card>
            <CardTitle>{stats.exerciseName}</CardTitle>
            <Caption>
              {`${stats.sessionCount} sessions${
                stats.firstSessionDate ? ` since ${formatShortDate(stats.firstSessionDate)}` : ''
              }`}
            </Caption>
            <StatRow>
              <Stat
                label="Best e1RM"
                value={stats.display.bestE1rm == null ? '—' : String(stats.display.bestE1rm)}
                unit={unitLabel('load', unitSystem)}
                tone="accent"
              />
              <Stat
                label="Heaviest"
                value={stats.display.bestLoad == null ? '—' : String(stats.display.bestLoad)}
                unit={unitLabel('load', unitSystem)}
              />
              <Stat label="Sets" value={String(stats.totalSets)} />
            </StatRow>
            <Note>{stats.rationale.summary}</Note>
          </Card>

          {e1rmSeries ? (
            <LineChart
              title="Estimated 1RM"
              subtitle={e1rmSeries.rationale.summary}
              unit={e1rmSeries.unit}
              points={e1rmSeries.points.map((point) => ({
                label: formatShortDate(point.date),
                value: point.display,
              }))}
            />
          ) : null}

          {volumeSeries ? (
            <LineChart
              title="Session volume"
              subtitle="Reps × load across the working sets of each session."
              unit={volumeSeries.unit}
              points={volumeSeries.points.map((point) => ({
                label: formatShortDate(point.date),
                value: point.display,
              }))}
              stroke="#5A8CA8"
            />
          ) : null}

          <BarChart
            title="Working sets per week"
            subtitle="Every completed set across all exercises, bucketed by week."
            unit="sets"
            bars={weeklySets.points.map((point) => ({
              label: formatShortDate(point.date),
              value: point.value,
            }))}
          />

          <Card>
            <CardTitle>Personal records</CardTitle>
            {stats.personalRecords.length === 0 ? (
              <Caption>No records for this exercise yet.</Caption>
            ) : (
              stats.personalRecords.map((record) => (
                <ItemRow
                  key={record.id}
                  title={PR_LABEL[record.kind]}
                  subtitle={`${formatShortDate(record.date)}${
                    record.reps != null && record.loadKg != null
                      ? ` · ${record.reps} reps at ${formatLoad(record.loadKg, unitSystem)}`
                      : ''
                  }`}
                  value={
                    record.kind === 'max_reps_at_load'
                      ? `${record.value} reps`
                      : formatLoad(record.value, unitSystem)
                  }
                  tone={LOUD_KINDS.has(record.kind) ? 'accent' : 'neutral'}
                />
              ))
            )}
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}
