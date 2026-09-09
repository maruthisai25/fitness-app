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
 */
import type { Rationale } from '@vigor/core';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, fontSize, fontWeight, radius, space } from './tokens';

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
            {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
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
      <Text style={styles.sectionHeadingText}>{children}</Text>
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

/** A number that sits in a column: tabular figures, condensed weight. */
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
    <View style={styles.numeralRow}>
      <Text style={[styles.numeral, toneStyle(tone)]}>{value}</Text>
      {unit ? <Text style={styles.numeralUnit}>{unit}</Text> : null}
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
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
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
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
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
export function WhyDisclosure({ rationale, label = 'Why?' }: { rationale: Rationale | null; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!rationale) return null;
  return (
    <View style={styles.why}>
      <Pressable onPress={() => setOpen((value) => !value)} accessibilityRole="button">
        <Text style={styles.whyToggle}>{open ? `Hide ${label.toLowerCase()}` : label}</Text>
      </Pressable>
      {open ? (
        <View style={styles.whyBody}>
          <Text style={styles.whySummary}>{rationale.summary}</Text>
          {rationale.codes.length > 0 ? (
            <Text style={styles.whyCodes}>{rationale.codes.join(' · ')}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Nothing here yet, and what to do about it. */
export function EmptyState({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <View style={styles.empty}>
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
      <View style={[styles.chart, { height }]}>
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
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.sheetClose}>Close</Text>
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
  sheetClose: {
    color: color.accent,
    fontSize: fontSize.label,
  },
});
