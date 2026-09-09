/**
 * View-model builders — DESIGN.md §7.2.
 *
 * "View-model builders (`buildTodayView`, `buildExerciseStats`,
 * `buildProgressSeries`) live in `packages/core` and are tested there;
 * components only render."
 *
 * Every builder is pure: it takes rows the repositories already loaded plus the
 * current date, and returns something a component can render without further
 * arithmetic. No engine is re-run inside a component.
 */

import { addDays, daysBetween } from './dates';
import { clampMacros, progressAgainstTarget } from './nutrition';
import type { InsightDraft } from './insights';
import { makeRationale } from './rationale';
import type { ReadinessAssessment } from './readiness';
import type { StreakResult } from './records';
import {
  bestE1rm,
  bestLoadKg,
  bestReps,
  linearSlope,
  meanRpe,
  sessionLoadKg,
  sessionVolumeKg,
  sortSessionsAscending,
  sortSessionsDescending,
  workingSets,
} from './setMath';
import type {
  BodyMetric,
  DayNutrition,
  Exercise,
  ExerciseSession,
  Id,
  Insight,
  LocalDate,
  MacroTotals,
  PersonalRecord,
  Rationale,
  SafetyEvent,
  UnitSystem,
  WorkoutPlan,
  WorkoutWithExercises,
} from './types';
import { roundTo, toDisplay } from './units';

// ---------------------------------------------------------------------------
// buildTodayView
// ---------------------------------------------------------------------------

/** What the readiness card shows before and after the check-in. */
export interface TodayReadinessCard {
  checkedIn: boolean;
  score: number | null;
  modifier: ReadinessAssessment['modifier'];
  summary: string;
}

/** One line of the nutrition ring. */
export interface TodayMacroRing {
  key: keyof MacroTotals;
  label: string;
  consumed: number;
  target: number | null;
  /** Never negative — DESIGN.md §5.6 clamps this for the UI. */
  remaining: number;
  /** 0–1+, or null when there is no target. */
  progress: number | null;
}

export interface TodayWorkoutCard {
  /** `none` shows the "Ask for a workout" call to action. */
  state: 'none' | 'planned' | 'in_progress' | 'completed' | 'skipped';
  workoutId: Id | null;
  title: string | null;
  plannedDurationMin: number | null;
  exerciseCount: number;
  setsCompleted: number;
  setsPlanned: number;
  rationale: Rationale | null;
}

export interface TodayView {
  date: LocalDate;
  readiness: TodayReadinessCard;
  workout: TodayWorkoutCard;
  nutrition: {
    hasTargets: boolean;
    consumed: MacroTotals;
    /** Signed, as stored. */
    remaining: MacroTotals;
    /** Clamped at zero, as the UI shows it. */
    remainingForDisplay: MacroTotals;
    mealsLogged: number;
    rings: TodayMacroRing[];
  };
  /** Unresolved safety events; non-empty means the banner shows. */
  safetyEvents: SafetyEvent[];
  safetyActive: boolean;
  openInsights: (Insight | InsightDraft)[];
  streak: { current: number; longest: number } | null;
  /** One sentence the Today screen can show under the heading. */
  headline: string;
  rationale: Rationale;
}

export interface TodayViewInput {
  date: LocalDate;
  readiness: ReadinessAssessment;
  /** Workouts dated today, in any status. */
  workoutsToday: readonly WorkoutWithExercises[];
  /** The rule-based or coach plan when nothing is stored yet. */
  draftPlan?: WorkoutPlan | null;
  nutrition: DayNutrition;
  /** Unresolved rows only; the caller filters. */
  openSafetyEvents?: readonly SafetyEvent[];
  insights?: readonly (Insight | InsightDraft)[];
  streak?: StreakResult | null;
}

const MACRO_RING_LABELS: { key: keyof MacroTotals; label: string }[] = [
  { key: 'kcal', label: 'Calories' },
  { key: 'proteinG', label: 'Protein' },
  { key: 'carbsG', label: 'Carbs' },
  { key: 'fatG', label: 'Fat' },
  { key: 'fiberG', label: 'Fiber' },
];

