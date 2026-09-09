import { useQuery } from '@tanstack/react-query';
import {
  buildExerciseStats,
  queryKeys,
  toDisplay,
  type ExerciseRelationKind,
} from '@vigor/core';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { useExerciseMap, useUnitSystem } from '../../../../src/data/queries';
import { useRepos } from '../../../../src/db/AppDataProvider';
import { useVigorNavigation } from '../../../../src/navigation';
import { LoadingScreen, Screen, ScreenTitle } from '../../../../src/ui/components';
import {
  formatDayLabel,
  formatLoadOrDash,
  formatLoggedLoadOrDash,
  loadUnit,
  patternLabel,
  repUnitShort,
  titleCase,
} from '../../../../src/ui/format';
import {
  BarChart,
  Body,
  Caption,
  Card,
  EmptyState,
  ListRow,
  SectionHeading,
  StatRow,
  StatTile,
  WhyDisclosure,
} from '../../../../src/ui/kit';
import { color, fontSize, space } from '../../../../src/ui/tokens';

const RELATION_TITLE: Record<ExerciseRelationKind, string> = {
  progression: 'Harder next step',
  regression: 'Easier version',
  variation: 'Variations',
  substitution: 'Swap for',
};

const RECORD_LABEL: Record<string, string> = {
  e1rm: 'Estimated 1RM',
  max_load: 'Heaviest load',
  max_reps_at_load: 'Most reps at a load',
  session_volume: 'Session volume',
};

