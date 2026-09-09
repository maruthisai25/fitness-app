import { Stack } from 'expo-router';

import { color, fontSize, fontWeight } from '../../../src/ui/tokens';

/** Day log, add food, targets, saved meals, inventory, recipes, meal plans — DESIGN.md §7.1 "Eat". */
export default function EatLayout() {
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
      <Stack.Screen name="add" options={{ title: 'Add food' }} />
      <Stack.Screen name="targets" options={{ title: 'Targets' }} />
      <Stack.Screen name="saved-meals" options={{ title: 'Saved meals' }} />
      <Stack.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Stack.Screen name="recipes" options={{ title: 'Recipes' }} />
      <Stack.Screen name="recipe/[id]" options={{ title: 'Recipe' }} />
      <Stack.Screen name="plans" options={{ title: 'Meal plans' }} />
    </Stack>
  );
}