/** The Today tab, assembled from rows the repositories already fetched. */
export function buildTodayView(input: TodayViewInput): TodayView {
  const { date, readiness, nutrition } = input;
  const safetyEvents = [...(input.openSafetyEvents ?? [])].filter(
    (event) => event.resolvedAt == null,
  );
  const safetyActive = safetyEvents.length > 0 || readiness.modifier === 'safety';

  const workout = buildTodayWorkoutCard(input);

  const remainingForDisplay = clampMacros(nutrition.remaining);
  const rings: TodayMacroRing[] = MACRO_RING_LABELS.map(({ key, label }) => ({
    key,
    label,
    consumed: nutrition.consumed[key],
    target: nutrition.targets ? nutrition.targets[key] : null,
    remaining: remainingForDisplay[key],
    progress: progressAgainstTarget(
      nutrition.consumed[key],
      nutrition.targets ? nutrition.targets[key] : null,
    ),
  }));

  const openInsights = [...(input.insights ?? [])].filter((insight) => !insight.dismissed);

  const codes: string[] = [`WORKOUT_${workout.state.toUpperCase()}`, ...readiness.rationale.codes];
  if (safetyActive) codes.push('SAFETY_STATE_ACTIVE');
  if (!nutrition.targets) codes.push('NO_NUTRITION_TARGETS');
  if (openInsights.length > 0) codes.push('OPEN_INSIGHTS');

  const headline = buildTodayHeadline({
    workout,
    safetyActive,
    readiness,
    nutrition,
    streak: input.streak ?? null,
  });

  return {
    date,
    readiness: {
      checkedIn: readiness.score != null,
      score: readiness.score,
      modifier: readiness.modifier,
      summary: readiness.rationale.summary,
    },
    workout,
    nutrition: {
      hasTargets: nutrition.targets != null,
      consumed: nutrition.consumed,
      remaining: nutrition.remaining,
      remainingForDisplay,
      mealsLogged: nutrition.mealsLogged,
      rings,
    },
    safetyEvents,
    safetyActive,
    openInsights,
    streak: input.streak ? { current: input.streak.current, longest: input.streak.longest } : null,
    headline,
    rationale: makeRationale(
      [...new Set(codes)],
      {
        date,
        readinessScore: readiness.score,
        readinessModifier: readiness.modifier,
        workoutState: workout.state,
        setsCompleted: workout.setsCompleted,
        setsPlanned: workout.setsPlanned,
        mealsLogged: nutrition.mealsLogged,
        openInsights: openInsights.length,
        safetyEvents: safetyEvents.length,
      },
      headline,
    ),
  };
}

function buildTodayWorkoutCard(input: TodayViewInput): TodayWorkoutCard {
  const inProgress = input.workoutsToday.find((workout) => workout.status === 'in_progress');
  const completed = input.workoutsToday.find((workout) => workout.status === 'completed');
  const planned = input.workoutsToday.find((workout) => workout.status === 'planned');
  const skipped = input.workoutsToday.find(
    (workout) => workout.status === 'skipped' || workout.status === 'abandoned',
  );
  const chosen = inProgress ?? completed ?? planned ?? skipped ?? null;

  if (chosen == null) {
    const plan = input.draftPlan ?? null;
    return {
      state: 'none',
      workoutId: null,
      title: plan?.title ?? null,
      plannedDurationMin: plan?.plannedDurationMin ?? null,
      exerciseCount: plan?.exercises.length ?? 0,
      setsCompleted: 0,
      setsPlanned: plan?.exercises.reduce((total, slot) => total + slot.targetSets, 0) ?? 0,
      rationale: plan?.rationale ?? null,
    };
  }

  let setsCompleted = 0;
  let setsPlanned = 0;
  for (const slot of chosen.exercises) {
    for (const set of slot.sets) {
      if (set.isWarmup) continue;
      setsPlanned += 1;
      if (set.completed) setsCompleted += 1;
    }
  }

  return {
    state: chosen.status === 'abandoned' ? 'skipped' : (chosen.status as TodayWorkoutCard['state']),
    workoutId: chosen.id,
    title: chosen.title,
    plannedDurationMin: chosen.plannedDurationMin,
    exerciseCount: chosen.exercises.length,
    setsCompleted,
    setsPlanned,
    rationale: chosen.rationale,
  };
}

