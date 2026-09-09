import { Stack } from 'expo-router';

import { color, fontSize, fontWeight } from '../../../src/ui/tokens';

/** Strength, body, photos, consistency, insights, reviews, reminders — DESIGN.md §7.1 "Progress". */
export default function ProgressLayout() {
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="strength" options={{ title: 'Strength' }} />
      <Stack.Screen name="body" options={{ title: 'Body' }} />
      <Stack.Screen name="photos" options={{ title: 'Photos' }} />
      <Stack.Screen name="consistency" options={{ title: 'Consistency' }} />
      <Stack.Screen name="insights" options={{ title: 'Insights' }} />
      <Stack.Screen name="reviews" options={{ title: 'Weekly reviews' }} />
      <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
    </Stack>
  );
}
