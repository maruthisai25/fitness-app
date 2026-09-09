/**
 * Shared chrome for the Train, Today and session screens — DESIGN.md §7.5:
 * athletic and unfussy, one burnt-amber accent, semantic colours reserved for
 * readiness and target states, tabular numerals wherever a number sits in a
 * column. Colours come from CSS variables so the theme repaints live.
 */

import { fontFamily, radius, space } from '@vigor/ui-tokens';
import type { Rationale } from '@vigor/core';
import type { CSSProperties, ReactNode } from 'react';
import { useId, useState } from 'react';

import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

export function Card({
  children,
  style,
  tone = 'surface',
}: {
  children: ReactNode;
  style?: CSSProperties;
  tone?: 'surface' | 'raised' | 'safety';
}): ReactNode {
  const background =
    tone === 'raised'
      ? themeColor.surfaceRaised
      : tone === 'safety'
        ? themeColor.safety
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

export function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}): ReactNode {
  return (
    <div style={{ minWidth: 96 }}>
      <div style={{ fontSize: fontSize.label, color: themeColor.textMuted }}>{label}</div>
      <Numeral value={value} unit={unit} />
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
  tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad';
  onClick?: () => void;
  pressed?: boolean;
}): ReactNode {
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
    color: pressed
      ? themeColor.textOnAccent
      : tone === 'neutral'
        ? themeColor.textMuted
        : toneColor,
    fontSize: fontSize.label,
    cursor: onClick ? 'pointer' : 'default',
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
      }}
    >
      {children}
    </p>
  );
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