/** Exercise detail — instructions, cues, relations, history, chart and PRs. */
export default function ExerciseDetailScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId?: string }>();
  const repos = useRepos();
  const unitSystem = useUnitSystem();
  const nav = useVigorNavigation();
  const exercisesById = useExerciseMap();
  const id = exerciseId ?? '';

  const detail = useQuery({
    queryKey: queryKeys.exerciseStats(id),
    enabled: id.length > 0,
    queryFn: async () => {
      const [exercise, sessions, personalRecords, relations] = await Promise.all([
        repos.exercises.get(id),
        repos.workouts.getExerciseHistory(id, { limit: 50 }),
        repos.records.listForExercise(id),
        repos.exercises.listRelations(id),
      ]);
      return { exercise, sessions, personalRecords, relations };
    },
  });

  if (detail.isLoading || !detail.data) {
    return <LoadingScreen label="Loading this exercise…" />;
  }

  const { exercise, sessions, personalRecords, relations } = detail.data;
  if (!exercise) {
    return (
      <Screen>
        <EmptyState title="That exercise is not in your library" />
      </Screen>
    );
  }

  const stats = buildExerciseStats({ exercise, sessions, personalRecords, unitSystem });
  const chartPoints = [...stats.sessions]
    .reverse()
    .filter((session) => session.e1rmKg != null)
    .map((session) => ({
      label: formatDayLabel(session.date),
      value: toDisplay(session.e1rmKg as number, 'load', unitSystem),
    }));

  const relationsByKind = new Map<ExerciseRelationKind, typeof relations>();
  for (const relation of relations) {
    relationsByKind.set(relation.kind, [...(relationsByKind.get(relation.kind) ?? []), relation]);
  }

  return (
    <Screen>
      <ScreenTitle>{exercise.name}</ScreenTitle>
      <Caption>
        {`${patternLabel(exercise.movementPattern)} · ${exercise.primaryMuscles
          .map(titleCase)
          .join(', ')} · difficulty ${exercise.difficulty}/5`}
      </Caption>

      <StatRow>
        <StatTile label="Sessions" value={String(stats.sessionCount)} />
        <StatTile
          label="Best e1RM"
          value={stats.display.bestE1rm == null ? '—' : String(stats.display.bestE1rm)}
          unit={stats.display.bestE1rm == null ? undefined : loadUnit(unitSystem)}
          tone="accent"
        />
        <StatTile
          label="Best load"
          value={stats.display.bestLoad == null ? '—' : String(stats.display.bestLoad)}
          unit={stats.display.bestLoad == null ? undefined : loadUnit(unitSystem)}
        />
        <StatTile
          label="Per week"
          value={
            stats.e1rmTrendKgPerWeek == null
              ? '—'
              : `${stats.e1rmTrendKgPerWeek > 0 ? '+' : ''}${toDisplay(
                  stats.e1rmTrendKgPerWeek,
                  'load',
                  unitSystem,
                )}`
          }
          tone={
            stats.e1rmTrendKgPerWeek == null
              ? 'default'
              : stats.e1rmTrendKgPerWeek >= 0
                ? 'good'
                : 'warn'
          }
        />
      </StatRow>
      <WhyDisclosure rationale={stats.rationale} label="How is this worked out?" />

      {chartPoints.length >= 2 ? (
        <Card title="Estimated 1RM" subtitle="Epley, best set of each session">
          <BarChart points={chartPoints} unit={loadUnit(unitSystem)} />
        </Card>
      ) : null}

      {exercise.instructions.trim().length > 0 ? (
        <Card title="How to do it">
          <Body>{exercise.instructions}</Body>
        </Card>
      ) : null}

      {exercise.cues.length > 0 ? (
        <Card title="Cues">
          {exercise.cues.map((cue) => (
            <Text key={cue} style={{ color: color.text, fontSize: fontSize.body, marginTop: 4 }}>
              {`· ${cue}`}
            </Text>
          ))}
        </Card>
      ) : null}

      {[...relationsByKind.entries()].map(([kind, rows]) => (
        <Card key={kind} title={RELATION_TITLE[kind]}>
          {rows.map((relation, index) => {
            const target = exercisesById.get(relation.toId);
            return (
              <ListRow
                key={`${relation.toId}-${index}`}
                title={target?.name ?? 'Exercise'}
                subtitle={relation.note ?? undefined}
                onPress={target ? () => nav.openExercise(target.id) : undefined}
                last={index === rows.length - 1}
              />
            );
          })}
        </Card>
      ))}

      <SectionHeading>Personal records</SectionHeading>
      {stats.personalRecords.length === 0 ? (
        <EmptyState
          title="No records yet"
          blurb="Log a working set and the records engine starts comparing."
        />
      ) : (
        <Card>
          {stats.personalRecords.map((record, index) => (
            <ListRow
              key={record.id}
              title={RECORD_LABEL[record.kind] ?? record.kind}
              subtitle={formatDayLabel(record.date)}
              trailing={
                <Text style={{ color: color.accent, fontSize: fontSize.body }}>
                  {record.kind === 'max_reps_at_load'
                    ? `${record.value} × ${formatLoadOrDash(record.loadKg, unitSystem)}`
                    : formatLoadOrDash(record.value, unitSystem)}
                </Text>
              }
              last={index === stats.personalRecords.length - 1}
            />
          ))}
        </Card>
      )}

      <SectionHeading>History</SectionHeading>
      {stats.sessions.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          blurb="Add this exercise to a workout and its sets will show up here."
        />
      ) : (
        <Card>
          {stats.sessions.map((session, index) => (
            <ListRow
              key={`${session.workoutId}-${session.date}-${index}`}
              title={formatDayLabel(session.date)}
              subtitle={`${session.reps.join(' · ')} ${repUnitShort(exercise.loadType)}${
                session.meanRpe != null ? ` · RPE ${session.meanRpe}` : ''
              }`}
              trailing={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: color.text, fontSize: fontSize.label }}>
                    {/* As logged, never snapped to a plate step — §5.10. */}
                    {formatLoggedLoadOrDash(session.loadKg, unitSystem)}
                  </Text>
                  <Caption>{`${session.sets} sets`}</Caption>
                </View>
              }
              onPress={() => nav.openWorkout(session.workoutId)}
              last={index === stats.sessions.length - 1}
            />
          ))}
        </Card>
      )}

      <View style={{ height: space.xl }} />
    </Screen>
  );
}
