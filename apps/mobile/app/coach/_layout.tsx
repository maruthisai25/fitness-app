import { Stack } from 'expo-router';

import { color, fontSize, fontWeight } from '../../src/ui/tokens';

/** The coach chat — DESIGN.md §7.1, reachable from every screen. */
export default function CoachLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Coach' }} />
      <Stack.Screen name="[conversationId]" options={{ title: 'Coach' }} />
    </Stack>
  );
}
