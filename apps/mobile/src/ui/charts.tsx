/**
 * The Progress tab's charts, drawn to scale with `react-native-svg`.
 *
 * Every series arrives from a `@vigor/core` view-model builder
 * (`buildProgressSeries`), so nothing here decides a value — these components
 * only map a number range onto pixels. The axis extents are computed from the
 * data, never assumed, so a flat series still reads as flat.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { color, fontSize, space } from './tokens';

export interface ChartPoint {
  /** X label, usually a `YYYY-MM-DD`. */
  label: string;
  value: number;
}

const CHART_HEIGHT = 160;
const PADDING_LEFT = 40;
const PADDING_RIGHT = 10;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 22;

/** Nice-ish bounds: pad a flat series so its line does not sit on the axis. */
function extentOf(values: readonly number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.1;
  return { min: min - pad, max: max + pad };
}

function formatTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${Math.round(value / 100) / 10}k`;
  if (abs >= 100) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

/** Measures its own width so the drawing scales to the real screen. */
function useChartWidth(): [number, (event: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(320);
  return [width, (event) => setWidth(Math.max(200, event.nativeEvent.layout.width))];
}

export function ChartFrame({
  title,
  subtitle,
  children,
  onLayout,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View style={styles.frame} onLayout={onLayout}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

/** A line chart with a dot per point and min/max ticks on the value axis. */
export function LineChart({
  title,
  subtitle,
  points,
  unit,
  stroke = color.accent,
}: {
  title: string;
  subtitle?: string;
  points: readonly ChartPoint[];
  unit: string;
  stroke?: string;
}) {
  const [width, onLayout] = useChartWidth();

  if (points.length === 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle} onLayout={onLayout}>
        <Text style={styles.empty}>Nothing logged in this window yet.</Text>
      </ChartFrame>
    );
  }

  const values = points.map((point) => point.value);
  const { min, max } = extentOf(values);
  const plotWidth = Math.max(1, width - PADDING_LEFT - PADDING_RIGHT);
  const plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const xAt = (index: number): number =>
    PADDING_LEFT +
    (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const yAt = (value: number): number =>
    PADDING_TOP + plotHeight - ((value - min) / (max - min)) * plotHeight;

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${xAt(index)},${yAt(point.value)}`)
    .join(' ');

  return (
    <ChartFrame title={title} subtitle={subtitle} onLayout={onLayout}>
      <Svg width={width} height={CHART_HEIGHT}>
        <Line
          x1={PADDING_LEFT}
          y1={PADDING_TOP + plotHeight}
          x2={width - PADDING_RIGHT}
          y2={PADDING_TOP + plotHeight}
          stroke={color.border}
          strokeWidth={1}
        />
        <SvgText x={2} y={PADDING_TOP + 4} fill={color.textFaint} fontSize={10}>
          {`${formatTick(max)}`}
        </SvgText>
        <SvgText x={2} y={PADDING_TOP + plotHeight} fill={color.textFaint} fontSize={10}>
          {`${formatTick(min)}`}
        </SvgText>
        <Path d={path} stroke={stroke} strokeWidth={2} fill="none" />
        {points.map((point, index) => (
          <Circle
            key={`${point.label}-${index}`}
            cx={xAt(index)}
            cy={yAt(point.value)}
            r={3}
            fill={stroke}
          />
        ))}
        <SvgText x={PADDING_LEFT} y={CHART_HEIGHT - 4} fill={color.textFaint} fontSize={10}>
          {points[0].label}
        </SvgText>
        <SvgText
          x={width - PADDING_RIGHT}
          y={CHART_HEIGHT - 4}
          fill={color.textFaint}
          fontSize={10}
          textAnchor="end"
        >
          {points[points.length - 1].label}
        </SvgText>
      </Svg>
      <Text style={styles.subtitle}>
        {`${formatTick(points[points.length - 1].value)} ${unit} latest · ${points.length} points`}
      </Text>
    </ChartFrame>
  );
}

/** A bar chart. `highlightIndex` paints one bar in the accent colour. */
export function BarChart({
  title,
  subtitle,
  bars,
  unit,
  fill = color.series[2],
  highlightIndex,
}: {
  title: string;
  subtitle?: string;
  bars: readonly ChartPoint[];
  unit: string;
  fill?: string;
  highlightIndex?: number;
}) {
  const [width, onLayout] = useChartWidth();

  if (bars.length === 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle} onLayout={onLayout}>
        <Text style={styles.empty}>Nothing logged in this window yet.</Text>
      </ChartFrame>
    );
  }

  const max = Math.max(...bars.map((bar) => bar.value), 1);
  const plotWidth = Math.max(1, width - PADDING_LEFT - PADDING_RIGHT);
  const plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const slot = plotWidth / bars.length;
  const barWidth = Math.max(3, slot * 0.62);

  return (
    <ChartFrame title={title} subtitle={subtitle} onLayout={onLayout}>
      <Svg width={width} height={CHART_HEIGHT}>
        <Line
          x1={PADDING_LEFT}
          y1={PADDING_TOP + plotHeight}
          x2={width - PADDING_RIGHT}
          y2={PADDING_TOP + plotHeight}
          stroke={color.border}
          strokeWidth={1}
        />
        <SvgText x={2} y={PADDING_TOP + 4} fill={color.textFaint} fontSize={10}>
          {formatTick(max)}
        </SvgText>
        {bars.map((bar, index) => {
          const height = (bar.value / max) * plotHeight;
          return (
            <Rect
              key={`${bar.label}-${index}`}
              x={PADDING_LEFT + index * slot + (slot - barWidth) / 2}
              y={PADDING_TOP + plotHeight - height}
              width={barWidth}
              height={Math.max(height, bar.value > 0 ? 2 : 0)}
              rx={2}
              fill={index === highlightIndex ? color.accent : fill}
            />
          );
        })}
        <SvgText x={PADDING_LEFT} y={CHART_HEIGHT - 4} fill={color.textFaint} fontSize={10}>
          {bars[0].label}
        </SvgText>
        <SvgText
          x={width - PADDING_RIGHT}
          y={CHART_HEIGHT - 4}
          fill={color.textFaint}
          fontSize={10}
          textAnchor="end"
        >
          {bars[bars.length - 1].label}
        </SvgText>
      </Svg>
      <Text style={styles.subtitle}>
        {`Peak ${formatTick(max)} ${unit} · ${bars.length} weeks`}
      </Text>
    </ChartFrame>
  );
}

/**
 * The remaining-macro ring used by the Today card: an arc of the track drawn
 * with a dash offset, so the sweep is the real share consumed.
 */
export function Ring({
  size,
  strokeWidth,
  progress,
  stroke,
  track = color.surfaceRaised,
  children,
}: {
  size: number;
  strokeWidth: number;
  /** 0–1; anything above 1 fills the ring. */
  progress: number;
  stroke: string;
  track?: string;
  children?: ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={track}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * share} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    marginTop: space.lg,
  },
  title: {
    color: color.text,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  subtitle: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  empty: {
    color: color.textFaint,
    fontSize: fontSize.caption,
    paddingVertical: space.lg,
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
