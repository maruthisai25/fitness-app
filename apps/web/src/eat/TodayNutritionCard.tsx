/**
 * The nutrition card the Today tab shows — DESIGN.md §7.1: "nutrition ring with
 * remaining macros".
 *
 * Exported for the orchestrator to place on Today; this file never touches the
 * Today screen itself. It reads the day through `buildDayNutrition` and clamps
 * with `clampMacros`, so the number here and the number on the Eat tab are the
 * same engine output (DESIGN.md §5.6).
 */

import { clampMacros, type LocalDate } from '@vigor/core';
import { fontFamily, radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { useDayNutrition } from './data';

const RING_SIZE = 92;
const RING_STROKE = 9;

function Ring({
  consumed,
  target,
  color,
}: {
  consumed: number;
  target: number | null;
  color: string;
}): ReactNode {
  const radiusPx = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radiusPx;
  const share = target && target > 0 ? Math.min(1, consumed / target) : 0;
  return (
    <>
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={radiusPx}
        fill="none"
        stroke={themeColor.surfaceRaised}
        strokeWidth={RING_STROKE}
      />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={radiusPx}
        fill="none"
        stroke={color}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={`${share * circumference} ${circumference}`}
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
      />
    </>
  );
}

/**
 * @param date the calendar day to summarise, usually the user's today.
 */
export function TodayNutritionCard({ date }: { date: LocalDate }): ReactNode {
  const day = useDayNutrition(date);

  const targets = day.data?.targets ?? null;
  const remaining = clampMacros(
    day.data?.remaining ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
  const consumed = day.data?.consumed ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

  return (
    <div
      style={{
        background: themeColor.surface,
        border: `1px solid ${themeColor.border}`,
        borderRadius: radius.md,
        padding: space.lg,
      }}
    >
      <Link
        to="/eat/day"
        aria-label="Open the Eat tab"
        style={{ display: 'block', textDecoration: 'none' }}
      >
        <p
          style={{
            margin: `0 0 ${space.md}px`,
            color: themeColor.textMuted,
            fontSize: fontSize.label,
          }}
        >
          {targets == null
            ? 'No targets set yet'
            : day.isPending
              ? 'Reading today’s log…'
              : 'Left today'}
        </p>

        {targets == null ? (
          <p
            style={{ margin: 0, color: themeColor.text, fontSize: fontSize.body, lineHeight: 1.5 }}
          >
            Set calorie and macro targets in Eat → Targets and this card starts counting down.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: space.xl, alignItems: 'center', flexWrap: 'wrap' }}>
            <RingStat
              label="Calories"
              remaining={remaining.kcal}
              unit="kcal"
              consumed={consumed.kcal}
              target={targets.kcal}
              color={themeColor.accent}
            />
            <RingStat
              label="Protein"
              remaining={remaining.proteinG}
              unit="g"
              consumed={consumed.proteinG}
              target={targets.proteinG}
              color={themeColor.good}
            />
          </div>
        )}
      </Link>

      {/* DESIGN.md §7.1 lists "quick log" on Today in its own right: this
          lands on the add-food form for this day, not on the day list. */}
      <Link
        to={`/eat/add?date=${date}`}
        style={{
          display: 'inline-block',
          marginTop: space.md,
          color: themeColor.accent,
          fontSize: fontSize.label,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Log food →
      </Link>
    </div>
  );
}

function RingStat({
  label,
  remaining,
  unit,
  consumed,
  target,
  color,
}: {
  label: string;
  remaining: number;
  unit: string;
  consumed: number;
  target: number;
  color: string;
}): ReactNode {
  return (
    <div style={{ display: 'flex', gap: space.md, alignItems: 'center' }}>
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        role="img"
        aria-label={`${label}: ${Math.round(remaining)} ${unit} left of ${Math.round(target)}`}
      >
        <Ring consumed={consumed} target={target} color={color} />
        <text
          x={RING_SIZE / 2}
          y={RING_SIZE / 2 + 2}
          textAnchor="middle"
          fill={themeColor.text}
          fontSize={20}
          fontFamily={fontFamily.display}
          fontWeight={600}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(remaining)}
        </text>
        <text
          x={RING_SIZE / 2}
          y={RING_SIZE / 2 + 18}
          textAnchor="middle"
          fill={themeColor.textMuted}
          fontSize={10}
        >
          {unit} left
        </text>
      </svg>
      <div>
        <div style={{ color: themeColor.text, fontSize: fontSize.label, fontWeight: 600 }}>
          {label}
        </div>
        <div
          className="tabular"
          style={{ color: themeColor.textMuted, fontSize: fontSize.caption }}
        >
          {Math.round(consumed)} / {Math.round(target)} {unit}
        </div>
      </div>
    </div>
  );
}
