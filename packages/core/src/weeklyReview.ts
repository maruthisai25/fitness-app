/**
 * Weekly review builder — DESIGN.md §5.9.
 *
 * A deterministic stats object: completed/planned, volume by muscle group, PRs,
 * missed sessions, average kcal/protein, macro consistency and the top
 * insights. It is stored first; the coach summary arrives later as an `ai_job`
 * that fills `summary` and `recommendation`.
 */

import { addDays, daysBetween, startOfWeek } from './dates';
import { macroMissed, MACRO_KEYS, type InsightDraft, type InsightNutritionDay } from './insights';
import { makeRationale } from './rationale';
import type {
  DateRange,
  Exercise,
  Id,
  Insight,
  LocalDate,
  MacroHitRate,
  MuscleGroupVolume,
  NutritionWeekStats,
  PersonalRecord,
  PersonalRecordSummary,
  Rationale,
  TrainingWeekStats,
  WeekDay,
  WorkoutWithExercises,
} from './types';
import { roundTo } from './units';

/** How many insights the review carries into the coach prompt. */
export const TOP_INSIGHT_LIMIT = 3;

const SEVERITY_RANK: Record<Insight['severity'], number> = { warning: 0, notice: 1, info: 2 };

export interface WeeklyReviewInput {
  /** Any day inside the week; it is snapped to the week start. */
  weekOf: LocalDate;
  weekStartsOn?: WeekDay;
  workouts: readonly WorkoutWithExercises[];
  exercises: readonly Exercise[];
  /** Records whose `date` falls inside the week count as this week's PRs. */
  personalRecords?: readonly PersonalRecord[];
  nutritionDays?: readonly InsightNutritionDay[];
  insights?: readonly InsightDraft[];
}

export interface WeeklyReviewStats {
  weekStart: LocalDate;
  weekEnd: LocalDate;
  period: DateRange;
  training: TrainingWeekStats;
  nutrition: NutritionWeekStats;
  topInsights: InsightDraft[];
  rationale: Rationale;
}

const EMPTY_HIT_RATE: MacroHitRate = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

