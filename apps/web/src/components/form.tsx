import { radius, space } from '@vigor/ui-tokens';
import type { CSSProperties, ReactNode } from 'react';

import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

/** Small form primitives shared by onboarding and the You section (DESIGN.md §7.1, §9). */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <label style={{ display: 'block', marginBottom: space.md }}>
      <span
        style={{
          display: 'block',
          fontSize: fontSize.label,
          color: themeColor.textMuted,
          marginBottom: space.xs,
        }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span
          style={{
            display: 'block',
            fontSize: fontSize.caption,
            color: themeColor.textFaint,
            marginTop: space.xs,
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: `${space.sm}px ${space.md}px`,
  borderRadius: radius.sm,
  border: `1px solid ${themeColor.border}`,
  background: themeColor.surface,
  color: themeColor.text,
  fontSize: fontSize.body,
};

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  style?: CSSProperties;
}): ReactNode {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      inputMode={inputMode}
      style={{ ...inputStyle, ...style }}
    />
  );
}

export function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}): ReactNode {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
      {children}
    </select>
  );
}

function buttonStyle(kind: 'primary' | 'secondary'): CSSProperties {
  return {
    padding: `${space.sm}px ${space.lg}px`,
    borderRadius: radius.md,
    border: kind === 'secondary' ? `1px solid ${themeColor.border}` : 'none',
    background: kind === 'primary' ? themeColor.accent : 'transparent',
    color: kind === 'primary' ? themeColor.textOnAccent : themeColor.text,
    fontSize: fontSize.body,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

export function PrimaryButton({
  onClick,
  disabled,
  children,
  style,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ ...buttonStyle('primary'), opacity: disabled ? 0.5 : 1, ...style }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ ...buttonStyle('secondary'), opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </button>
  );
}
