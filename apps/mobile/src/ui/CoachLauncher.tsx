/**
 * The floating coach button — DESIGN.md §7.1: "The coach chat is reachable
 * from every screen (floating button on mobile …)". Mounted once in the root
 * layout, above the tab stack, so it survives every route except the ones
 * that are already about the coach or that want the whole screen to
 * themselves.
 */
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, fontSize, fontWeight, radius, space } from './tokens';

const HIDDEN_ON: readonly string[] = ['coach', 'onboarding', 'session'];

export function CoachLauncher() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const segments = useSegments();

  if (HIDDEN_ON.includes(String(segments[0]))) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open the coach"
      testID="coach-launcher"
      onPress={() => router.push('/coach')}
      style={({ pressed }) => [
        styles.button,
        { bottom: insets.bottom + space.xl },
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.label}>Coach</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: space.xl,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  buttonPressed: { backgroundColor: color.accentPressed },
  label: {
    color: color.textOnAccent,
    fontSize: fontSize.label,
    fontWeight: fontWeight.semibold,
  },
});
