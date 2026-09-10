/**
 * Shared building blocks for the Train tab, Today tab and session mode.
 *
 * DESIGN.md §7.5 asks for an athletic, unfussy look: deep green-black grounds,
 * warm off-white text, one burnt-amber accent for actions and PR moments,
 * semantic green/amber/red kept for readiness and target states, tabular
 * numerals wherever a number sits in a column.
 *
 * DESIGN.md §2.3 and §7.1: every engine recommendation carries a `Rationale`
 * and the UI always offers "Why?" — that is `WhyDisclosure` below.
 *
 * Accessibility: pressables carry role, label and state; targets are at least
 * `HIT_TARGET`; figures cap their dynamic-type growth with
 * `maxFontSizeMultiplier` so a number and its unit stay on one line at large
 * text sizes; the bottom sheet is announced as modal and skips its slide-in
 * when the OS asks for reduced motion.
 */
import type { Rationale } from '@vigor/core';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  color,
  fontSize,
  fontWeight,
  HIT_TARGET,
  MAX_COMPACT_FONT_SCALE,
  MAX_NUMERAL_FONT_SCALE,
  radius,
  space,
  TEXT_ACTION_HIT_SLOP,
} from './tokens';
import { useReducedMotion } from './useReducedMotion';

/** A raised panel. `title` is optional so it can wrap a bare row of numbers. */
export function Card({
  title,
  subtitle,
  action,
  children,
  style,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children?: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.card, style]}>
      {title || action ? (
        <View style={styles.cardHead}>
          <View style={styles.cardHeadText}>
            {title ? (
              <Text accessibilityRole="header" style={styles.cardTitle}>
                {title}
              </Text>
            ) : null}
            {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
          </View>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Section heading between cards. */
export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionHeadingText}>
        {children}
      </Text>
      {action}
    </View>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.bodyMuted]}>{children}</Text>;
}

export function Caption({ children }: { children: ReactNode }) {
  return <Text style={styles.caption}>{children}</Text>;
}

/**
 * A number that sits in a column: tabular figures, condensed weight.
 *
 * The figure and its unit are one accessibility element ("62.5 kg", not "62.5"
 * then "kg"), and both cap their dynamic-type growth so the pair stays on one
 * line — DESIGN.md §7.5 asks for numbers in columns, and a column that wraps
 * is no longer a column.
 */
