import { color, fontSize, fontWeight } from '../../../src/ui/tokens';
import { Stack } from 'expo-router';

/** Profile, Goals, Equipment, Settings, Export/Import (DESIGN.md §7.1 "You"). */
export default function YouLayout() {
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
      <Stack.Screen name="index" options={{ title: 'You' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="goals" options={{ title: 'Goals' }} />
      <Stack.Screen name="equipment" options={{ title: 'Equipment' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="export" options={{ title: 'Export data' }} />
      <Stack.Screen name="import" options={{ title: 'Import data' }} />
    </Stack>
  );
}
