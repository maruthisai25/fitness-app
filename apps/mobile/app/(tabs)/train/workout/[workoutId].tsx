import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@vigor/core';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { useExerciseMap, useUnitSystem } from '../../../../src/data/queries';
import { useRepos } from '../../../../src/db/AppDataProvider';
import { useVigorNavigation } from '../../../../src/navigation';
import { Button, LoadingScreen, Screen, ScreenTitle } from '../../../../src/ui/components';
import {
  formatDayLabel,
  formatDuration,
  formatLoadOrDash,
  formatLoggedLoadOrDash,
  formatSetTarget,
  repUnitShort,
} from '../../../../src/ui/format';
import {
  Caption,
  Card,
  EmptyState,
  StatRow,
  StatTile,
  WhyDisclosure,
} from '../../../../src/ui/kit';
import { color, fontSize, MAX_COMPACT_FONT_SCALE, space } from '../../../../src/ui/tokens';

/** Workout detail — exercises, sets and the rationale behind "Why?". */
export default function WorkoutDetailScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const { workouts } = useRepos();
  const exercisesById = useExerciseMap();
  const unitSystem = useUnitSystem();
  const nav = useVigorNavigation();
  const id = workoutId ?? '';

  const detail = useQuery({
    queryKey: queryKeys.workout(id),
    enabled: id.length > 0,
    queryFn: () => workouts.getWithExercises(id),
  });

  if (detail.isLoading) return <LoadingScreen label="Loading the session…" />;

  const workout = detail.data ?? null;
  if (!workout) {
    return (
      <Screen>
        <EmptyState title="That workout is not in your history any more" />
      </Screen>
    );
  }

  const completedSets = workout.exercises.reduce(
    (total, slot) => total + slot.sets.filter((set) => set.completed && !set.isWarmup).length,
    0,
  );
  const plannedSets = workout.exercises.reduce(
    (total, slot) => total + slot.sets.filter((set) => !set.isWarmup).length,
    0,
  );
  const volume = workout.exercises.reduce(
    (total, slot) =>
      total +
      slot.sets.reduce(
        (sum, set) =>
          set.completed && !set.isWarmup
            ? sum + (set.actualReps ?? 0) * (set.actualLoadKg ?? 0)
            : sum,
        0,
      ),
    0,
  );

  const live = workout.status === 'planned' || workout.status === 'in_progress';

  return (
    <Screen>
      <ScreenTitle>{workout.title}</ScreenTitle>
      <Caption>
        {`${formatDayLabel(workout.date)} · ${workout.status.replace('_', ' ')} · ${
          workout.source
        } plan`}
      </Caption>

      <StatRow>
        <StatTile label="Sets" value={`${completedSets}/${plannedSets}`} />
        <StatTile
          label="Volume"
          value={formatLoadOrDash(volume, unitSystem).split(' ')[0]}
          unit={formatLoadOrDash(volume, unitSystem).split(' ')[1]}
        />
        <StatTile label="Duration" value={formatDuration(workout.startedAt, workout.finishedAt)} />
      </StatRow>
      <WhyDisclosure rationale={workout.rationale} />

      {live ? (
        <Button
          label={workout.status === 'in_progress' ? 'Continue session' : 'Start session'}
          onPress={() => nav.openSession(workout.id)}
        />
      ) : null}

      {workout.exercises.map((slot) => {
        const exercise = exercisesById.get(slot.exerciseId);
        const loadType = exercise?.loadType ?? 'external';
        return (
          <Card
            key={slot.id}
            title={exercise?.name ?? 'Exercise'}
            subtitle={`${formatSetTarget(
              slot.targetSets,
              slot.targetRepMin,
              slot.targetRepMax,
              loadType,
            )}${
              slot.targetLoadKg != null
                ? ` at ${formatLoadOrDash(slot.targetLoadKg, unitSystem)}`
                : ''
            } · rest ${slot.restSec}s`}
          >
            {slot.substitutedFromExerciseId ? (
              <Caption>
                {`Swapped in for ${
                  exercisesById.get(slot.substitutedFromExerciseId)?.name ?? 'another exercise'
                }`}
              </Caption>
            ) : null}

            {slot.sets.length === 0 ? (
              <Caption>No sets logged.</Caption>
            ) : (
              slot.sets.map((set, index) => (
                <View key={set.id} style={{ flexDirection: 'row', marginTop: space.xs }}>
                  <Text
                    maxFontSizeMultiplier={MAX_COMPACT_FONT_SCALE}
                    style={{ color: color.textMuted, fontSize: fontSize.label, width: 56 }}
                  >
                    {`Set ${index + 1}`}
                  </Text>
                  <Text
                    // Two figures share this row; capping the growth keeps the
                    // load next to the reps instead of under them.
                    maxFontSizeMultiplier={MAX_COMPACT_FONT_SCALE}
                    style={{
                      color: set.completed ? color.text : color.textFaint,
                      fontSize: fontSize.label,
                      fontVariant: ['tabular-nums'],
                      flex: 1,
                    }}
                  >
                    {set.completed
                      ? `${set.actualReps ?? 0} ${repUnitShort(loadType)}${
                          set.actualLoadKg != null
                            ? // As logged, never snapped to a plate step — §5.10.
                              ` × ${formatLoggedLoadOrDash(set.actualLoadKg, unitSystem)}`
                            : ''
                        }${set.rpe != null ? ` · RPE ${set.rpe}` : ''}`
                      : `target ${set.targetReps} ${repUnitShort(loadType)} — not logged`}
                  </Text>
                </View>
              ))
            )}

            {slot.notes ? <Caption>{slot.notes}</Caption> : null}
            <WhyDisclosure rationale={slot.progressionDecision?.rationale ?? null} />
          </Card>
        );
      })}

      <View style={{ height: space.xl }} />
    </Screen>
  );
}
