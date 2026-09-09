/**
 * Inline SVG charts — no chart library (brief), drawn to scale from the points
 * `buildProgressSeries` already produced (DESIGN.md §7.2: components only
 * render).
 *
 * Every chart here is single-series, so there is no legend box: the title names
 * the series and the mark carries no identity of its own. Grid and axes are
 * recessive, the line is 2 px, markers are 8 px, bar ends are 4 px rounded and
 * anchored to the baseline, and each chart ships a hidden data table so the
 * numbers are reachable without reading the picture.
 */

import { radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useId, useState } from 'react';

import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

export interface ChartPoint {
  /** X label, usually a `YYYY-MM-DD`. */
  label: string;
  /** The value as the user reads it — already converted to display units. */
  value: number;
}

const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

function niceBounds(values: readonly number[], includeZero: boolean): [number, number] {
  const min = includeZero ? Math.min(0, ...values) : Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [min === 0 ? 0 : min - 1, max + 1];
  const pad = (max - min) * 0.1;
  return [includeZero ? min : min - pad, max + pad];
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** `2026-09-10` → `10 Sep`. Falls back to the raw label for anything else. */
export function shortDate(label: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (!match) return label;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]}`;
}

function DataTable({
  id,
  caption,
  unit,
  points,
}: {
  id: string;
  caption: string;
  unit: string;
  points: readonly ChartPoint[];
}): ReactNode {
  return (
    <details style={{ marginTop: space.sm }}>
      <summary
        style={{ cursor: 'pointer', color: themeColor.textMuted, fontSize: fontSize.caption }}
      >
        Show the numbers
      </summary>
      <table
        id={id}
        className="tabular"
        style={{
          borderCollapse: 'collapse',
          marginTop: space.sm,
          fontSize: fontSize.caption,
          color: themeColor.textMuted,
        }}
      >
        <caption style={{ textAlign: 'left', paddingBottom: space.xs }}>{caption}</caption>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', paddingRight: space.md }}>When</th>
            <th style={{ textAlign: 'right' }}>{unit}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <td style={{ paddingRight: space.md }}>{point.label}</td>
              <td style={{ textAlign: 'right' }}>{formatValue(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function ChartFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ marginBottom: space.xs }}>
        <span style={{ color: themeColor.text, fontSize: fontSize.body, fontWeight: 600 }}>
          {title}
        </span>
        {subtitle && (
          <span
            style={{
              display: 'block',
              color: themeColor.textMuted,
              fontSize: fontSize.caption,
              marginTop: 2,
            }}
          >
            {subtitle}
          </span>
        )}
      </figcaption>
      {children}
    </figure>
  );
}

/** A time series: 2 px line, dots at every point, hover crosshair and readout. */
export function LineChart({
  title,
  subtitle,
  unit,
  points,
  width = 560,
  height = 200,
  includeZero = false,
}: {
  title: string;
  subtitle?: string;
  unit: string;
  points: readonly ChartPoint[];
  width?: number;
  height?: number;
  includeZero?: boolean;
}): ReactNode {
  const tableId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle}>
        <p style={{ color: themeColor.textMuted, fontSize: fontSize.label, margin: 0 }}>
          Nothing logged in this window yet.
        </p>
      </ChartFrame>
    );
  }

  const values = points.map((point) => point.value);
  const [low, high] = niceBounds(values, includeZero);
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const x = (index: number): number =>
    PAD.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number): number =>
    PAD.top + plotHeight - ((value - low) / (high - low)) * plotHeight;

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(point.value)}`).join(' ');
  const gridValues = [low, (low + high) / 2, high];
  const active = hover != null ? points[hover] : null;

  return (
    <ChartFrame title={title} subtitle={subtitle}>
      <svg
        role="img"
        aria-label={`${title}: ${points.length} points from ${points[0].label} to ${points[points.length - 1].label}, in ${unit}`}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHover(null)}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke={themeColor.border}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y(value) + 4}
              textAnchor="end"
              fontSize={11}
              fill={themeColor.textFaint}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatValue(value)}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke={themeColor.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((point, index) => (
          <circle
            key={point.label}
            cx={x(index)}
            cy={y(point.value)}
            r={hover === index ? 5 : 3.5}
            fill={themeColor.accent}
            stroke={themeColor.bg}
            strokeWidth={2}
          />
        ))}

        {/* Hit targets wider than the marks — interaction.md. */}
        {points.map((point, index) => (
          <rect
            key={`hit-${point.label}`}
            x={x(index) - Math.max(8, plotWidth / points.length / 2)}
            y={PAD.top}
            width={Math.max(16, plotWidth / points.length)}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}

        {active && hover != null && (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotHeight}
              stroke={themeColor.borderStrong}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={Math.min(x(hover) + 8, width - PAD.right)}
              y={PAD.top + 12}
              textAnchor={x(hover) > width / 2 ? 'end' : 'start'}
              fontSize={12}
              fill={themeColor.text}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {`${shortDate(active.label)} · ${formatValue(active.value)} ${unit}`}
            </text>
          </g>
        )}

        <text x={PAD.left} y={height - 8} fontSize={11} fill={themeColor.textFaint}>
          {shortDate(points[0].label)}
        </text>
        {points.length > 1 && (
          <text
            x={width - PAD.right}
            y={height - 8}
            textAnchor="end"
            fontSize={11}
            fill={themeColor.textFaint}
          >
            {shortDate(points[points.length - 1].label)}
          </text>
        )}
      </svg>
      <DataTable id={tableId} caption={title} unit={unit} points={points} />
    </ChartFrame>
  );
}

