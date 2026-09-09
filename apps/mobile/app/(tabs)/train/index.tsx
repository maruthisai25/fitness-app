import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@vigor/core';
import { View } from 'react-native';

import { useExerciseMap, useToday } from '../../../src/data/queries';
import { useRepos } from '../../../src/db/AppDataProvider';
import { useVigorNavigation } from '../../../src/navigation';
import { Button, Screen, ScreenBlurb, ScreenTitle } from '../../../src/ui/components';
import { formatDayLabel } from '../../../src/ui/format';
import { Body, Caption, Card, EmptyState, ListRow, SectionHeading } from '../../../src/ui/kit';
import { SafetyBanner } from '../../../src/ui/SafetyBanner';
import { space } from '../../../src/ui/tokens';

/** Train hub — the entry point for the library, history and session mode. */
export default function TrainScreen() {
  const { workouts } = useRepos();
  const today = useToday();
  const nav = useVigorNavigation();
  const exercisesById = useExerciseMap();

  const todayWorkouts = useQuery({
    queryKey: queryKeys.workoutsByDate(today),
    queryFn: () => workouts.getByDate(today),
  });
  const recent = useQuery({
    queryKey: queryKeys.workoutsRecent(30),
    queryFn: () => workouts.getRecent({ days: 30, today }),
  });

  const live =
    todayWorkouts.data?.find((workout) => workout.status === 'in_progress') ??
    todayWorkouts.data?.find((workout) => workout.status === 'planned') ??
    null;

  const history = (recent.data ?? []).filter((workout) => workout.id !== live?.id).slice(0, 5);

  return (
    <Screen>
      <ScreenTitle>Train</ScreenTitle>
      <ScreenBlurb>
        Your library, your history and the session you are in the middle of.
      </ScreenBlurb>

      <SafetyBanner />

      {live ? (
        <Card
          title={live.title}
          subtitle={`${live.exercises.length} exercises · ${live.plannedDurationMin} min planned`}
        >
          <Body muted>
            {live.status === 'in_progress'
              ? 'You are part-way through this session.'
              : 'Planned for today and ready when you are.'}
          </Body>
          <Button
            label={live.status === 'in_progress' ? 'Continue session' : 'Start session'}
            onPress={() => nav.openSession(live.id)}
          />
          <View style={{ marginTop: space.sm }}>
            <Button
              label="See the plan"
              variant="secondary"
              onPress={() => nav.openWorkout(live.id)}
            />
          </View>
        </Card>
      ) : (
        <Card title="Nothing scheduled today">
          <Body muted>
            Build a session by hand, or ask for one on the Today tab and it will show up here.
          </Body>
          <Button label="Build a workout" onPress={() => nav.openBuilder(today)} />
        </Card>
      )}

      <SectionHeading>Browse</SectionHeading>
      <Card>
        <ListRow
          title="Exercise library"
          subtitle="Search by name, pattern, muscle or equipment"
          onPress={nav.openLibrary}
        />
        <ListRow
          title="Workout history"
          subtitle="Every session, grouped by week"
          onPress={nav.openHistory}
        />
        <ListRow
          title="Build a workout"
          subtitle="Start from the planner draft and edit it"
          onPress={() => nav.openBuilder(today)}
          last
        />
      </Card>

      <SectionHeading>Recent sessions</SectionHeading>
      {history.length === 0 ? (
        <EmptyState
          title="No sessions logged yet"
          blurb="Once you finish a session it shows up here with its sets, loads and rationale."
        />
      ) : (
        <Card>
          {history.map((workout, index) => (
            <ListRow
              key={workout.id}
              title={workout.title}
              subtitle={`${formatDayLabel(workout.date)} · ${workout.exercises
                .map((slot) => exercisesById.get(slot.exerciseId)?.name)
                .filter(Boolean)
                .slice(0, 3)
                .join(', ')}`}
              trailing={<Caption>{workout.status.replace('_', ' ')}</Caption>}
              onPress={() => nav.openWorkout(workout.id)}
              last={index === history.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
