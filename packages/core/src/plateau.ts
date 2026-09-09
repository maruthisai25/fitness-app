/**
 * Plateau & deload detector — DESIGN.md §5.3.
 *
 * Per exercise: no new e1RM or rep PR over the last four sessions **and** a
 * rising mean-RPE trend → `PLATEAU`, with suggestions (variation swap via
 * `exercise_relations`, rep-range change, deload).
 *
 * Global: a rolling 14-day RPE mean ≥ 8.8 together with weekly volume ≥ 1.3 ×
 * the 6-week mean, **or** two readiness `reduce` days in one week →
 * `DELOAD_RECOMMENDED` (next week volume −40 %, loads −10 %). Deload is
 * proposed, never imposed (DESIGN.md §5.3).
 */

import { addDays, daysBetween } from './dates';
import { makeRationale } from './rationale';
import {
  bestE1rm,
  bestReps,
  linearSlope,
  meanRpe,
  sortSessionsAscending,
  workingSets,
} from './setMath';
import type {
  ExerciseRelation,
  ExerciseSession,
  Id,
  LocalDate,
  Rationale,
  ReadinessModifier,
  RepRange,
  WorkoutWithExercises,
} from './types';
import { roundTo } from './units';

/** How many recent sessions a plateau verdict looks at. */
export const PLATEAU_WINDOW_SESSIONS = 4;
/** A rising RPE trend means at least this much RPE gained per session. */
export const PLATEAU_RPE_SLOPE_MIN = 0.05;

/** DESIGN.md §5.3 — global deload thresholds. */
export const DELOAD_RPE_MEAN_MIN = 8.8;
export const DELOAD_VOLUME_RATIO_MIN = 1.3;
export const DELOAD_REDUCE_DAYS_IN_WEEK = 2;
/** The proposed prescription: volume −40 %, loads −10 %. */
export const DELOAD_VOLUME_MULTIPLIER = 0.6;
export const DELOAD_LOAD_MULTIPLIER = 0.9;

export type PlateauSuggestionKind = 'variation_swap' | 'rep_range_change' | 'deload';

export interface PlateauSuggestion {
  kind: PlateauSuggestionKind;
  /** Set for `variation_swap`: the exercise to try instead. */
  exerciseId: Id | null;
  /** Set for `rep_range_change`: the range to move to. */
  repRange: RepRange | null;
  detail: string;
}

export interface PlateauInput {
  exerciseId: Id;
  exerciseName: string;
  /** Sessions of this exercise; order does not matter, they are sorted here. */
  history: readonly ExerciseSession[];
  /** The range currently being worked, used to propose an alternative. */
  repRange: RepRange;
  /** `exercise_relations` rows whose `fromId` is this exercise. */
  relations?: readonly ExerciseRelation[];
}

export interface PlateauResult {
  exerciseId: Id;
  plateaued: boolean;
  sessionsConsidered: number;
  /** Best e1RM seen before the window, the bar the window failed to clear. */
  baselineE1rm: number | null;
  baselineReps: number;
  /** RPE gained per session across the window; positive means it is getting harder. */
  rpeSlopePerSession: number | null;
  suggestions: PlateauSuggestion[];
  rationale: Rationale;
}

/**
 * Looks for a stalled exercise. Needs at least `PLATEAU_WINDOW_SESSIONS + 1`
 * sessions: one to set the bar and four that failed to clear it.
 */