function buildTodayHeadline(input: {
  workout: TodayWorkoutCard;
  safetyActive: boolean;
  readiness: ReadinessAssessment;
  nutrition: DayNutrition;
  streak: StreakResult | null;
}): string {
  if (input.safetyActive) {
    return 'A safety event is open — loads hold and the coach will not progress you until it is resolved.';
  }
  const parts: string[] = [];
  switch (input.workout.state) {
    case 'completed':
      parts.push(`Session done: ${input.workout.setsCompleted} sets logged`);
      break;
    case 'in_progress':
      parts.push(
        `Session in progress: ${input.workout.setsCompleted} of ${input.workout.setsPlanned} sets`,
      );
      break;
    case 'planned':
      parts.push(`${input.workout.title ?? 'A session'} is queued up`);
      break;
    case 'skipped':
      parts.push('Today’s session was skipped');
      break;
    case 'none':
      parts.push(
        input.workout.exerciseCount > 0
          ? `A ${input.workout.plannedDurationMin ?? 0}-minute plan is ready when you are`
          : 'Nothing planned yet — ask the coach for a workout',
      );
      break;
  }
  if (input.readiness.score != null) parts.push(`readiness ${input.readiness.score}/100`);
  if (input.nutrition.targets) {
    parts.push(`${Math.max(0, Math.round(input.nutrition.remaining.proteinG))} g protein left`);
  }
  if (input.streak && input.streak.current > 1) {
    parts.push(`${input.streak.current}-session streak`);
  }
  return `${parts.join(' · ')}.`;
}

// ---------------------------------------------------------------------------
// buildExerciseStats
// ---------------------------------------------------------------------------

/** One past session, flattened for the exercise detail screen. */
export interface ExerciseSessionSummary {
  date: LocalDate;
  workoutId: Id;
  sets: number;
  reps: number[];
  loadKg: number | null;
  volumeKg: number;
  meanRpe: number | null;
  e1rmKg: number | null;
}

export interface ExerciseStats {
  exerciseId: Id;
  exerciseName: string;
  sessionCount: number;
  firstSessionDate: LocalDate | null;
  lastSessionDate: LocalDate | null;
  bestE1rmKg: number | null;
  bestLoadKg: number | null;
  bestReps: number;
  totalSets: number;
  totalVolumeKg: number;
  averageRpe: number | null;
  /** Estimated 1RM change per week; null when there is not enough data. */
  e1rmTrendKgPerWeek: number | null;
  personalRecords: PersonalRecord[];
  /** Newest first, ready to render as a history list. */
  sessions: ExerciseSessionSummary[];
  /** The same numbers in the user's units, for the header row. */
  display: {
    unitSystem: UnitSystem;
    bestE1rm: number | null;
    bestLoad: number | null;
  };
  rationale: Rationale;
}

export interface ExerciseStatsInput {
  exercise: Pick<Exercise, 'id' | 'name'>;
  sessions: readonly ExerciseSession[];
  personalRecords?: readonly PersonalRecord[];
  unitSystem?: UnitSystem;
}

