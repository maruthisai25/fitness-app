/**
 * Estimated-1RM trend — DESIGN.md §7.1 ("per-exercise stats"). The points come
 * from `buildExerciseStats` (§7.2); this only draws them. Inline SVG, one
 * series in the accent colour, tabular labels at the ends.
 */

import { space } from '@vigor/ui-tokens';
import type { LocalDate } from '@vigor/core';
import type { ReactNode } from 'react';

import { formatDate } from '../lib/localDate';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

export interface ChartPoint {
  date: LocalDate;
  value: number;
}

const WIDTH = 640;
const HEIGHT = 180;
const PAD = 28;

export function E1rmChart({
  points,
  unit,
  label,
}: {
  /** Oldest first. */
  points: readonly ChartPoint[];
  unit: string;
  label: string;
}): ReactNode {
  if (points.length < 2) {
    return (
      <p style={{ color: themeColor.textMuted, fontSize: fontSize.label }}>
        Two logged sessions draw the trend line — one more to go.
      </p>
    );
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (WIDTH - PAD * 2) / (points.length - 1);

  const coords = points.map((point, index) => ({
    x: PAD + index * stepX,
    y: HEIGHT - PAD - ((point.value - min) / range) * (HEIGHT - PAD * 2),
    point,
  }));
  const path = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ color: themeColor.textMuted, fontSize: fontSize.label }}>
        {label}
      </figcaption>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          height={HEIGHT}
          role="img"
          aria-label={`${label}: ${min} to ${max} ${unit} across ${points.length} sessions`}
          style={{ minWidth: 320, display: 'block' }}
        >
          <line
            x1={PAD}
            y1={HEIGHT - PAD}
            x2={WIDTH - PAD}
            y2={HEIGHT - PAD}
            stroke={themeColor.border}
            strokeWidth={1}
          />
          <path d={path} fill="none" stroke={themeColor.accent} strokeWidth={2} />
          {coords.map((c) => (
            <circle key={c.point.date + c.x} cx={c.x} cy={c.y} r={3} fill={themeColor.accent} />
          ))}
          <text x={PAD} y={16} fill={themeColor.textMuted} fontSize={12}>
            {max} {unit}
          </text>
          <text x={PAD} y={HEIGHT - 6} fill={themeColor.textFaint} fontSize={12}>
            {formatDate(points[0].date)}
          </text>
          <text
            x={WIDTH - PAD}
            y={HEIGHT - 6}
            fill={themeColor.textFaint}
            fontSize={12}
            textAnchor="end"
          >
            {formatDate(points[points.length - 1].date)}
          </text>
        </svg>
      </div>
      <p
        className="tabular"
        style={{ color: themeColor.textFaint, fontSize: fontSize.caption, marginTop: space.xs }}
      >
        Low {min} {unit} · high {max} {unit}
      </p>
    </figure>
  );
}
