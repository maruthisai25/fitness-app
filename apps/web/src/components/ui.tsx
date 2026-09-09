/**
 * Layout primitives shared by the Eat and Progress tabs.
 *
 * These only render. Every number they show has already been computed by a
 * `@vigor/core` engine or view-model builder (DESIGN.md §7.2, §11).
 */

import { fontFamily, radius, space } from '@vigor/ui-tokens';
import type { CSSProperties, ReactNode } from 'react';

import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

export function Section({
  title,
  action,
  children,
  style,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}): ReactNode {
  return (
    <section style={{ marginBottom: space.xxl, ...style }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: space.md,
          marginBottom: space.md,
        }}
      >
        <h2
          style={{
            fontFamily: fontFamily.display,
            fontSize: fontSize.heading,
            color: themeColor.text,
            margin: 0,
          }}
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({
  children,
  style,
  tone = 'surface',
}: {
  children: ReactNode;
  style?: CSSProperties;
  tone?: 'surface' | 'raised' | 'warn' | 'accent';
}): ReactNode {
  const background =
    tone === 'raised'
      ? themeColor.surfaceRaised
      : tone === 'warn'
        ? themeColor.safety
        : tone === 'accent'
          ? themeColor.accentSoft
          : themeColor.surface;
  return (
    <div
      style={{
        background,
        border: `1px solid ${themeColor.border}`,
        borderRadius: radius.md,
        padding: space.lg,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** One big number with a caption. Always tabular (DESIGN.md §7.5). */
export function Stat({
  label,
  value,
  unit,
  tone = 'text',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'text' | 'good' | 'warn' | 'bad' | 'accent';
}): ReactNode {
  const color =
    tone === 'good'
      ? themeColor.good
      : tone === 'warn'
        ? themeColor.warn
        : tone === 'bad'
          ? themeColor.bad
          : tone === 'accent'
            ? themeColor.accent
            : themeColor.text;
  return (
    <div>
      <div style={{ fontSize: fontSize.label, color: themeColor.textMuted }}>{label}</div>
      <div
        className="tabular"
        style={{
          fontFamily: fontFamily.display,
          fontSize: 26,
          lineHeight: 1.1,
          fontWeight: 600,
          color,
        }}
      >
        {value}
        {unit ? (
          <span style={{ fontSize: fontSize.label, color: themeColor.textMuted }}> {unit}</span>
        ) : null}
      </div>
    </div>
  );
}

export function Pill({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'good' | 'warn' | 'bad' | 'accent';
}): ReactNode {
  const color =
    tone === 'good'
      ? themeColor.good
      : tone === 'warn'
        ? themeColor.warn
        : tone === 'bad'
          ? themeColor.bad
          : tone === 'accent'
            ? themeColor.accent
            : themeColor.textMuted;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: `2px ${space.sm}px`,
        borderRadius: radius.pill,
        border: `1px solid ${color}`,
        color,
        fontSize: fontSize.caption,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }): ReactNode {
  return (
    <p
      style={{
        color: themeColor.textMuted,
        fontSize: fontSize.body,
        margin: 0,
        padding: `${space.lg}px 0`,
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}

/** A one-line note that explains a limitation honestly, never an error dump. */
export function Notice({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'warn' | 'accent';
}): ReactNode {
  return (
    <div
      role="note"
      style={{
        background: tone === 'accent' ? themeColor.accentSoft : themeColor.surfaceRaised,
        border: `1px solid ${tone === 'warn' ? themeColor.warn : themeColor.border}`,
        borderRadius: radius.md,
        padding: space.md,
        color: themeColor.text,
        fontSize: fontSize.label,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

/** Previous / today / next day stepper, shared by the Eat day view. */
export function DateStepper({
  date,
  onChange,
  today,
}: {
  date: string;
  onChange: (next: string) => void;
  today: string;
}): ReactNode {
  const shift = (days: number): void => {
    const [y, m, d] = date.split('-').map(Number);
    const shifted = new Date(Date.UTC(y, m - 1, d + days));
    onChange(shifted.toISOString().slice(0, 10));
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
      <StepButton label="Previous day" onClick={() => shift(-1)}>
        ‹
      </StepButton>
      <input
        type="date"
        aria-label="Date"
        value={date}
        onChange={(event) => onChange(event.target.value)}
        className="tabular"
        style={{
          padding: `${space.xs}px ${space.sm}px`,
          borderRadius: radius.sm,
          border: `1px solid ${themeColor.border}`,
          background: themeColor.surface,
          color: themeColor.text,
          fontSize: fontSize.body,
        }}
      />
      <StepButton label="Next day" onClick={() => shift(1)}>
        ›
      </StepButton>
      {date !== today && (
        <button
          type="button"
          onClick={() => onChange(today)}
          style={{
            border: 'none',
            background: 'transparent',
            color: themeColor.accent,
            cursor: 'pointer',
            fontSize: fontSize.label,
          }}
        >
          Today
        </button>
      )}
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: radius.sm,
        border: `1px solid ${themeColor.border}`,
        background: themeColor.surface,
        color: themeColor.text,
        cursor: 'pointer',
        fontSize: fontSize.subheading,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

/** A small destructive/secondary inline action. */
export function LinkButton({
  onClick,
  children,
  tone = 'muted',
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  tone?: 'muted' | 'accent' | 'bad';
  disabled?: boolean;
}): ReactNode {
  const color =
    tone === 'accent' ? themeColor.accent : tone === 'bad' ? themeColor.bad : themeColor.textMuted;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 'none',
        background: 'transparent',
        padding: 0,
        color,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: fontSize.label,
        textDecoration: 'underline',
      }}
    >
      {children}
    </button>
  );
}

/** The pill navigation both sections use under their heading. */
export function TabStripStyle(isActive: boolean): CSSProperties {
  return {
    padding: `${space.xs}px ${space.md}px`,
    borderRadius: radius.pill,
    textDecoration: 'none',
    fontSize: fontSize.label,
    color: isActive ? themeColor.textOnAccent : themeColor.textMuted,
    background: isActive ? themeColor.accent : themeColor.surfaceRaised,
  };
}