/** Per-exercise stats and PRs — the Train tab's exercise detail screen. */
export function buildExerciseStats(input: ExerciseStatsInput): ExerciseStats {
  const unitSystem = input.unitSystem ?? 'metric';
  const ascending = sortSessionsAscending(input.sessions).filter(
    (session) => workingSets(session).length > 0,
  );
  const descending = sortSessionsDescending(ascending);

  const summaries: ExerciseSessionSummary[] = descending.map((session) => {
    const sets = workingSets(session);
    return {
      date: session.date,
      workoutId: session.workoutId,
      sets: sets.length,
      reps: sets.map((set) => set.actualReps ?? 0),
      loadKg: sessionLoadKg(session),
      volumeKg: sessionVolumeKg(session),
      meanRpe: meanRpe(sets),
      e1rmKg: bestE1rm(session),
    };
  });

  const totalSets = summaries.reduce((total, summary) => total + summary.sets, 0);
  const totalVolumeKg = roundTo(
    summaries.reduce((total, summary) => total + summary.volumeKg, 0),
    2,
  );
  const rpeValues = summaries
    .map((summary) => summary.meanRpe)
    .filter((rpe): rpe is number => rpe != null);

  const best = ascending.reduce<{ e1rm: number | null; load: number | null; reps: number }>(
    (acc, session) => {
      const e1rm = bestE1rm(session);
      const load = bestLoadKg(session);
      const reps = bestReps(session);
      return {
        e1rm: e1rm != null && (acc.e1rm == null || e1rm > acc.e1rm) ? e1rm : acc.e1rm,
        load: load != null && (acc.load == null || load > acc.load) ? load : acc.load,
        reps: Math.max(acc.reps, reps),
      };
    },
    { e1rm: null, load: null, reps: 0 },
  );

  const trendPoints = ascending
    .map((session) => ({ date: session.date, value: bestE1rm(session) }))
    .filter((point): point is { date: LocalDate; value: number } => point.value != null);
  const trend =
    trendPoints.length >= 2
      ? linearSlope(
          trendPoints.map((point) => ({
            x: daysBetween(trendPoints[0].date, point.date) / 7,
            y: point.value,
          })),
        )
      : null;

  const codes = ['EXERCISE_STATS'];
  if (trend != null && trend > 0) codes.push('TREND_UP');
  if (trend != null && trend < 0) codes.push('TREND_DOWN');
  if (summaries.length === 0) codes.push('NO_HISTORY');

  return {
    exerciseId: input.exercise.id,
    exerciseName: input.exercise.name,
    sessionCount: summaries.length,
    firstSessionDate: ascending[0]?.date ?? null,
    lastSessionDate: ascending[ascending.length - 1]?.date ?? null,
    bestE1rmKg: best.e1rm,
    bestLoadKg: best.load,
    bestReps: best.reps,
    totalSets,
    totalVolumeKg,
    averageRpe:
      rpeValues.length > 0
        ? roundTo(rpeValues.reduce((total, rpe) => total + rpe, 0) / rpeValues.length, 2)
        : null,
    e1rmTrendKgPerWeek: trend,
    personalRecords: [...(input.personalRecords ?? [])].sort((a, b) =>
      b.date.localeCompare(a.date),
    ),
    sessions: summaries,
    display: {
      unitSystem,
      bestE1rm: best.e1rm == null ? null : toDisplay(best.e1rm, 'load', unitSystem),
      bestLoad: best.load == null ? null : toDisplay(best.load, 'load', unitSystem),
    },
    rationale: makeRationale(
      codes,
      {
        exerciseId: input.exercise.id,
        sessionCount: summaries.length,
        bestE1rmKg: best.e1rm,
        bestLoadKg: best.load,
        bestReps: best.reps,
        totalSets,
        totalVolumeKg,
        e1rmTrendKgPerWeek: trend,
      },
      summaries.length === 0
        ? `No logged sets for ${input.exercise.name} yet.`
        : `${summaries.length} logged sessions of ${input.exercise.name}${
            trend != null
              ? `, estimated 1RM moving ${trend > 0 ? '+' : ''}${roundTo(trend, 2)} kg per week`
              : ''
          }.`,
    ),
  };
}

// ---------------------------------------------------------------------------
// buildProgressSeries
// ---------------------------------------------------------------------------

export type ProgressMetric = 'e1rm' | 'session_volume' | 'body_weight' | 'waist' | 'weekly_sets';

export interface ProgressPoint {
  date: LocalDate;
  /** Canonical metric value. */
  value: number;
  /** The same value in the user's units. */
  display: number;
}

export interface ProgressSeries {
  metric: ProgressMetric;
  label: string;
  unit: string;
  points: ProgressPoint[];
  first: number | null;
  last: number | null;
  /** Signed change from the first to the last point, canonical units. */
  change: number | null;
  /** Slope per week from a least-squares fit, canonical units. */
  trendPerWeek: number | null;
  rationale: Rationale;
}

export interface ProgressSeriesInput {
  metric: ProgressMetric;
  from: LocalDate;
  to: LocalDate;
  unitSystem?: UnitSystem;
  /** Required for `e1rm` and `session_volume`. */
  sessions?: readonly ExerciseSession[];
  /** Required for `body_weight` and `waist`. */
  bodyMetrics?: readonly BodyMetric[];
  /** Required for `weekly_sets`. */
  workouts?: readonly WorkoutWithExercises[];
  exerciseName?: string;
}

const METRIC_LABEL: Record<ProgressMetric, string> = {
  e1rm: 'Estimated 1RM',
  session_volume: 'Session volume',
  body_weight: 'Body weight',
  waist: 'Waist',
  weekly_sets: 'Working sets per week',
};

