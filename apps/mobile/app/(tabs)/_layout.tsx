import { color, fontSize } from '../../src/ui/tokens';
import { Tabs } from 'expo-router';

import { DESTINATIONS } from '../../src/destinations';

/** The five top-level destinations as a tab bar — DESIGN.md §7.1. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textFaint,
        tabBarLabelStyle: { fontSize: fontSize.caption },
        tabBarStyle: {
          backgroundColor: color.surface,
          borderTopColor: color.border,
        },
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      {DESTINATIONS.map((destination) => (
        <Tabs.Screen
          key={destination.name}
          name={destination.name}
          options={{ title: destination.label }}
        />
      ))}
    </Tabs>
  );
}
