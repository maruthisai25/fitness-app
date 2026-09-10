/**
 * Day switcher used by the Eat day log and the photo comparison.
 * Dates are `YYYY-MM-DD` local strings throughout (DESIGN.md §4).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays, weekdayName, weekdayOf, type LocalDate } from '@vigor/core';

import { color, fontSize, fontWeight, radius, space } from './tokens';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** "Thursday 10 Sep" — or "Today" / "Yesterday" when that reads better. */
export function formatDayLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const [, month, day] = date.split('-');
  return `${weekdayName(weekdayOf(date))} ${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

/** "10 Sep" — the compact form for chart axes and list rows. */
export function formatShortDate(date: LocalDate): string {
  const [, month, day] = date.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

export function DateStepper({
  date,
  today,
  onChange,
  /** Blocks stepping past today, for logs that cannot be written ahead. */
  allowFuture = true,
}: {
  date: LocalDate;
  today: LocalDate;
  onChange: (next: LocalDate) => void;
  allowFuture?: boolean;
}) {
  const nextDisabled = !allowFuture && date >= today;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous day"
        accessibilityState={{ disabled: false }}
        onPress={() => onChange(addDays(date, -1))}
        style={({ pressed }) => [styles.step, pressed && styles.pressed]}
      >
        <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.stepLabel}>
          {'‹'}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatDayLabel(date, today)}, ${date}`}
        accessibilityHint={date === today ? undefined : 'Jumps back to today'}
        accessibilityState={{ disabled: date === today }}
        onPress={() => onChange(today)}
        style={styles.middle}
        disabled={date === today}
      >
        <Text maxFontSizeMultiplier={1.6} style={styles.dayLabel}>
          {formatDayLabel(date, today)}
        </Text>
        <Text maxFontSizeMultiplier={1.4} style={styles.dateLabel}>
          {date}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next day"
        accessibilityState={{ disabled: nextDisabled }}
        disabled={nextDisabled}
        onPress={() => onChange(addDays(date, 1))}
        style={({ pressed }) => [
          styles.step,
          pressed && !nextDisabled && styles.pressed,
          nextDisabled && styles.disabled,
        ]}
      >
        <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.stepLabel}>
          {'›'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.sm,
    marginTop: space.lg,
  },
  step: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  pressed: {
    backgroundColor: color.surfaceRaised,
  },
  disabled: {
    opacity: 0.35,
  },
  stepLabel: {
    color: color.text,
    fontSize: fontSize.heading,
    // Decorative chevrons; the pressable around each carries the real name.
    includeFontPadding: false,
  },
  middle: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: {
    color: color.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  dateLabel: {
    color: color.textFaint,
    fontSize: fontSize.caption,
    fontVariant: ['tabular-nums'],
  },
});
