import { color, fontSize, space } from './ui/tokens';
import { StyleSheet, Text, View } from 'react-native';

interface PlaceholderProps {
  title: string;
  blurb: string;
}

/**
 * Phase 0 stand-in for a destination. The app-shell agent replaces these with
 * the real screens (DESIGN.md §7.1).
 */
export function Placeholder({ title, blurb }: PlaceholderProps) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.blurb}>{blurb}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
    paddingHorizontal: space.xl,
    paddingTop: space.xxxl,
  },
  title: {
    color: color.text,
    fontSize: fontSize.display,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  blurb: {
    color: color.textMuted,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.45,
    marginTop: space.md,
  },
});
