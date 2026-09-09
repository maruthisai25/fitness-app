/**
 * Insight detectors — DESIGN.md §5.8. Deterministic; Claude is only ever asked
 * to phrase a batch of them into the weekly review.
 *
 *   EXERCISE_TREND        linear regression on e1RM over ≥ 6 sessions
 *   PUSH_PULL_BALANCE     4-week set-volume ratio outside 0.75–1.33
 *   SKIPPED_PATTERN       weekday or duration bucket completing under 50 %
 *   PROTEIN_GAP_BY_DAY    weekday groups averaging under 85 % of protein target
 *   COMPLETION_BY_DURATION completion rate by planned-duration bucket
 *   FREQUENT_FOODS        items logged ≥ 4 times in 14 days
 *   MISSED_TARGET_STREAK  any macro missed 5 of the last 7 days
 */

import { addDays, daysBetween, weekdayName, weekdayOf } from './dates';
import { makeRationale } from './rationale';
import { bestE1rm, linearSlope, sortSessionsAscending } from './setMath';
import type {
  DateRange,
  EvidenceRef,
  Exercise,
  ExerciseSession,
  Id,
  Insight,
  LocalDate,
  MacroTotals,
  NutritionTargets,
  Rationale,
  WeekDay,
  WorkoutWithExercises,
} from './types';
import { roundTo } from './units';

/** An `insights` row before the repository stamps an id and a timestamp. */
export type InsightDraft = Omit<Insight, 'id' | 'createdAt'>;

export interface DetectorResult {
  insights: InsightDraft[];
  rationale: Rationale;
}

export const EXERCISE_TREND_MIN_SESSIONS = 6;
/** Below this weekly slope the trend is noise, not news (kg per week). */
export const EXERCISE_TREND_MIN_SLOPE_KG_PER_WEEK = 0.05;

export const PUSH_PULL_RATIO_MIN = 0.75;
export const PUSH_PULL_RATIO_MAX = 1.33;
export const PUSH_PULL_MIN_SETS = 4;

export const SKIPPED_MIN_SESSIONS_PER_BUCKET = 3;
export const SKIPPED_COMPLETION_RATE_MAX = 0.5;

export const PROTEIN_GAP_SHARE = 0.85;
export const PROTEIN_GAP_MIN_DAYS = 2;

export const COMPLETION_SPREAD_MIN = 0.2;

export const FREQUENT_FOOD_MIN_COUNT = 4;
export const FREQUENT_FOOD_WINDOW_DAYS = 14;
export const FREQUENT_FOOD_LIMIT = 5;

export const MISSED_TARGET_WINDOW_DAYS = 7;
export const MISSED_TARGET_MIN_DAYS = 5;

/** Planned-duration buckets used by two detectors. */
export const DURATION_BUCKETS = [
  { key: 'under_30', label: 'under 30 minutes', min: 0, max: 29 },
  { key: '30_44', label: '30–44 minutes', min: 30, max: 44 },
  { key: '45_59', label: '45–59 minutes', min: 45, max: 59 },
  { key: '60_plus', label: '60 minutes or more', min: 60, max: Number.POSITIVE_INFINITY },
] as const;

export function durationBucketOf(minutes: number): (typeof DURATION_BUCKETS)[number] {
  return (
    DURATION_BUCKETS.find((bucket) => minutes >= bucket.min && minutes <= bucket.max) ??
    DURATION_BUCKETS[DURATION_BUCKETS.length - 1]
  );
}

/** How each macro is judged "missed" — DESIGN.md §5.8 `MISSED_TARGET_STREAK`. */
export const MACRO_MISS_RULES = {
  kcal: { kind: 'band', tolerance: 0.1 },
  proteinG: { kind: 'floor', share: 0.9 },
  carbsG: { kind: 'band', tolerance: 0.2 },
  fatG: { kind: 'band', tolerance: 0.2 },
  fiberG: { kind: 'floor', share: 0.9 },
} as const;

export type MacroKey = keyof typeof MACRO_MISS_RULES;

export const MACRO_KEYS: readonly MacroKey[] = ['kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG'];

const MACRO_LABEL: Record<MacroKey, string> = {
  kcal: 'calories',
  proteinG: 'protein',
  carbsG: 'carbohydrates',
  fatG: 'fat',
  fiberG: 'fiber',
};

