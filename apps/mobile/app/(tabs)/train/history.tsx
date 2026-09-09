import { useQuery } from '@tanstack/react-query';
import { queryKeys, startOfWeek, type LocalDate, type WorkoutWithExercises } from '@vigor/core';
import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { useSettingsQuery, useToday, useUnitSystem } from '../../../src/data/queries';
import { useRepos } from '../../../src/db/AppDataProvider';
import { useVigorNavigation } from '../../../src/navigation';
import { LoadingScreen, Screen, ScreenBlurb, ScreenTitle } from '../../../src/ui/components';
import { formatDayLabel, formatLoadOrDash, formatWeekLabel } from '../../../src/ui/format';
import { Card, EmptyState, ListRow, SectionHeading } from '../../../src/ui/kit';
import { color, fontSize } from '../../../src/ui/tokens';

/** How far back the history list reaches in one screen. */
const HISTORY_DAYS = 180;

const STATUS_TONE: Record<string, string> = {
  completed: color.good,
  in_progress: color.warn,
  planned: color.textMuted,
  skipped: color.textFaint,
  abandoned: color.bad,
};

function volumeOf(workout: WorkoutWithExercises): number {
  let total = 0;
  for (const slot of workout.exercises) {
    for (const set of slot.sets) {
      if (set.isWarmup || !set.completed) continue;
      total += (set.actualReps ?? 0) * (set.actualLoadKg ?? 0);
    }
  }
  return total;
}

/** Workout history grouped by week — DESIGN.md §7.1 "history calendar". */
export default function HistoryScreen() {
  const { workouts } = useRepos();
  const today = useToday();
  const nav = useVigorNavigation();
  const unitSystem = useUnitSystem();
  const settings = useSettingsQuery();
  const weekStartsOn = settings.data?.weekStartsOn ?? 1;

  const history = useQuery({
    queryKey: queryKeys.workoutsRecent(HISTORY_DAYS),
    queryFn: () => workouts.getRecent({ days: HISTORY_DAYS, today }),
  });

  const weeks = useMemo(() => {
    const grouped = new Map<LocalDate, WorkoutWithExercises[]>();
    for (const workout of history.data ?? []) {
      const key = startOfWeek(workout.date, weekStartsOn);
      grouped.set(key, [...(grouped.get(key) ?? []), workout]);
    }
    return [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [history.data, weekStartsOn]);

  if (history.isLoading) return <LoadingScreen label="Loading your history…" />;

  return (
    <Screen>
      <ScreenTitle>History</ScreenTitle>
      <ScreenBlurb>Every session of the last six months, newest week first.</ScreenBlurb>

      {weeks.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          blurb="Plan one on Today or build one by hand, then log it in session mode."
        />
      ) : (
        weeks.map(([weekStart, rows]) => {
          const completed = rows.filter((workout) => workout.status === 'completed').length;
          const volume = rows.reduce((total, workout) => total + volumeOf(workout), 0);
          return (
            <View key={weekStart}>
              <SectionHeading>{formatWeekLabel(weekStart)}</SectionHeading>
              <Card
                subtitle={`${completed} of ${rows.length} completed · ${formatLoadOrDash(
                  volume,
                  unitSystem,
                )} moved`}
              >
                {rows.map((workout, index) => (
                  <ListRow
                    key={workout.id}
                    title={workout.title}
                    subtitle={`${formatDayLabel(workout.date)} · ${workout.exercises.length} exercises`}
                    trailing={
                      <Text
                        style={{
                          color: STATUS_TONE[workout.status] ?? color.textMuted,
                          fontSize: fontSize.caption,
                        }}
                      >
                        {workout.status.replace('_', ' ')}
                      </Text>
                    }
                    onPress={() => nav.openWorkout(workout.id)}
                    last={index === rows.length - 1}
                  />
                ))}
              </Card>
            </View>
          );
        })
      )}
    </Screen>
  );
}
