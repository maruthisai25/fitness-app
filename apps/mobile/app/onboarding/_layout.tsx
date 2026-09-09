import { color } from '../../src/ui/tokens';
import { Stack } from 'expo-router';

/** Welcome -> disclaimer -> profile -> goals -> equipment -> duration -> API key (DESIGN.md §7.1). */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.bg },
        gestureEnabled: false,
      }}
    />
  );
}