/** True when the day missed the target for that macro. */
export function macroMissed(key: MacroKey, consumed: number, target: number): boolean {
  if (!(target > 0)) return false;
  const rule = MACRO_MISS_RULES[key];
  if (rule.kind === 'floor') return consumed < target * rule.share;
  return Math.abs(consumed - target) > target * rule.tolerance;
}

// ---------------------------------------------------------------------------
// Detector inputs
// ---------------------------------------------------------------------------

export interface InsightExerciseHistory {
  exerciseId: Id;
  exerciseName: string;
  sessions: readonly ExerciseSession[];
}

export interface InsightNutritionDay {
  date: LocalDate;
  consumed: MacroTotals;
  targets: NutritionTargets | null;
  /** One entry per logged `food_items` row. */
  items?: readonly { id: Id; name: string }[];
}

export interface InsightInput {
  today: LocalDate;
  /** Usually the last 28 days. */
  period: DateRange;
  workouts: readonly WorkoutWithExercises[];
  exercises: readonly Exercise[];
  exerciseHistories: readonly InsightExerciseHistory[];
  nutritionDays: readonly InsightNutritionDay[];
}

function evidence(table: string, id: Id, note: string | null = null): EvidenceRef {
  return { table, id, note };
}

function draft(
  detector: string,
  period: DateRange,
  headline: string,
  detail: string,
  refs: EvidenceRef[],
  severity: Insight['severity'],
): InsightDraft {
  return { detector, period, headline, detail, evidence: refs, severity, dismissed: false };
}

// ---------------------------------------------------------------------------
// EXERCISE_TREND
// ---------------------------------------------------------------------------

/** Linear regression on estimated 1RM, slope reported per week. */
export function detectExerciseTrend(input: InsightInput): DetectorResult {
  const insights: InsightDraft[] = [];
  const examined: Record<string, unknown>[] = [];

  for (const history of input.exerciseHistories) {
    const sessions = sortSessionsAscending(history.sessions).filter(
      (session) => bestE1rm(session) != null,
    );
    if (sessions.length < EXERCISE_TREND_MIN_SESSIONS) {
      examined.push({ exerciseId: history.exerciseId, sessions: sessions.length, slope: null });
      continue;
    }
    const first = sessions[0].date;
    const points = sessions.map((session) => ({
      x: daysBetween(first, session.date) / 7,
      y: bestE1rm(session) as number,
    }));
    const slope = linearSlope(points);
    examined.push({ exerciseId: history.exerciseId, sessions: sessions.length, slope });
    if (slope == null || Math.abs(slope) < EXERCISE_TREND_MIN_SLOPE_KG_PER_WEEK) continue;

    const rising = slope > 0;
    insights.push(
      draft(
        'EXERCISE_TREND',
        { from: first, to: sessions[sessions.length - 1].date },
        `${history.exerciseName} is ${rising ? 'trending up' : 'trending down'}`,
        `Across ${sessions.length} sessions your estimated 1RM has moved ${
          rising ? '+' : ''
        }${roundTo(slope, 2)} kg per week.`,
        sessions.map((session) =>
          evidence('workout_exercises', session.workoutExerciseId, session.date),
        ),
        rising ? 'info' : 'notice',
      ),
    );
  }

  return {
    insights,
    rationale: makeRationale(
      insights.length > 0 ? ['EXERCISE_TREND'] : ['EXERCISE_TREND_NONE'],
      {
        minSessions: EXERCISE_TREND_MIN_SESSIONS,
        minSlopeKgPerWeek: EXERCISE_TREND_MIN_SLOPE_KG_PER_WEEK,
        examined,
      },
      insights.length > 0
        ? `${insights.length} exercise${insights.length === 1 ? '' : 's'} showed a clear e1RM trend.`
        : 'No exercise has enough sessions with a clear estimated-1RM trend yet.',
    ),
  };
}

// ---------------------------------------------------------------------------
// PUSH_PULL_BALANCE
// ---------------------------------------------------------------------------

