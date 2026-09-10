/**
 * The shell's shared chrome: screens, sections, buttons, fields and rows.
 *
 * Accessibility contract for everything in this file (WCAG 2.2 AA, and the
 * platform conventions VoiceOver/TalkBack expect):
 *  - every pressable carries a role, a label and — where it has one — a state
 *    (`disabled`, `busy`, `selected`, `checked`);
 *  - every target is at least `HIT_TARGET` (44 pt) tall, by real height where
 *    the layout allows and by `hitSlop` where the ink is only a line tall;
 *  - every input is labelled, and its hint is exposed as an accessibility hint
 *    rather than only as small print;
 *  - text colours come from `color`, which is contrast-corrected in
 *    `tokens.ts`, so every pairing here clears 4.5:1.
 */
import {
  color,
  fontSize,
  fontWeight,
  HIT_TARGET,
  radius,
  space,
  TEXT_ACTION_HIT_SLOP,
} from './tokens';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { TextInputProps, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Full-screen scroll container with the app ground and standard padding. */
export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={[styles.screen, style]}
      contentContainerStyle={{
        paddingTop: insets.top + space.xl,
        paddingBottom: insets.bottom + space.xxxl,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/** The one `header` on a screen — the first thing a rotor lands on. */
export function ScreenTitle({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}

export function ScreenBlurb({ children }: { children: ReactNode }) {
  return <Text style={styles.blurb}>{children}</Text>;
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? (
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
      ) : null}
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  /** Spoken after the label — what happens, not what it says. */
  hint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  testID,
  hint,
}: ButtonProps) {
  const inactive = Boolean(disabled) || Boolean(loading);
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      // `busy` is what tells a screen reader the tap landed and work is under
      // way; without it a loading button just reads as unresponsive.
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          accessibilityElementsHidden
          importantForAccessibility="no"
          color={variant === 'secondary' ? color.text : color.textOnAccent}
        />
      ) : (
        <Text
          maxFontSizeMultiplier={2}
          style={[
            styles.buttonLabel,
            variant === 'secondary' && styles.buttonLabelSecondary,
            variant === 'danger' && styles.buttonLabelDanger,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function LinkRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
    >
      <View style={styles.linkRowText}>
        <Text style={styles.linkRowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.linkRowSubtitle}>{subtitle}</Text> : null}
      </View>
      {/* Decorative: the row already announces itself as a link. */}
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={styles.linkRowChevron}
      >
        {'›'}
      </Text>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <Text style={styles.fieldHint}>{children}</Text>;
}

export function TextField(props: TextInputProps & { label: string; hint?: string }) {
  const { label, hint, style, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={color.textFaint}
        style={[styles.input, style]}
        {...inputProps}
      />
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </View>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.linkRowText}>
        <Text style={styles.linkRowTitle}>{label}</Text>
        {hint ? <Text style={styles.linkRowSubtitle}>{hint}</Text> : null}
      </View>
      <Switch
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ checked: value, disabled: false }}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: color.borderStrong, true: color.accent }}
        thumbColor={color.text}
      />
    </View>
  );
}

/** A row of mutually-exclusive text choices, e.g. metric vs imperial. */
export function ChoiceRow<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choiceRow} accessibilityRole="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active, checked: active, disabled: false }}
            style={[styles.choiceChip, active && styles.choiceChipActive]}
          >
            <Text
              maxFontSizeMultiplier={2}
              style={[styles.choiceChipLabel, active && styles.choiceChipLabelActive]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={message}
      style={styles.errorBanner}
    >
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  );
}

export function LoadingScreen({ label }: { label: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={styles.loadingScreen}
    >
      <ActivityIndicator
        accessibilityElementsHidden
        importantForAccessibility="no"
        color={color.accent}
        size="large"
      />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
  );
}

/**
 * A compact text action inside a row ("Edit", "Resolve", "Undo"). The ink is
 * one line tall, so the target is grown with `hitSlop` rather than padding
 * that would push the row apart.
 */
export function TextAction({
  label,
  onPress,
  tone = 'accent',
  disabled = false,
  busy = false,
  hint,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'muted' | 'warn' | 'bad';
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
  testID?: string;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: inactive, busy }}
      hitSlop={TEXT_ACTION_HIT_SLOP}
      style={({ pressed }) => [styles.textAction, pressed && !inactive && styles.textActionPressed]}
    >
      <Text
        maxFontSizeMultiplier={2}
        style={[
          styles.textActionLabel,
          tone === 'muted' && { color: color.textMuted },
          tone === 'warn' && { color: color.warn },
          tone === 'bad' && { color: color.bad },
          inactive && styles.textActionDim,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
    paddingHorizontal: space.xl,
  },
  title: {
    color: color.text,
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.4,
  },
  blurb: {
    color: color.textMuted,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.45,
    marginTop: space.md,
  },
  section: {
    marginTop: space.xxl,
  },
  sectionTitle: {
    color: color.textMuted,
    fontSize: fontSize.label,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: space.sm,
  },
  sectionCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    overflow: 'hidden',
  },
  button: {
    backgroundColor: color.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
    // WCAG 2.5.5 / iOS HIG: a primary action is never smaller than 44 pt.
    minHeight: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
  },
  buttonPressed: {
    backgroundColor: color.accentPressed,
  },
  buttonSecondary: {
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  buttonDanger: {
    backgroundColor: color.bad,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: color.textOnAccent,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  buttonLabelSecondary: {
    color: color.text,
  },
  buttonLabelDanger: {
    // The danger ground is a light red once contrast-corrected, so the label
    // that reads on it is the dark ink, not the off-white one.
    color: color.textOnAccent,
  },
  textAction: {
    paddingVertical: space.xs,
    justifyContent: 'center',
  },
  textActionPressed: {
    opacity: 0.6,
  },
  textActionLabel: {
    color: color.accent,
    fontSize: fontSize.label,
    fontWeight: fontWeight.semibold,
  },
  textActionDim: {
    opacity: 0.5,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    minHeight: HIT_TARGET,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  linkRowPressed: {
    backgroundColor: color.surfaceRaised,
  },
  linkRowText: {
    flex: 1,
    marginRight: space.md,
  },
  linkRowTitle: {
    color: color.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  linkRowSubtitle: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  linkRowChevron: {
    color: color.textFaint,
    fontSize: fontSize.heading,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    minHeight: HIT_TARGET,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  field: {
    marginBottom: space.lg,
  },
  fieldLabel: {
    color: color.textMuted,
    fontSize: fontSize.label,
    fontWeight: fontWeight.medium,
    marginBottom: space.xs,
  },
  fieldHint: {
    color: color.textFaint,
    fontSize: fontSize.caption,
    marginTop: space.xs,
  },
  input: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: HIT_TARGET,
    color: color.text,
    fontSize: fontSize.body,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  choiceChip: {
    flex: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingVertical: space.sm,
    minHeight: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceChipActive: {
    backgroundColor: color.accentSoft,
    borderColor: color.accent,
  },
  choiceChipLabel: {
    color: color.textMuted,
    fontSize: fontSize.label,
    fontWeight: fontWeight.medium,
  },
  choiceChipLabelActive: {
    color: color.accent,
  },
  errorBanner: {
    backgroundColor: color.safety,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.lg,
  },
  errorBannerText: {
    color: color.text,
    fontSize: fontSize.body,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
  },
  loadingLabel: {
    color: color.textMuted,
    fontSize: fontSize.body,
  },
});