export function Numeral({
  value,
  unit,
  tone = 'default',
}: {
  value: string;
  unit?: string;
  tone?: 'default' | 'accent' | 'good' | 'warn' | 'bad';
}) {
  return (
    <View
      accessible
      accessibilityLabel={unit ? `${value} ${unit}` : value}
      style={styles.numeralRow}
    >
      <Text maxFontSizeMultiplier={MAX_NUMERAL_FONT_SCALE} style={[styles.numeral, toneStyle(tone)]}>
        {value}
      </Text>
      {unit ? (
        <Text maxFontSizeMultiplier={MAX_NUMERAL_FONT_SCALE} style={styles.numeralUnit}>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

function toneStyle(tone: 'default' | 'accent' | 'good' | 'warn' | 'bad') {
  switch (tone) {
    case 'accent':
      return { color: color.accent };
    case 'good':
      return { color: color.good };
    case 'warn':
      return { color: color.warn };
    case 'bad':
      return { color: color.bad };
    default:
      return { color: color.text };
  }
}

/** A labelled figure, three or four to a row. */
export function StatTile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'default' | 'accent' | 'good' | 'warn' | 'bad';
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}
      style={styles.statTile}
    >
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        maxFontSizeMultiplier={MAX_COMPACT_FONT_SCALE}
        style={styles.statLabel}
      >
        {label}
      </Text>
      <Numeral value={value} unit={unit} tone={tone} />
    </View>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <View style={styles.statRow}>{children}</View>;
}

/** A tappable filter/selection chip. */
export function Chip({
  label,
  selected,
  onPress,
  tone = 'default',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'accent';
}) {
  const body = (
    <View
      style={[
        styles.chip,
        selected && styles.chipSelected,
        tone === 'accent' && !selected && styles.chipAccent,
      ]}
    >
      <Text
        maxFontSizeMultiplier={2}
        style={[styles.chipLabel, selected && styles.chipLabelSelected]}
      >
        {label}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Selection is the whole point of a chip; without this a screen reader
      // cannot tell the chosen RPE from the eight it did not choose.
      accessibilityState={{ selected: Boolean(selected), disabled: false }}
      hitSlop={TEXT_ACTION_HIT_SLOP}
    >
      {body}
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

/** A pressable list row with a title, a supporting line and a trailing value. */
export function ListRow({
  title,
  subtitle,
  trailing,
  onPress,
  last,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const content = (
    <View style={[styles.listRow, last && styles.listRowLast]}>
      <View style={styles.listRowText}>
        <Text style={styles.listRowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.listRowSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {content}
    </Pressable>
  );
}

/**
 * "Why?" — DESIGN.md §2.3: every recommendation carries a rationale and the UI
 * always shows it. Collapsed by default so the number leads and the reasoning
 * is one tap away.
 */
export function WhyDisclosure({
  rationale,
  label = 'Why?',
  testID,
}: {
  rationale: Rationale | null;
  label?: string;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!rationale) return null;
  return (
    <View style={styles.why}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Shows the reasoning behind this number"
        accessibilityState={{ expanded: open, disabled: false }}
        hitSlop={TEXT_ACTION_HIT_SLOP}
        style={styles.whyToggleHit}
      >
        <Text maxFontSizeMultiplier={2} style={styles.whyToggle}>
          {open ? `Hide ${label.toLowerCase()}` : label}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.whyBody}>
          <Text style={styles.whySummary}>{rationale.summary}</Text>
          {rationale.codes.length > 0 ? (
            <Text
              accessibilityLabel={`Reason codes: ${rationale.codes.join(', ')}`}
              style={styles.whyCodes}
            >
              {rationale.codes.join(' · ')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Nothing here yet, and what to do about it. */
export function EmptyState({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <View accessible accessibilityLabel={blurb ? `${title}. ${blurb}` : title} style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {blurb ? <Text style={styles.emptyBlurb}>{blurb}</Text> : null}
    </View>
  );
}

/** A bar chart of estimated 1RM over time. No chart library, no new dependency. */
export function BarChart({
  points,
  unit,
  height = 120,
}: {
  points: readonly { label: string; value: number }[];
  unit: string;
  height?: number;
}) {
  if (points.length === 0) return null;
  const values = points.map((point) => point.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || max || 1;
  const floor = points.length > 1 ? min - span * 0.15 : 0;

  return (
    <View>
      {/* The bars are a picture of the numbers already read out below them, so
          they are one labelled image rather than N unlabelled rectangles. */}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Chart: ${points.length} points from ${points[0].value} to ${
          points[points.length - 1].value
        } ${unit}`}
        style={[styles.chart, { height }]}
      >
        {points.map((point, index) => {
          const ratio = Math.max(0.06, (point.value - floor) / (max - floor || 1));
          return (
            <View key={`${point.label}-${index}`} style={styles.chartColumn}>
              <View style={[styles.chartBar, { height: `${Math.round(ratio * 100)}%` }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.chartAxis}>
        <Caption>{`${points[0].label} · ${points[0].value} ${unit}`}</Caption>
        <Caption>{`${points[points.length - 1].label} · ${points[points.length - 1].value} ${unit}`}</Caption>
      </View>
    </View>
  );
}

/** A bottom sheet. Used by the substitution picker and the RPE notes. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  return (
    <Modal
      visible={visible}
      // The slide-up is decoration; with Reduce Motion on the sheet is simply
      // there. Nothing about its content changes.
      animationType={reducedMotion ? 'none' : 'slide'}
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.sheetBackdrop}>
        <View
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}
        >
          <View style={styles.sheetHead}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              accessibilityHint={`Closes ${title.toLowerCase()}`}
              hitSlop={TEXT_ACTION_HIT_SLOP}
              style={styles.sheetCloseHit}
            >
              <Text maxFontSizeMultiplier={2} style={styles.sheetClose}>
                Close
              </Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
    marginTop: space.lg,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  cardHeadText: { flex: 1, marginRight: space.md },
  cardTitle: {
    color: color.text,
    fontSize: fontSize.heading,
    fontWeight: fontWeight.semibold,
  },
  cardSubtitle: {
    color: color.textMuted,
    fontSize: fontSize.label,
    marginTop: 2,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xxl,
  },
  sectionHeadingText: {
    color: color.textMuted,
    fontSize: fontSize.label,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  body: {
    color: color.text,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.45,
  },
  bodyMuted: { color: color.textMuted },
  caption: {
    color: color.textFaint,
    fontSize: fontSize.caption,
  },
  numeralRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  numeral: {
    fontSize: fontSize.numeral,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  numeralUnit: {
    color: color.textMuted,
    fontSize: fontSize.label,
  },
  statTile: { flex: 1, minWidth: 90 },
  statLabel: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.lg,
    marginTop: space.sm,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.md,
    // A chip is a pill, not a button bar — it stays visually compact and the
    // Pressable around it carries `hitSlop` to reach 44 pt.
    minWidth: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: color.accentSoft,
    borderColor: color.accent,
  },
  chipAccent: { borderColor: color.accent },
  chipLabel: {
    color: color.textMuted,
    fontSize: fontSize.label,
  },
  chipLabelSelected: { color: color.accent, fontWeight: fontWeight.medium },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    minHeight: HIT_TARGET,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  listRowLast: { borderBottomWidth: 0 },
  listRowText: { flex: 1, marginRight: space.md },
  listRowTitle: {
    color: color.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  listRowSubtitle: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  pressed: { opacity: 0.6 },
  why: { marginTop: space.md },
  whyToggleHit: { paddingVertical: space.xs, alignSelf: 'flex-start' },
  whyToggle: {
    color: color.accent,
    fontSize: fontSize.label,
    fontWeight: fontWeight.medium,
  },
  whyBody: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surfaceRaised,
  },
  whySummary: {
    color: color.text,
    fontSize: fontSize.label,
    lineHeight: fontSize.label * 1.5,
  },
  whyCodes: {
    color: color.textFaint,
    fontSize: fontSize.caption,
    marginTop: space.sm,
  },
  empty: {
    paddingVertical: space.xl,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    color: color.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  emptyBlurb: {
    color: color.textMuted,
    fontSize: fontSize.label,
    marginTop: space.xs,
    lineHeight: fontSize.label * 1.5,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginTop: space.md,
  },
  chartColumn: { flex: 1, justifyContent: 'flex-end', height: '100%' },
  chartBar: {
    backgroundColor: color.accent,
    borderRadius: 2,
    width: '100%',
  },
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    maxHeight: '85%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  sheetTitle: {
    color: color.text,
    fontSize: fontSize.heading,
    fontWeight: fontWeight.semibold,
  },
  sheetCloseHit: { paddingVertical: space.xs, paddingLeft: space.md },
  sheetClose: {
    color: color.accent,
    fontSize: fontSize.label,
    fontWeight: fontWeight.semibold,
  },
});