/** Four-week working-set ratio between pushing and pulling patterns. */
export function detectPushPullBalance(input: InsightInput): DetectorResult {
  const byId = new Map(input.exercises.map((exercise) => [exercise.id, exercise]));
  const from = addDays(input.today, -27);
  let push = 0;
  let pull = 0;
  const refs: EvidenceRef[] = [];

  for (const workout of input.workouts) {
    if (workout.date < from || workout.date > input.today) continue;
    if (workout.status !== 'completed') continue;
    for (const slot of workout.exercises) {
      const exercise = byId.get(slot.exerciseId);
      if (!exercise) continue;
      const sets = slot.sets.filter((set) => !set.isWarmup && set.completed).length;
      if (sets === 0) continue;
      if (
        exercise.movementPattern === 'horizontal_push' ||
        exercise.movementPattern === 'vertical_push'
      ) {
        push += sets;
        refs.push(evidence('workout_exercises', slot.id, exercise.name));
      } else if (
        exercise.movementPattern === 'horizontal_pull' ||
        exercise.movementPattern === 'vertical_pull'
      ) {
        pull += sets;
        refs.push(evidence('workout_exercises', slot.id, exercise.name));
      }
    }
  }

  const facts = { from, to: input.today, pushSets: push, pullSets: pull };

  if (push + pull < PUSH_PULL_MIN_SETS) {
    return {
      insights: [],
      rationale: makeRationale(
        ['PUSH_PULL_BALANCE_NONE', 'NOT_ENOUGH_SETS'],
        facts,
        'Not enough pushing and pulling sets in the last four weeks to judge balance.',
      ),
    };
  }

  const ratio = pull === 0 ? Number.POSITIVE_INFINITY : roundTo(push / pull, 3);
  const balanced = ratio >= PUSH_PULL_RATIO_MIN && ratio <= PUSH_PULL_RATIO_MAX;

  if (balanced) {
    return {
      insights: [],
      rationale: makeRationale(
        ['PUSH_PULL_BALANCED'],
        { ...facts, ratio },
        `Push-to-pull sets sit at ${ratio}:1 over four weeks, inside the healthy band.`,
      ),
    };
  }

  const pushHeavy = ratio > PUSH_PULL_RATIO_MAX;
  return {
    insights: [
      draft(
        'PUSH_PULL_BALANCE',
        { from, to: input.today },
        pushHeavy ? 'Pushing volume is outrunning pulling' : 'Pulling volume is outrunning pushing',
        `Over four weeks you logged ${push} pushing sets and ${pull} pulling sets` +
          `${Number.isFinite(ratio) ? ` (${ratio}:1)` : ''}. Aim for something between ${
            PUSH_PULL_RATIO_MIN
          } and ${PUSH_PULL_RATIO_MAX}.`,
        refs,
        'notice',
      ),
    ],
    rationale: makeRationale(
      ['PUSH_PULL_BALANCE', pushHeavy ? 'PUSH_HEAVY' : 'PULL_HEAVY'],
      { ...facts, ratio, min: PUSH_PULL_RATIO_MIN, max: PUSH_PULL_RATIO_MAX },
      `Push-to-pull sets sit at ${
        Number.isFinite(ratio) ? ratio : 'infinite'
      }:1, outside the ${PUSH_PULL_RATIO_MIN}–${PUSH_PULL_RATIO_MAX} band.`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Completion helpers, shared by SKIPPED_PATTERN and COMPLETION_BY_DURATION
// ---------------------------------------------------------------------------

interface CompletionBucket {
  key: string;
  label: string;
  total: number;
  completed: number;
  ids: Id[];
}

/** Workouts that already had their chance: not in the future, not still open. */
function scoredWorkouts(input: InsightInput): WorkoutWithExercises[] {
  const from = addDays(input.today, -27);
  return input.workouts.filter(
    (workout) =>
      workout.date >= from &&
      workout.date <= input.today &&
      workout.status !== 'in_progress' &&
      (workout.status === 'completed' ||
        workout.status === 'skipped' ||
        workout.status === 'abandoned' ||
        (workout.status === 'planned' && workout.date < input.today)),
  );
}

function bucketize(
  workouts: readonly WorkoutWithExercises[],
  keyOf: (workout: WorkoutWithExercises) => { key: string; label: string },
): CompletionBucket[] {
  const buckets = new Map<string, CompletionBucket>();
  for (const workout of workouts) {
    const { key, label } = keyOf(workout);
    const bucket = buckets.get(key) ?? { key, label, total: 0, completed: 0, ids: [] };
    bucket.total += 1;
    if (workout.status === 'completed') bucket.completed += 1;
    bucket.ids.push(workout.id);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function completionRate(bucket: CompletionBucket): number {
  return bucket.total === 0 ? 0 : roundTo(bucket.completed / bucket.total, 4);
}

// ---------------------------------------------------------------------------
// SKIPPED_PATTERN
// ---------------------------------------------------------------------------

/** A weekday or duration bucket completing under 50 % across four weeks. */
export function detectSkippedPattern(input: InsightInput): DetectorResult {
  const workouts = scoredWorkouts(input);
  const from = addDays(input.today, -27);
  const period: DateRange = { from, to: input.today };

  const weekdayBuckets = bucketize(workouts, (workout) => {
    const day = weekdayOf(workout.date);
    return { key: `weekday_${day}`, label: `${weekdayName(day)}s` };
  });
  const durationBuckets = bucketize(workouts, (workout) => {
    const bucket = durationBucketOf(workout.plannedDurationMin);
    return { key: `duration_${bucket.key}`, label: `sessions ${bucket.label}` };
  });

  const insights: InsightDraft[] = [];
  for (const bucket of [...weekdayBuckets, ...durationBuckets]) {
    if (bucket.total < SKIPPED_MIN_SESSIONS_PER_BUCKET) continue;
    const rate = completionRate(bucket);
    if (rate >= SKIPPED_COMPLETION_RATE_MAX) continue;
    insights.push(
      draft(
        'SKIPPED_PATTERN',
        period,
        `${bucket.label} rarely get finished`,
        `You completed ${bucket.completed} of ${bucket.total} ${bucket.label} in the last four weeks (${Math.round(
          rate * 100,
        )} %).`,
        bucket.ids.map((id) => evidence('workouts', id)),
        'notice',
      ),
    );
  }

  return {
    insights,
    rationale: makeRationale(
      insights.length > 0 ? ['SKIPPED_PATTERN'] : ['SKIPPED_PATTERN_NONE'],
      {
        period,
        minSessions: SKIPPED_MIN_SESSIONS_PER_BUCKET,
        threshold: SKIPPED_COMPLETION_RATE_MAX,
        weekdayBuckets: weekdayBuckets.map((bucket) => ({
          key: bucket.key,
          total: bucket.total,
          completed: bucket.completed,
        })),
        durationBuckets: durationBuckets.map((bucket) => ({
          key: bucket.key,
          total: bucket.total,
          completed: bucket.completed,
        })),
      },
      insights.length > 0
        ? `${insights.length} scheduling bucket${
            insights.length === 1 ? '' : 's'
          } complete under half the time.`
        : 'No weekday or duration bucket falls under a 50 % completion rate.',
    ),
  };
}

// ---------------------------------------------------------------------------
// COMPLETION_BY_DURATION
// ---------------------------------------------------------------------------

/** Reports which planned-duration bucket the user actually finishes. */
export function detectCompletionByDuration(input: InsightInput): DetectorResult {
  const workouts = scoredWorkouts(input);
  const period: DateRange = { from: addDays(input.today, -27), to: input.today };
  const buckets = bucketize(workouts, (workout) => {
    const bucket = durationBucketOf(workout.plannedDurationMin);
    return { key: bucket.key, label: bucket.label };
  }).filter((bucket) => bucket.total >= SKIPPED_MIN_SESSIONS_PER_BUCKET);

  const facts = {
    period,
    buckets: buckets.map((bucket) => ({
      key: bucket.key,
      total: bucket.total,
      completed: bucket.completed,
      rate: completionRate(bucket),
    })),
    minSpread: COMPLETION_SPREAD_MIN,
  };

  if (buckets.length < 2) {
    return {
      insights: [],
      rationale: makeRationale(
        ['COMPLETION_BY_DURATION_NONE', 'NOT_ENOUGH_BUCKETS'],
        facts,
        'Not enough sessions across different planned durations to compare completion.',
      ),
    };
  }

  const ranked = [...buckets].sort((a, b) => completionRate(b) - completionRate(a));
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const spread = roundTo(completionRate(best) - completionRate(worst), 4);

  if (spread < COMPLETION_SPREAD_MIN) {
    return {
      insights: [],
      rationale: makeRationale(
        ['COMPLETION_BY_DURATION_FLAT'],
        { ...facts, spread },
        'Completion rate barely changes with session length.',
      ),
    };
  }

  return {
    insights: [
      draft(
        'COMPLETION_BY_DURATION',
        period,
        `You finish sessions ${best.label} most often`,
        `Sessions ${best.label} complete ${Math.round(
          completionRate(best) * 100,
        )} % of the time versus ${Math.round(completionRate(worst) * 100)} % for sessions ${
          worst.label
        }.`,
        [...best.ids, ...worst.ids].map((id) => evidence('workouts', id)),
        'info',
      ),
    ],
    rationale: makeRationale(
      ['COMPLETION_BY_DURATION'],
      { ...facts, spread, bestBucket: best.key, worstBucket: worst.key },
      `Completion swings ${Math.round(spread * 100)} points between session lengths.`,
    ),
  };
}

// ---------------------------------------------------------------------------
// PROTEIN_GAP_BY_DAY
// ---------------------------------------------------------------------------

/** Weekdays where protein averages under 85 % of the day's target. */
export function detectProteinGapByDay(input: InsightInput): DetectorResult {
  const groups = new Map<WeekDay, { consumed: number[]; targets: number[]; dates: LocalDate[] }>();
  for (const day of input.nutritionDays) {
    if (day.targets == null || !(day.targets.proteinG > 0)) continue;
    const weekday = weekdayOf(day.date);
    const group = groups.get(weekday) ?? { consumed: [], targets: [], dates: [] };
    group.consumed.push(day.consumed.proteinG);
    group.targets.push(day.targets.proteinG);
    group.dates.push(day.date);
    groups.set(weekday, group);
  }

  const insights: InsightDraft[] = [];
  const examined: Record<string, unknown>[] = [];

  for (const [weekday, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const averageConsumed = roundTo(
      group.consumed.reduce((total, value) => total + value, 0) / group.consumed.length,
      1,
    );
    const averageTarget = roundTo(
      group.targets.reduce((total, value) => total + value, 0) / group.targets.length,
      1,
    );
    const share = averageTarget > 0 ? roundTo(averageConsumed / averageTarget, 4) : null;
    examined.push({ weekday, days: group.dates.length, averageConsumed, averageTarget, share });

    if (group.dates.length < PROTEIN_GAP_MIN_DAYS) continue;
    if (share == null || share >= PROTEIN_GAP_SHARE) continue;

    insights.push(
      draft(
        'PROTEIN_GAP_BY_DAY',
        { from: group.dates[0], to: group.dates[group.dates.length - 1] },
        `Protein runs short on ${weekdayName(weekday)}s`,
        `Across ${group.dates.length} ${weekdayName(
          weekday,
        )}s you averaged ${averageConsumed} g of protein against a ${averageTarget} g target (${Math.round(
          share * 100,
        )} %).`,
        group.dates.map((date) => evidence('nutrition_day', date, 'day total')),
        'notice',
      ),
    );
  }

  return {
    insights,
    rationale: makeRationale(
      insights.length > 0 ? ['PROTEIN_GAP_BY_DAY'] : ['PROTEIN_GAP_BY_DAY_NONE'],
      { threshold: PROTEIN_GAP_SHARE, minDays: PROTEIN_GAP_MIN_DAYS, examined },
      insights.length > 0
        ? `${insights.length} weekday group${
            insights.length === 1 ? '' : 's'
          } averaged under ${Math.round(PROTEIN_GAP_SHARE * 100)} % of the protein target.`
        : 'Every weekday group averaged at least 85 % of its protein target.',
    ),
  };
}

// ---------------------------------------------------------------------------
// FREQUENT_FOODS
// ---------------------------------------------------------------------------

/** Items logged four or more times in fourteen days — feeds saved-meal suggestions. */
export function detectFrequentFoods(input: InsightInput): DetectorResult {
  const from = addDays(input.today, -(FREQUENT_FOOD_WINDOW_DAYS - 1));
  const period: DateRange = { from, to: input.today };
  const counts = new Map<string, { name: string; ids: Id[] }>();

  for (const day of input.nutritionDays) {
    if (day.date < from || day.date > input.today) continue;
    for (const item of day.items ?? []) {
      const key = item.name.trim().toLowerCase();
      if (key.length === 0) continue;
      const entry = counts.get(key) ?? { name: item.name.trim(), ids: [] };
      entry.ids.push(item.id);
      counts.set(key, entry);
    }
  }

  const frequent = [...counts.entries()]
    .filter(([, entry]) => entry.ids.length >= FREQUENT_FOOD_MIN_COUNT)
    .sort((a, b) => b[1].ids.length - a[1].ids.length || a[0].localeCompare(b[0]))
    .slice(0, FREQUENT_FOOD_LIMIT);

  const insights = frequent.map(([, entry]) =>
    draft(
      'FREQUENT_FOODS',
      period,
      `${entry.name} is a staple`,
      `You logged ${entry.name} ${entry.ids.length} times in the last ${FREQUENT_FOOD_WINDOW_DAYS} days — worth saving as a meal for one-tap logging.`,
      entry.ids.map((id) => evidence('food_items', id, entry.name)),
      'info',
    ),
  );

  return {
    insights,
    rationale: makeRationale(
      insights.length > 0 ? ['FREQUENT_FOODS'] : ['FREQUENT_FOODS_NONE'],
      {
        period,
        threshold: FREQUENT_FOOD_MIN_COUNT,
        distinctItems: counts.size,
        frequent: frequent.map(([key, entry]) => ({ name: key, count: entry.ids.length })),
      },
      insights.length > 0
        ? `${insights.length} food${insights.length === 1 ? '' : 's'} showed up at least ${
            FREQUENT_FOOD_MIN_COUNT
          } times in two weeks.`
        : 'No single food was logged four or more times in the last two weeks.',
    ),
  };
}

// ---------------------------------------------------------------------------
// MISSED_TARGET_STREAK
// ---------------------------------------------------------------------------

/** Any macro missed on five of the last seven logged days. */
export function detectMissedTargetStreak(input: InsightInput): DetectorResult {
  const from = addDays(input.today, -(MISSED_TARGET_WINDOW_DAYS - 1));
  const period: DateRange = { from, to: input.today };
  const days = input.nutritionDays.filter(
    (day) => day.date >= from && day.date <= input.today && day.targets != null,
  );

  const counts: Record<string, { missed: number; dates: LocalDate[] }> = {};
  for (const key of MACRO_KEYS) counts[key] = { missed: 0, dates: [] };

  for (const day of days) {
    if (day.targets == null) continue;
    for (const key of MACRO_KEYS) {
      if (macroMissed(key, day.consumed[key], day.targets[key])) {
        counts[key].missed += 1;
        counts[key].dates.push(day.date);
      }
    }
  }

  const insights: InsightDraft[] = [];
  for (const key of MACRO_KEYS) {
    const entry = counts[key];
    if (entry.missed < MISSED_TARGET_MIN_DAYS) continue;
    insights.push(
      draft(
        'MISSED_TARGET_STREAK',
        period,
        `${MACRO_LABEL[key]} missed ${entry.missed} of the last ${MISSED_TARGET_WINDOW_DAYS} days`,
        `Your ${MACRO_LABEL[key]} target was missed on ${entry.dates.join(
          ', ',
        )}. Either the habit or the target needs adjusting.`,
        entry.dates.map((date) => evidence('nutrition_day', date, MACRO_LABEL[key])),
        'warning',
      ),
    );
  }

  return {
    insights,
    rationale: makeRationale(
      insights.length > 0 ? ['MISSED_TARGET_STREAK'] : ['MISSED_TARGET_STREAK_NONE'],
      {
        period,
        daysWithTargets: days.length,
        threshold: MISSED_TARGET_MIN_DAYS,
        counts: Object.fromEntries(MACRO_KEYS.map((key) => [key, counts[key].missed])),
      },
      insights.length > 0
        ? `${insights.length} macro target${insights.length === 1 ? ' was' : 's were'} missed on ${
            MISSED_TARGET_MIN_DAYS
          } or more of the last ${MISSED_TARGET_WINDOW_DAYS} days.`
        : 'No macro target was missed five or more times this week.',
    ),
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export const INSIGHT_DETECTORS = [
  detectExerciseTrend,
  detectPushPullBalance,
  detectSkippedPattern,
  detectProteinGapByDay,
  detectCompletionByDuration,
  detectFrequentFoods,
  detectMissedTargetStreak,
] as const;

export interface InsightRunResult {
  insights: InsightDraft[];
  /** One rationale per detector, in the DESIGN.md §5.8 order. */
  rationales: Rationale[];
  rationale: Rationale;
}

/** Runs every detector — DESIGN.md §5.8, "on app open, at most once per day". */
export function runInsightDetectors(input: InsightInput): InsightRunResult {
  const results = INSIGHT_DETECTORS.map((detector) => detector(input));
  const insights = results.flatMap((result) => result.insights);
  const codes = results.flatMap((result) => result.rationale.codes);

  return {
    insights,
    rationales: results.map((result) => result.rationale),
    rationale: makeRationale(
      [...new Set(codes)],
      {
        today: input.today,
        period: input.period,
        detectorsRun: INSIGHT_DETECTORS.length,
        insightsFound: insights.length,
        byDetector: Object.fromEntries(
          results.map((result, index) => [INSIGHT_DETECTORS[index].name, result.insights.length]),
        ),
      },
      `${INSIGHT_DETECTORS.length} detectors ran and produced ${insights.length} insight${
        insights.length === 1 ? '' : 's'
      }.`,
    ),
  };
}
