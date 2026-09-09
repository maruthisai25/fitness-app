/**
 * Presentational building blocks the Eat and Progress screens share, in the
 * DESIGN.md §7.5 language: deep green-black grounds, warm off-white text, burnt
 * amber for actions, semantic green/amber/red kept for target and readiness
 * states, tabular numerals wherever a number sits in a column.
 *
 * Nothing here computes anything a `@vigor/core` engine owns; every number
 * arrives already decided.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps, ViewStyle } from 'react-native';

import { ErrorBanner, Screen } from './components';
import { color, fontSize, fontWeight, radius, space } from './tokens';

/** A whole-screen failure, on the app ground with the usual padding. */
export function ErrorScreen({ message }: { message: string }) {
  return (
    <Screen>
      <ErrorBanner message={message} />
    </Screen>
  );
}

export type ToneName = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';

const TONE_COLOR: Record<ToneName, string> = {
  neutral: color.textMuted,
  good: color.good,
  warn: color.warn,
  bad: color.bad,
  accent: color.accent,
};

/** A bordered panel. `Section` wraps rows; `Card` wraps free-form content. */
export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.cardTitle}>{children}</Text>;
}

export function Body({ children, tone = 'neutral' }: { children: ReactNode; tone?: ToneName }) {
  return <Text style={[styles.body, { color: TONE_COLOR[tone] }]}>{children}</Text>;
}

export function Caption({ children, tone = 'neutral' }: { children: ReactNode; tone?: ToneName }) {
  return <Text style={[styles.caption, { color: TONE_COLOR[tone] }]}>{children}</Text>;
}

/** A big number with its unit and label — the stat blocks on Eat and Progress. */
export function Stat({
  label,
  value,
  unit,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: ToneName;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, { color: TONE_COLOR[tone] }]}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <View style={styles.statRow}>{children}</View>;
}

/** A left label / right value line. Values use tabular numerals. */
export function DataRow({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: string;
  tone?: ToneName;
  hint?: string;
}) {
  return (
    <View style={styles.dataRow}>
      <View style={styles.dataRowLabel}>
        <Text style={styles.dataRowLabelText}>{label}</Text>
        {hint ? <Text style={styles.caption}>{hint}</Text> : null}
      </View>
      <Text style={[styles.dataRowValue, { color: TONE_COLOR[tone] }]}>{value}</Text>
    </View>
  );
}

