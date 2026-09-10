import { color, fontSize, HIT_TARGET } from '../../src/ui/tokens';
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
        // A five-item tab bar cannot grow with the system text size without
        // the labels colliding, so the label caps its scaling; the tab's
        // accessible name below is unaffected.
        tabBarLabelStyle: { fontSize: fontSize.caption },
        tabBarAllowFontScaling: true,
        tabBarItemStyle: { minHeight: HIT_TARGET },
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
          options={{
            title: destination.label,
            // The label alone reads as one word; the blurb says what is behind
            // it, which is what a screen-reader user needs before switching.
            tabBarAccessibilityLabel: `${destination.label} tab. ${destination.blurb}`,
          }}
        />
      ))}
    </Tabs>
  );
}