export function detectPlateau(input: PlateauInput): PlateauResult {
  const { exerciseId, exerciseName, repRange } = input;
  const sessions = sortSessionsAscending(input.history).filter(
    (session) => workingSets(session).length > 0,
  );

  const notPlateaued = (codes: string[], facts: Record<string, unknown>, summary: string) => ({
    exerciseId,
    plateaued: false,
    sessionsConsidered: sessions.length,
    baselineE1rm: null,
    baselineReps: 0,
    rpeSlopePerSession: null,
    suggestions: [],
    rationale: makeRationale(codes, facts, summary),
  });

  if (sessions.length < PLATEAU_WINDOW_SESSIONS + 1) {
    return notPlateaued(
      ['NOT_ENOUGH_SESSIONS'],
      { exerciseId, sessions: sessions.length, required: PLATEAU_WINDOW_SESSIONS + 1 },
      `${exerciseName} has ${sessions.length} logged sessions; a plateau verdict needs ${
        PLATEAU_WINDOW_SESSIONS + 1
      }.`,
    );
  }

  const window = sessions.slice(-PLATEAU_WINDOW_SESSIONS);
  const before = sessions.slice(0, -PLATEAU_WINDOW_SESSIONS);

  const baselineE1rm = before.reduce<number | null>((best, session) => {
    const value = bestE1rm(session);
    return value != null && (best == null || value > best) ? value : best;
  }, null);
  const baselineReps = before.reduce((best, session) => Math.max(best, bestReps(session)), 0);

  const newE1rm = window.some((session) => {
    const value = bestE1rm(session);
    return value != null && baselineE1rm != null && value > baselineE1rm;
  });
  const newRepPr = window.some((session) => bestReps(session) > baselineReps);

  const rpePoints = window
    .map((session, index) => ({ x: index, y: meanRpe(workingSets(session)) }))
    .filter((point): point is { x: number; y: number } => point.y != null);
  const rpeSlope = linearSlope(rpePoints);
  const rpeRising = rpeSlope != null && rpeSlope >= PLATEAU_RPE_SLOPE_MIN;

  const facts: Record<string, unknown> = {
    exerciseId,
    exerciseName,
    windowSessions: window.map((session) => session.date),
    baselineE1rm,
    baselineReps,
    windowBestE1rm: window.reduce<number | null>((best, session) => {
      const value = bestE1rm(session);
      return value != null && (best == null || value > best) ? value : best;
    }, null),
    windowBestReps: window.reduce((best, session) => Math.max(best, bestReps(session)), 0),
    newE1rmPr: newE1rm,
    newRepPr,
    rpeSlopePerSession: rpeSlope,
  };

  if (newE1rm || newRepPr) {
    return {
      exerciseId,
      plateaued: false,
      sessionsConsidered: sessions.length,
      baselineE1rm,
      baselineReps,
      rpeSlopePerSession: rpeSlope,
      suggestions: [],
      rationale: makeRationale(
        ['STILL_PROGRESSING'],
        facts,
        `${exerciseName} set a new ${newE1rm ? 'estimated 1RM' : 'rep'} best inside the last ${
          PLATEAU_WINDOW_SESSIONS
        } sessions, so it is still progressing.`,
      ),
    };
  }

  if (!rpeRising) {
    return {
      exerciseId,
      plateaued: false,
      sessionsConsidered: sessions.length,
      baselineE1rm,
      baselineReps,
      rpeSlopePerSession: rpeSlope,
      suggestions: [],
      rationale: makeRationale(
        ['NO_PR_BUT_RPE_STEADY'],
        facts,
        `${exerciseName} has not set a best in ${PLATEAU_WINDOW_SESSIONS} sessions, but effort is not climbing, so this is not a plateau yet.`,
      ),
    };
  }

  const relations = input.relations ?? [];
  const swap =
    relations.find((relation) => relation.kind === 'variation') ??
    relations.find((relation) => relation.kind === 'substitution') ??
    null;

  const suggestions: PlateauSuggestion[] = [];
  if (swap) {
    suggestions.push({
      kind: 'variation_swap',
      exerciseId: swap.toId,
      repRange: null,
      detail: `Swap in a variation for a block to give the pattern a new stimulus.`,
    });
  }
  suggestions.push({
    kind: 'rep_range_change',
    exerciseId: null,
    repRange: alternativeRepRange(repRange),
    detail: `Move from ${repRange.min}–${repRange.max} to ${alternativeRepRange(repRange).min}–${
      alternativeRepRange(repRange).max
    } reps for a few weeks.`,
  });
  suggestions.push({
    kind: 'deload',
    exerciseId: null,
    repRange: null,
    detail: `Take one lighter week at about ${Math.round(
      DELOAD_LOAD_MULTIPLIER * 100,
    )} % load before pushing again.`,
  });

  return {
    exerciseId,
    plateaued: true,
    sessionsConsidered: sessions.length,
    baselineE1rm,
    baselineReps,
    rpeSlopePerSession: rpeSlope,
    suggestions,
    rationale: makeRationale(
      ['PLATEAU', 'NO_NEW_PR', 'RPE_TREND_RISING'],
      facts,
      `${exerciseName} has gone ${PLATEAU_WINDOW_SESSIONS} sessions without a new best while effort keeps climbing (RPE +${roundTo(
        rpeSlope ?? 0,
        2,
      )} per session).`,
    ),
  };
}

/** Shifts the range: heavy work goes lighter and longer, and vice versa. */
function alternativeRepRange(range: RepRange): RepRange {
  if (range.max <= 6) return { min: range.min + 4, max: range.max + 6 };
  if (range.max >= 15) return { min: Math.max(1, range.min - 4), max: range.max - 6 };
  return { min: Math.max(1, range.min - 3), max: Math.max(2, range.max - 4) };
}

/** One day of readiness history, as the deload detector needs it. */
export interface ReadinessDay {
  date: LocalDate;
  modifier: ReadinessModifier;
}

export interface DeloadInput {
  today: LocalDate;
  /** At least six weeks of workouts for the 6-week volume mean. */
  workouts: readonly WorkoutWithExercises[];
  readiness: readonly ReadinessDay[];
}

export interface DeloadRecommendation {
  recommended: boolean;
  /** Multiplier to apply to next week's volume when accepted. */
  volumeMultiplier: number;
  /** Multiplier to apply to next week's loads when accepted. */
  loadMultiplier: number;
  rolling14DayMeanRpe: number | null;
  lastWeekVolumeKg: number;
  sixWeekMeanWeeklyVolumeKg: number;
  reduceDaysThisWeek: number;
  rationale: Rationale;
}