/** Charts for the Progress tab. One metric per call, deterministic output. */
export function buildProgressSeries(input: ProgressSeriesInput): ProgressSeries {
  const unitSystem = input.unitSystem ?? 'metric';
  const inRange = (date: LocalDate): boolean => date >= input.from && date <= input.to;

  let points: ProgressPoint[] = [];
  let unit = 'kg';

  switch (input.metric) {
    case 'e1rm': {
      unit = unitSystem === 'imperial' ? 'lb' : 'kg';
      points = sortSessionsAscending(input.sessions ?? [])
        .filter((session) => inRange(session.date))
        .map((session) => ({ date: session.date, value: bestE1rm(session) }))
        .filter((point): point is { date: LocalDate; value: number } => point.value != null)
        .map((point) => ({
          date: point.date,
          value: point.value,
          display: toDisplay(point.value, 'load', unitSystem),
        }));
      break;
    }
    case 'session_volume': {
      unit = unitSystem === 'imperial' ? 'lb' : 'kg';
      points = sortSessionsAscending(input.sessions ?? [])
        .filter((session) => inRange(session.date))
        .map((session) => {
          const value = sessionVolumeKg(session);
          return { date: session.date, value, display: toDisplay(value, 'load', unitSystem) };
        })
        .filter((point) => point.value > 0);
      break;
    }
    case 'body_weight': {
      unit = unitSystem === 'imperial' ? 'lb' : 'kg';
      points = [...(input.bodyMetrics ?? [])]
        .filter((metric) => inRange(metric.date) && metric.weightKg != null)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((metric) => ({
          date: metric.date,
          value: metric.weightKg as number,
          display: toDisplay(metric.weightKg as number, 'weight', unitSystem),
        }));
      break;
    }
    case 'waist': {
      unit = unitSystem === 'imperial' ? 'in' : 'cm';
      points = [...(input.bodyMetrics ?? [])]
        .filter((metric) => inRange(metric.date) && metric.waistCm != null)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((metric) => ({
          date: metric.date,
          value: metric.waistCm as number,
          display: toDisplay(metric.waistCm as number, 'length', unitSystem),
        }));
      break;
    }
    case 'weekly_sets': {
      unit = 'sets';
      const byWeek = new Map<LocalDate, number>();
      for (const workout of input.workouts ?? []) {
        if (!inRange(workout.date)) continue;
        const weekIndex = Math.floor(daysBetween(input.from, workout.date) / 7);
        const bucket = addDays(input.from, weekIndex * 7);
        const sets = workout.exercises.reduce(
          (total, slot) => total + slot.sets.filter((set) => !set.isWarmup && set.completed).length,
          0,
        );
        byWeek.set(bucket, (byWeek.get(bucket) ?? 0) + sets);
      }
      points = [...byWeek.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, value]) => ({ date, value, display: value }));
      break;
    }
  }

  const first = points[0]?.value ?? null;
  const last = points[points.length - 1]?.value ?? null;
  const change = first != null && last != null ? roundTo(last - first, 3) : null;
  const trendPerWeek =
    points.length >= 2
      ? linearSlope(
          points.map((point) => ({
            x: daysBetween(points[0].date, point.date) / 7,
            y: point.value,
          })),
        )
      : null;

  const label =
    input.metric === 'e1rm' && input.exerciseName
      ? `${METRIC_LABEL.e1rm} — ${input.exerciseName}`
      : METRIC_LABEL[input.metric];

  const codes = ['PROGRESS_SERIES'];
  if (points.length === 0) codes.push('NO_DATA');
  else if (trendPerWeek != null && trendPerWeek > 0) codes.push('TREND_UP');
  else if (trendPerWeek != null && trendPerWeek < 0) codes.push('TREND_DOWN');

  return {
    metric: input.metric,
    label,
    unit,
    points,
    first,
    last,
    change,
    trendPerWeek,
    rationale: makeRationale(
      codes,
      {
        metric: input.metric,
        from: input.from,
        to: input.to,
        pointCount: points.length,
        first,
        last,
        change,
        trendPerWeek,
      },
      points.length === 0
        ? `No ${METRIC_LABEL[input.metric].toLowerCase()} data between ${input.from} and ${input.to}.`
        : `${label} moved from ${first} to ${last} ${unit} across ${points.length} points.`,
    ),
  };
}
