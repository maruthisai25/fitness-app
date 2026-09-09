import { color, fontSize, fontWeight, radius, space } from './tokens';
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

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function ScreenBlurb({ children }: { children: ReactNode }) {
  return <Text style={styles.blurb}>{children}</Text>;
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
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
}

export function Button({ label, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? color.text : color.textOnAccent} />
      ) : (
        <Text
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
      style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
    >
      <View style={styles.linkRowText}>
        <Text style={styles.linkRowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.linkRowSubtitle}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.linkRowChevron}>{'›'}</Text>
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
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.choiceChip, active && styles.choiceChipActive]}
          >
            <Text style={[styles.choiceChipLabel, active && styles.choiceChipLabelActive]}>
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
    <View style={styles.errorBanner}>
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  );
}

export function LoadingScreen({ label }: { label: string }) {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator color={color.accent} size="large" />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
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
    color: color.text,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
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
    alignItems: 'center',
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
