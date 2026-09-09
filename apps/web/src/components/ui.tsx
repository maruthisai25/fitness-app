/**
 * Shared chrome for every web section — Today, Train, session mode, Eat and
 * Progress. DESIGN.md §7.5: athletic and unfussy, one burnt-amber accent,
 * semantic colours reserved for readiness and target states, tabular numerals
 * wherever a number sits in a column. Colours come from CSS variables so the
 * theme repaints live.
 *
 * These only render. Every number they show has already been computed by a
 * `@vigor/core` engine or view-model builder (DESIGN.md §7.2, §11).
 */

import { fontFamily, radius, space } from '@vigor/ui-tokens';
import type { Rationale } from '@vigor/core';
import type { CSSProperties, ReactNode } from 'react';
import { useId, useState } from 'react';

import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

/** A titled block with an optional right-hand action. */
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
  /** `warn` is the alias the Eat and Progress screens use for `safety`. */
  tone?: 'surface' | 'raised' | 'safety' | 'warn' | 'accent';
}): ReactNode {
  const background =
    tone === 'raised'
      ? themeColor.surfaceRaised
      : tone === 'safety' || tone === 'warn'
        ? themeColor.safety
        : tone === 'accent'
          ? themeColor.accentSoft
          : themeColor.surface;
  return (
    <section
      style={{
        background,
        border: `1px solid ${themeColor.border}`,
        borderRadius: radius.lg,
        padding: space.lg,
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}): ReactNode {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: space.lg,
        flexWrap: 'wrap',
        marginBottom: space.lg,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            fontFamily: fontFamily.display,
            fontSize: fontSize.display,
            color: themeColor.text,
            margin: 0,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ color: themeColor.textMuted, margin: `${space.xs}px 0 0`, maxWidth: 640 }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: space.sm }}>{actions}</div>}
    </header>
  );
}

export function SectionHeading({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}): ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: space.md,
        marginBottom: space.sm,
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
        {children}
      </h2>
      {actions}
    </div>
  );
}

/** A number that sits in a column — tabular figures, condensed grotesk. */
export function Numeral({
  value,
  unit,
  style,
}: {
  value: string | number;
  unit?: string;
  style?: CSSProperties;
}): ReactNode {
  return (
    <span
      className="tabular"
      style={{
        fontFamily: fontFamily.display,
        fontSize: fontSize.title,
        color: themeColor.text,
        ...style,
      }}
    >
      {value}
      {unit && (
        <span style={{ fontSize: fontSize.label, color: themeColor.textMuted }}> {unit}</span>
      )}
    </span>
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
  value: string | number;
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
    <div style={{ minWidth: 96 }}>
      <div style={{ fontSize: fontSize.label, color: themeColor.textMuted }}>{label}</div>
      <Numeral value={value} unit={unit} style={{ color }} />
    </div>
  );
}

export function Pill({
  children,
  tone = 'neutral',
  onClick,
  pressed,
}: {
  children: ReactNode;
  /** `muted` is the Eat/Progress spelling of `neutral`. */
  tone?: 'neutral' | 'muted' | 'accent' | 'good' | 'warn' | 'bad';
  onClick?: () => void;
  pressed?: boolean;
}): ReactNode {
  const neutral = tone === 'neutral' || tone === 'muted';
  const toneColor =
    tone === 'accent'
      ? themeColor.accent
      : tone === 'good'
        ? themeColor.good
        : tone === 'warn'
          ? themeColor.warn
          : tone === 'bad'
            ? themeColor.bad
            : themeColor.borderStrong;
  const style: CSSProperties = {
    display: 'inline-block',
    padding: `${space.xs}px ${space.md}px`,
    borderRadius: radius.pill,
    border: `1px solid ${toneColor}`,
    background: pressed ? themeColor.accent : 'transparent',
    color: pressed ? themeColor.textOnAccent : neutral ? themeColor.textMuted : toneColor,
    fontSize: fontSize.label,
    cursor: onClick ? 'pointer' : 'default',
    whiteSpace: 'nowrap',
  };
  if (!onClick) return <span style={style}>{children}</span>;
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} style={style}>
      {children}
    </button>
  );
}

/**
 * DESIGN.md §2.3 / §11: every recommendation carries a rationale and the UI
 * always shows "Why?". Codes stay visible under the sentence so a decision can
 * be traced back to the rule that made it.
 */
export function WhyDisclosure({
  rationale,
  label = 'Why?',
}: {
  rationale: Rationale | null | undefined;
  label?: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!rationale) return null;
  return (
    <div style={{ marginTop: space.sm }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: themeColor.accent,
          fontSize: fontSize.label,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        {label}
      </button>
      {open && (
        <div
          id={id}
          style={{
            marginTop: space.xs,
            padding: space.md,
            borderRadius: radius.md,
            background: themeColor.surfaceRaised,
            border: `1px solid ${themeColor.border}`,
          }}
        >
          <p style={{ margin: 0, color: themeColor.text, fontSize: fontSize.body }}>
            {rationale.summary}
          </p>
          <p
            className="tabular"
            style={{
              margin: `${space.sm}px 0 0`,
              color: themeColor.textFaint,
              fontSize: fontSize.caption,
            }}
          >
            {rationale.codes.join(' · ')}
          </p>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }): ReactNode {
  return (
    <p
      style={{
        color: themeColor.textMuted,
        background: themeColor.surface,
        border: `1px dashed ${themeColor.border}`,
        borderRadius: radius.md,
        padding: space.lg,
        margin: 0,
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

/** A modal sheet — used for substitutions and confirmations in session mode. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: space.lg,
        zIndex: 40,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: themeColor.surface,
          border: `1px solid ${themeColor.borderStrong}`,
          borderRadius: radius.lg,
          padding: space.lg,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
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
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: themeColor.textMuted,
              fontSize: fontSize.body,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A horizontally scrollable wrapper so wide tables never scroll the page. */
export function ScrollX({ children }: { children: ReactNode }): ReactNode {
  return <div style={{ overflowX: 'auto', maxWidth: '100%' }}>{children}</div>;
}