/** DESIGN.md §5.3 — the global deload check. Proposes, never imposes. */
export function detectDeload(input: DeloadInput): DeloadRecommendation {
  const { today, workouts, readiness } = input;

  const from14 = addDays(today, -13);
  const from7 = addDays(today, -6);
  const from42 = addDays(today, -41);

  const rpeValues: number[] = [];
  let lastWeekVolume = 0;
  let sixWeekVolume = 0;

  for (const workout of workouts) {
    const inLast14 = workout.date >= from14 && workout.date <= today;
    const inLast7 = workout.date >= from7 && workout.date <= today;
    const inLast42 = workout.date >= from42 && workout.date <= today;
    if (!inLast42) continue;

    for (const exercise of workout.exercises) {
      for (const set of exercise.sets) {
        if (set.isWarmup || !set.completed) continue;
        if (inLast14 && set.rpe != null) rpeValues.push(set.rpe);
        const volume = (set.actualReps ?? 0) * (set.actualLoadKg ?? 0);
        if (inLast7) lastWeekVolume += volume;
        sixWeekVolume += volume;
      }
    }
  }

  const rolling14DayMeanRpe =
    rpeValues.length > 0
      ? roundTo(rpeValues.reduce((total, rpe) => total + rpe, 0) / rpeValues.length, 3)
      : null;
  const sixWeekMeanWeeklyVolumeKg = roundTo(sixWeekVolume / 6, 3);
  const lastWeekVolumeKg = roundTo(lastWeekVolume, 3);

  const reduceDaysThisWeek = readiness.filter(
    (day) => day.modifier === 'reduce' && daysBetween(from7, day.date) >= 0 && day.date <= today,
  ).length;

  const rpeHigh = rolling14DayMeanRpe != null && rolling14DayMeanRpe >= DELOAD_RPE_MEAN_MIN;
  const volumeHigh =
    sixWeekMeanWeeklyVolumeKg > 0 &&
    lastWeekVolumeKg >= DELOAD_VOLUME_RATIO_MIN * sixWeekMeanWeeklyVolumeKg;
  const readinessTriggered = reduceDaysThisWeek >= DELOAD_REDUCE_DAYS_IN_WEEK;

  const facts: Record<string, unknown> = {
    today,
    rolling14DayMeanRpe,
    lastWeekVolumeKg,
    sixWeekMeanWeeklyVolumeKg,
    volumeRatio:
      sixWeekMeanWeeklyVolumeKg > 0
        ? roundTo(lastWeekVolumeKg / sixWeekMeanWeeklyVolumeKg, 3)
        : null,
    reduceDaysThisWeek,
    thresholds: {
      meanRpe: DELOAD_RPE_MEAN_MIN,
      volumeRatio: DELOAD_VOLUME_RATIO_MIN,
      reduceDays: DELOAD_REDUCE_DAYS_IN_WEEK,
    },
  };

  if (rpeHigh && volumeHigh) {
    return {
      recommended: true,
      volumeMultiplier: DELOAD_VOLUME_MULTIPLIER,
      loadMultiplier: DELOAD_LOAD_MULTIPLIER,
      rolling14DayMeanRpe,
      lastWeekVolumeKg,
      sixWeekMeanWeeklyVolumeKg,
      reduceDaysThisWeek,
      rationale: makeRationale(
        ['DELOAD_RECOMMENDED', 'RPE_MEAN_HIGH', 'VOLUME_SPIKE'],
        facts,
        `Your last two weeks averaged RPE ${rolling14DayMeanRpe} and this week's volume is ${roundTo(
          lastWeekVolumeKg / sixWeekMeanWeeklyVolumeKg,
          2,
        )}× your six-week average — a lighter week is worth taking.`,
      ),
    };
  }

  if (readinessTriggered) {
    return {
      recommended: true,
      volumeMultiplier: DELOAD_VOLUME_MULTIPLIER,
      loadMultiplier: DELOAD_LOAD_MULTIPLIER,
      rolling14DayMeanRpe,
      lastWeekVolumeKg,
      sixWeekMeanWeeklyVolumeKg,
      reduceDaysThisWeek,
      rationale: makeRationale(
        ['DELOAD_RECOMMENDED', 'READINESS_REDUCE_DAYS'],
        facts,
        `You logged ${reduceDaysThisWeek} low-readiness days this week, so a lighter week is worth taking.`,
      ),
    };
  }

  return {
    recommended: false,
    volumeMultiplier: 1,
    loadMultiplier: 1,
    rolling14DayMeanRpe,
    lastWeekVolumeKg,
    sixWeekMeanWeeklyVolumeKg,
    reduceDaysThisWeek,
    rationale: makeRationale(
      ['NO_DELOAD_NEEDED'],
      facts,
      'Effort and volume are both inside their normal range, so no deload is needed.',
    ),
  };
}