/** Magnitude by bucket: 4 px rounded ends on the baseline, 2 px gap between bars. */
export function BarChart({
  title,
  subtitle,
  unit,
  points,
  width = 560,
  height = 200,
  /** Fixed ceiling, e.g. 1 for a completion rate. Otherwise the max point. */
  maxValue,
  labelEvery = 1,
}: {
  title: string;
  subtitle?: string;
  unit: string;
  points: readonly ChartPoint[];
  width?: number;
  height?: number;
  maxValue?: number;
  labelEvery?: number;
}): ReactNode {
  const tableId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle}>
        <p style={{ color: themeColor.textMuted, fontSize: fontSize.label, margin: 0 }}>
          Nothing logged in this window yet.
        </p>
      </ChartFrame>
    );
  }

  const top = Math.max(maxValue ?? 0, ...points.map((point) => point.value)) || 1;
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const slot = plotWidth / points.length;
  const barWidth = Math.max(4, slot - 2);
  const baseline = PAD.top + plotHeight;
  const active = hover != null ? points[hover] : null;

  return (
    <ChartFrame title={title} subtitle={subtitle}>
      <svg
        role="img"
        aria-label={`${title}: ${points.length} bars, in ${unit}`}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHover(null)}
      >
        {[0, top / 2, top].map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={baseline - (value / top) * plotHeight}
              y2={baseline - (value / top) * plotHeight}
              stroke={themeColor.border}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={baseline - (value / top) * plotHeight + 4}
              textAnchor="end"
              fontSize={11}
              fill={themeColor.textFaint}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatValue(value)}
            </text>
          </g>
        ))}

        {points.map((point, index) => {
          const barHeight = Math.max(0, (point.value / top) * plotHeight);
          return (
            <g key={point.label} onMouseEnter={() => setHover(index)}>
              <rect
                x={PAD.left + index * slot + 1}
                y={PAD.top}
                width={barWidth}
                height={plotHeight}
                fill="transparent"
              />
              <rect
                x={PAD.left + index * slot + 1}
                y={baseline - barHeight}
                width={barWidth}
                height={barHeight}
                rx={Math.min(4, barWidth / 2)}
                fill={hover === index ? themeColor.accentPressed : themeColor.accent}
              />
              {index % labelEvery === 0 && (
                <text
                  x={PAD.left + index * slot + 1 + barWidth / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill={themeColor.textFaint}
                >
                  {shortDate(point.label)}
                </text>
              )}
            </g>
          );
        })}

        {active && hover != null && (
          <text
            pointerEvents="none"
            x={Math.min(PAD.left + hover * slot + barWidth / 2, width - PAD.right)}
            y={PAD.top + 4}
            textAnchor={hover > points.length / 2 ? 'end' : 'start'}
            fontSize={12}
            fill={themeColor.text}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {`${shortDate(active.label)} · ${formatValue(active.value)} ${unit}`}
          </text>
        )}
      </svg>
      <DataTable id={tableId} caption={title} unit={unit} points={points} />
    </ChartFrame>
  );
}

/** A remaining-vs-target bar, used by the nutrition card and the day totals. */
export function MacroBar({
  label,
  consumed,
  target,
  unit,
}: {
  label: string;
  consumed: number;
  target: number | null;
  unit: string;
}): ReactNode {
  const share = target && target > 0 ? Math.min(1, consumed / target) : 0;
  const over = target != null && target > 0 && consumed > target;
  return (
    <div style={{ marginBottom: space.sm }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: fontSize.caption,
          color: themeColor.textMuted,
          marginBottom: 2,
        }}
      >
        <span>{label}</span>
        <span className="tabular">
          {target == null
            ? `${Math.round(consumed)} ${unit}`
            : `${Math.round(consumed)} / ${Math.round(target)} ${unit}`}
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: radius.pill,
          background: themeColor.surfaceRaised,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${share * 100}%`,
            height: '100%',
            borderRadius: radius.pill,
            background: over ? themeColor.warn : themeColor.accent,
          }}
        />
      </div>
    </div>
  );
}