/** A horizontal fill showing `value / max`, clamped to the track. */
export function MeterBar({
  value,
  max,
  tone = 'accent',
}: {
  value: number;
  max: number;
  tone?: ToneName;
}) {
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={styles.meterTrack}>
      <View
        style={[styles.meterFill, { width: `${share * 100}%`, backgroundColor: TONE_COLOR[tone] }]}
      />
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  tone = 'neutral',
  onPress,
}: {
  label: string;
  selected?: boolean;
  tone?: ToneName;
  onPress?: () => void;
}) {
  const content = (
    <Text
      style={[
        styles.chipLabel,
        selected && styles.chipLabelSelected,
        tone !== 'neutral' && { color: TONE_COLOR[tone] },
      ]}
    >
      {label}
    </Text>
  );
  if (!onPress) {
    return <View style={[styles.chip, selected && styles.chipSelected]}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

/** A compact text action that sits inside a row, next to content. */
export function InlineAction({
  label,
  onPress,
  tone = 'accent',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: ToneName;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.inlineAction, pressed && !disabled && styles.chipPressed]}
    >
      <Text style={[styles.inlineActionLabel, { color: TONE_COLOR[tone] }, disabled && styles.dim]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ActionRow({ children }: { children: ReactNode }) {
  return <View style={styles.actionRow}>{children}</View>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

/** A short, quiet note — used for "why?" summaries and privacy statements. */
export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: ToneName }) {
  return (
    <View style={[styles.note, tone !== 'neutral' && { borderLeftColor: TONE_COLOR[tone] }]}>
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

/** A numeric text field. Keeps the raw string so a half-typed "1." survives. */
export function NumberField({
  label,
  value,
  onChangeText,
  suffix,
  hint,
  placeholder,
  ...rest
}: Omit<TextInputProps, 'value' | 'onChangeText'> & {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.numberRow}>
        <TextInput
          accessibilityLabel={label}
          inputMode="decimal"
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={color.textFaint}
          style={styles.numberInput}
          value={value}
          onChangeText={onChangeText}
          {...rest}
        />
        {suffix ? <Text style={styles.numberSuffix}>{suffix}</Text> : null}
      </View>
      {hint ? <Text style={styles.caption}>{hint}</Text> : null}
    </View>
  );
}

/** A plain text field with an accessible label, for names and notes. */
export function LabelledInput({
  label,
  hint,
  ...rest
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.textFaint}
        style={styles.numberInput}
        {...rest}
      />
      {hint ? <Text style={styles.caption}>{hint}</Text> : null}
    </View>
  );
}

/** Two-line list row with an optional trailing action. */
export function ItemRow({
  title,
  subtitle,
  value,
  tone = 'neutral',
  right,
  onPress,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  tone?: ToneName;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const inner = (
    <>
      <View style={styles.dataRowLabel}>
        <Text style={styles.itemTitle}>{title}</Text>
        {subtitle ? <Text style={styles.caption}>{subtitle}</Text> : null}
      </View>
      {value ? (
        <Text style={[styles.dataRowValue, { color: TONE_COLOR[tone] }]}>{value}</Text>
      ) : null}
      {right}
    </>
  );
  if (!onPress) return <View style={styles.itemRow}>{inner}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.itemRow, pressed && styles.cardPressed]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
    marginTop: space.md,
  },
  cardPressed: {
    backgroundColor: color.surfaceRaised,
  },
  cardTitle: {
    color: color.text,
    fontSize: fontSize.heading,
    fontWeight: fontWeight.semibold,
  },
  body: {
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.4,
  },
  caption: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  stat: {
    flex: 1,
  },
  statRow: {
    flexDirection: 'row',
    gap: space.lg,
    marginTop: space.md,
  },
  statLabel: {
    color: color.textMuted,
    fontSize: fontSize.label,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 2,
  },
  statValue: {
    fontSize: fontSize.numeral,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    color: color.textMuted,
    fontSize: fontSize.label,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    gap: space.md,
  },
  dataRowLabel: {
    flex: 1,
  },
  dataRowLabelText: {
    color: color.text,
    fontSize: fontSize.body,
  },
  dataRowValue: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  meterTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceRaised,
    overflow: 'hidden',
    marginTop: space.xs,
  },
  meterFill: {
    height: 6,
    borderRadius: radius.pill,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  chipSelected: {
    backgroundColor: color.accentSoft,
    borderColor: color.accent,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipLabel: {
    color: color.textMuted,
    fontSize: fontSize.label,
    fontWeight: fontWeight.medium,
  },
  chipLabelSelected: {
    color: color.accent,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  inlineAction: {
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
  },
  inlineActionLabel: {
    fontSize: fontSize.label,
    fontWeight: fontWeight.semibold,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.xs,
  },
  dim: {
    opacity: 0.5,
  },
  empty: {
    paddingVertical: space.xl,
    gap: space.xs,
  },
  emptyTitle: {
    color: color.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  emptyDetail: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * 1.5,
  },
  note: {
    borderLeftWidth: 2,
    borderLeftColor: color.borderStrong,
    paddingLeft: space.md,
    marginTop: space.md,
  },
  noteText: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * 1.5,
  },
  field: {
    marginTop: space.md,
  },
  fieldLabel: {
    color: color.textMuted,
    fontSize: fontSize.label,
    fontWeight: fontWeight.medium,
    marginBottom: space.xs,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  numberInput: {
    flex: 1,
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    color: color.text,
    fontSize: fontSize.body,
  },
  numberSuffix: {
    color: color.textMuted,
    fontSize: fontSize.label,
    minWidth: 28,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  itemTitle: {
    color: color.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
});
