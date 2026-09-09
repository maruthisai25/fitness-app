import { Stack } from 'expo-router';

import { color, fontSize, fontWeight } from '../../../src/ui/tokens';

/**
 * Train — DESIGN.md §7.1: "history calendar, workout detail, exercise library,
 * per-exercise stats and PRs, session mode entry".
 */
export default function TrainLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: color.surface },
        headerTintColor: color.text,
        headerTitleStyle: { fontWeight: fontWeight.semibold, fontSize: fontSize.heading },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: color.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Train' }} />
      <Stack.Screen name="library" options={{ title: 'Exercise library' }} />
      <Stack.Screen name="custom-exercise" options={{ title: 'New exercise' }} />
      <Stack.Screen name="history" options={{ title: 'History' }} />
      <Stack.Screen name="builder" options={{ title: 'Build a workout' }} />
      <Stack.Screen name="exercise/[exerciseId]" options={{ title: 'Exercise' }} />
      <Stack.Screen name="workout/[workoutId]" options={{ title: 'Workout' }} />
    </Stack>
  );
}