/** Builds the stats half of a `weekly_reviews` row. Pure and deterministic. */
export function buildWeeklyReview(input: WeeklyReviewInput): WeeklyReviewStats {
  const weekStartsOn = input.weekStartsOn ?? 1;
  const weekStart = startOfWeek(input.weekOf, weekStartsOn);
  const weekEnd = addDays(weekStart, 6);
  const period: DateRange = { from: weekStart, to: weekEnd };

  const exercisesById = new Map(input.exercises.map((exercise) => [exercise.id, exercise]));
  const workouts = input.workouts.filter(
    (workout) => workout.date >= weekStart && workout.date <= weekEnd,
  );

  let totalSets = 0;
  let totalVolumeKg = 0;
  const rpeValues: number[] = [];
  const durations: number[] = [];
  const byMuscle = new Map<string, { sets: number; volumeKg: number }>();

  for (const workout of workouts) {
    if (workout.status === 'completed' && workout.startedAt && workout.finishedAt) {
      const minutes = (Date.parse(workout.finishedAt) - Date.parse(workout.startedAt)) / 60_000;
      if (Number.isFinite(minutes) && minutes > 0) durations.push(minutes);
    }
    for (const slot of workout.exercises) {
      const exercise = exercisesById.get(slot.exerciseId);
      const muscles = exercise?.primaryMuscles ?? [];
      for (const set of slot.sets) {
        if (set.isWarmup || !set.completed) continue;
        const volume = (set.actualReps ?? 0) * (set.actualLoadKg ?? 0);
        totalSets += 1;
        totalVolumeKg += volume;
        if (set.rpe != null) rpeValues.push(set.rpe);
        for (const muscle of muscles) {
          const key = muscle.toLowerCase();
          const entry = byMuscle.get(key) ?? { sets: 0, volumeKg: 0 };
          entry.sets += 1;
          entry.volumeKg += volume;
          byMuscle.set(key, entry);
        }
      }
    }
  }

  const workoutsCompleted = workouts.filter((workout) => workout.status === 'completed').length;
  const missedSessions = workouts.filter(
    (workout) =>
      workout.status === 'skipped' ||
      workout.status === 'abandoned' ||
      (workout.status === 'planned' && workout.date < weekEnd),
  ).length;
  const workoutsPlanned = workouts.length;

  const volumeByMuscleGroup: MuscleGroupVolume[] = [...byMuscle.entries()]
    .map(([muscle, entry]) => ({
      muscle,
      sets: entry.sets,
      volumeKg: roundTo(entry.volumeKg, 2),
    }))
    .sort((a, b) => b.volumeKg - a.volumeKg || a.muscle.localeCompare(b.muscle));

  const personalRecords: PersonalRecordSummary[] = (input.personalRecords ?? [])
    .filter((record) => record.date >= weekStart && record.date <= weekEnd)
    .map((record) => ({
      exerciseId: record.exerciseId,
      exerciseName: exercisesById.get(record.exerciseId)?.name ?? 'Unknown exercise',
      kind: record.kind,
      value: record.value,
      date: record.date,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.exerciseName.localeCompare(b.exerciseName));

  const training: TrainingWeekStats = {
    workoutsCompleted,
    workoutsPlanned,
    completionRate: workoutsPlanned === 0 ? 0 : roundTo(workoutsCompleted / workoutsPlanned, 4),
    totalSets,
    totalVolumeKg: roundTo(totalVolumeKg, 2),
    volumeByMuscleGroup,
    personalRecords,
    missedSessions,
    averageRpe:
      rpeValues.length > 0
        ? roundTo(rpeValues.reduce((total, rpe) => total + rpe, 0) / rpeValues.length, 2)
        : null,
    averageDurationMin:
      durations.length > 0
        ? roundTo(durations.reduce((total, value) => total + value, 0) / durations.length, 1)
        : null,
  };

  const nutrition = buildNutritionWeekStats(input.nutritionDays ?? [], weekStart, weekEnd);

  const topInsights = [...(input.insights ?? [])]
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        a.detector.localeCompare(b.detector),
    )
    .slice(0, TOP_INSIGHT_LIMIT);

  const codes = ['WEEKLY_REVIEW_STATS'];
  if (training.personalRecords.length > 0) codes.push('PRS_SET');
  if (training.missedSessions > 0) codes.push('SESSIONS_MISSED');
  if (nutrition.missedTargets.length > 0) codes.push('NUTRITION_TARGETS_MISSED');

  return {
    weekStart,
    weekEnd,
    period,
    training,
    nutrition,
    topInsights,
    rationale: makeRationale(
      codes,
      {
        weekStart,
        weekEnd,
        weekStartsOn,
        workoutsInWeek: workouts.length,
        training,
        nutrition,
        insightsConsidered: input.insights?.length ?? 0,
      },
      `You completed ${training.workoutsCompleted} of ${training.workoutsPlanned} planned sessions, ` +
        `moved ${Math.round(training.totalVolumeKg)} kg of volume across ${training.totalSets} sets` +
        `${
          nutrition.daysLogged > 0
            ? `, and averaged ${Math.round(nutrition.averageKcal)} kcal with ${Math.round(
                nutrition.averageProteinG,
              )} g protein over ${nutrition.daysLogged} logged days`
            : ''
        }.`,
    ),
  };
}

function buildNutritionWeekStats(
  days: readonly InsightNutritionDay[],
  weekStart: LocalDate,
  weekEnd: LocalDate,
): NutritionWeekStats {
  const inWeek = days.filter((day) => day.date >= weekStart && day.date <= weekEnd);
  if (inWeek.length === 0) {
    return {
      daysLogged: 0,
      averageKcal: 0,
      averageProteinG: 0,
      averageCarbsG: 0,
      averageFatG: 0,
      averageFiberG: 0,
      targetHitRate: { ...EMPTY_HIT_RATE },
      missedTargets: [],
    };
  }

  const average = (pick: (day: InsightNutritionDay) => number): number =>
    roundTo(inWeek.reduce((total, day) => total + pick(day), 0) / inWeek.length, 2);

  const withTargets = inWeek.filter((day) => day.targets != null);
  const hitRate: MacroHitRate = { ...EMPTY_HIT_RATE };
  const missedCounts: Record<string, number> = {};

  for (const key of MACRO_KEYS) {
    if (withTargets.length === 0) continue;
    let hits = 0;
    let misses = 0;
    for (const day of withTargets) {
      const target = day.targets as NonNullable<InsightNutritionDay['targets']>;
      if (macroMissed(key, day.consumed[key], target[key])) misses += 1;
      else hits += 1;
    }
    hitRate[key] = roundTo(hits / withTargets.length, 4);
    missedCounts[key] = misses;
  }

  const missedTargets = MACRO_KEYS.filter(
    (key) => (missedCounts[key] ?? 0) > withTargets.length / 2,
  ).map((key) => String(key));

  return {
    daysLogged: inWeek.length,
    averageKcal: average((day) => day.consumed.kcal),
    averageProteinG: average((day) => day.consumed.proteinG),
    averageCarbsG: average((day) => day.consumed.carbsG),
    averageFatG: average((day) => day.consumed.fatG),
    averageFiberG: average((day) => day.consumed.fiberG),
    targetHitRate: hitRate,
    missedTargets,
  };
}

/** Days from `weekStart` to `today`, used by the review scheduler. */
export function daysIntoWeek(today: LocalDate, weekStartsOn: WeekDay = 1): number {
  return daysBetween(startOfWeek(today, weekStartsOn), today);
}

/** The id of the exercise with the most volume this week, or null. */
export function topExerciseOfWeek(stats: WeeklyReviewStats): Id | null {
  return stats.training.personalRecords[0]?.exerciseId ?? null;
}
