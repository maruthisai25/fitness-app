/**
 * The nutrition card the Today tab shows — DESIGN.md §7.1: "nutrition ring with
 * remaining macros".
 *
 * Self-contained: it reads the day itself through `useRepos()` and asks
 * `buildDayNutrition` for the numbers, so the Today screen only has to place it
 * and say where a tap should go. It is exported from the Eat feature because
 * the arithmetic and the copy belong with the rest of nutrition.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { clampMacros, progressAgainstTarget, type LocalDate } from '@vigor/core';

import { usePlatform, useRepos } from '../db/AppDataProvider';
import { Ring } from '../ui/charts';
import { color, fontSize, fontWeight, radius, space } from '../ui/tokens';
import { useDayNutrition } from './model';

export interface TodayNutritionCardProps {
  /** Opens the Eat tab. The Today screen owns navigation, so it passes this in. */
  onOpenEat: () => void;
  /** Defaults to today from the platform clock. */
  date?: LocalDate;
}

/**
 * Remaining calories and protein as two rings. Tapping anywhere opens Eat.
 */
export function TodayNutritionCard({ onOpenEat, date }: TodayNutritionCardProps) {
  const repos = useRepos();
  const { clock } = usePlatform();
  const day = useDayNutrition(repos, date ?? clock.today());

  const state = day.data;
  const targets = state?.targets ?? null;
  const remaining = state ? clampMacros(state.remaining) : null;

  /**
   * The rings are a picture of numbers a screen reader would otherwise have to
   * piece together from four fragments, so the card speaks one sentence.
   */
  const spoken =
    !state || !targets || !remaining
      ? 'Left today. Open the Eat tab to log a meal.'
      : `Left today: ${Math.round(remaining.kcal)} of ${targets.kcal} kcal and ${Math.round(
          remaining.proteinG,
        )} of ${targets.proteinG} grams of protein.`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the Eat tab"
      accessibilityState={{ disabled: false }}
      onPress={onOpenEat}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Left today
        </Text>
        <Text style={styles.link}>Eat ›</Text>
      </View>

      {day.isPending ? (
        <Text style={styles.detail}>Loading today&apos;s log…</Text>
      ) : !state ? (
        <Text style={styles.detail}>Today&apos;s log could not be read.</Text>
      ) : !targets || !remaining ? (
        <Text style={styles.detail}>
          {`${Math.round(state.consumed.kcal)} kcal and ${Math.round(
            state.consumed.proteinG,
          )} g protein logged. Set targets in Eat to see what is left.`}
        </Text>
      ) : (
        <View style={styles.rings}>
          <View style={styles.ringCell}>
            <Ring
              size={92}
              strokeWidth={9}
              stroke={state.remaining.kcal < 0 ? color.warn : color.accent}
              progress={progressAgainstTarget(state.consumed.kcal, targets.kcal) ?? 0}
            >
              <Text maxFontSizeMultiplier={1.4} style={styles.ringValue}>{Math.round(remaining.kcal)}</Text>
              <Text style={styles.ringUnit}>kcal</Text>
            </Ring>
            <Text style={styles.ringLabel}>{`of ${targets.kcal} kcal`}</Text>
          </View>

          <View style={styles.ringCell}>
            <Ring
              size={92}
              strokeWidth={9}
              stroke={color.good}
              progress={progressAgainstTarget(state.consumed.proteinG, targets.proteinG) ?? 0}
            >
              <Text maxFontSizeMultiplier={1.4} style={styles.ringValue}>{Math.round(remaining.proteinG)}</Text>
              <Text style={styles.ringUnit}>g protein</Text>
            </Ring>
            <Text style={styles.ringLabel}>{`of ${targets.proteinG} g`}</Text>
          </View>
        </View>
      )}

      {state && targets ? (
        <Text style={styles.detail}>
          {`${state.mealsLogged} meal${state.mealsLogged === 1 ? '' : 's'} logged · ${Math.round(
            clampMacros(state.remaining).fiberG,
          )} g fiber still to go`}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default TodayNutritionCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
    marginTop: space.md,
  },
  pressed: {
    backgroundColor: color.surfaceRaised,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: color.text,
    fontSize: fontSize.heading,
    fontWeight: fontWeight.semibold,
  },
  link: {
    color: color.accent,
    fontSize: fontSize.label,
    fontWeight: fontWeight.semibold,
  },
  rings: {
    flexDirection: 'row',
    gap: space.xl,
    marginTop: space.md,
  },
  ringCell: {
    alignItems: 'center',
    gap: space.xs,
  },
  ringValue: {
    color: color.text,
    fontSize: fontSize.numeral,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  ringUnit: {
    color: color.textMuted,
    fontSize: fontSize.caption,
  },
  ringLabel: {
    color: color.textFaint,
    fontSize: fontSize.caption,
    fontVariant: ['tabular-nums'],
  },
  detail: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    marginTop: space.md,
    lineHeight: fontSize.caption * 1.5,
  },
});
