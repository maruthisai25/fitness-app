/**
 * Arithmetic over logged sets, shared by the progression, plateau, PR, insight
 * and view-model engines. Pure, no IO.
 */

import type { ExerciseSession, SetRecord } from './types';
import { roundTo } from './units';

/** Epley is only trustworthy in the low-rep range — DESIGN.md §5.7. */
export const E1RM_MAX_REPS = 12;

/**
 * Estimated one-rep max, Epley: `load × (1 + reps / 30)` — DESIGN.md §5.7.
 * Returns null outside the trustworthy range or for a set with no external load.
 */
export function epleyE1rm(loadKg: number | null, reps: number | null): number | null {
  if (loadKg == null || reps == null) return null;
  if (!(loadKg > 0) || !(reps >= 1) || reps > E1RM_MAX_REPS) return null;
  return roundTo(loadKg * (1 + reps / 30), 3);
}

/** Sets that count towards progression: completed, non-warmup, with reps logged. */
export function workingSets(session: ExerciseSession): SetRecord[] {
  return session.sets.filter((set) => !set.isWarmup && set.completed && set.actualReps != null);
}

/** Every non-warmup set, completed or not — used for planned-vs-done comparisons. */
export function plannedWorkingSets(session: ExerciseSession): SetRecord[] {
  return session.sets.filter((set) => !set.isWarmup);
}

export function repsOf(sets: readonly SetRecord[]): number[] {
  return sets.map((set) => set.actualReps ?? 0);
}

/** Mean RPE across the rated sets, or null when the user rated none. */
export function meanRpe(sets: readonly SetRecord[]): number | null {
  const rated = sets.map((set) => set.rpe).filter((rpe): rpe is number => rpe != null);
  if (rated.length === 0) return null;
  return roundTo(rated.reduce((sum, rpe) => sum + rpe, 0) / rated.length, 3);
}

/**
 * The load the session was actually worked at: the value carried by the most
 * sets, ties broken towards the heavier load. Null when nothing was loaded.
 */
export function sessionLoadKg(session: ExerciseSession): number | null {
  const loads = workingSets(session)
    .map((set) => set.actualLoadKg)
    .filter((load): load is number => load != null);
  if (loads.length === 0) return session.targetLoadKg;

  const counts = new Map<number, number>();
  for (const load of loads) counts.set(load, (counts.get(load) ?? 0) + 1);

  let best = loads[0];
  let bestCount = 0;
  for (const [load, count] of counts) {
    if (count > bestCount || (count === bestCount && load > best)) {
      best = load;
      bestCount = count;
    }
  }
  return best;
}

/** `Σ reps × load` over the working sets, canonical kg. */
export function sessionVolumeKg(session: ExerciseSession): number {
  return roundTo(
    workingSets(session).reduce(
      (sum, set) => sum + (set.actualReps ?? 0) * (set.actualLoadKg ?? 0),
      0,
    ),
    3,
  );
}

/** Best estimated 1RM in the session, or null when no set qualifies. */
export function bestE1rm(session: ExerciseSession): number | null {
  let best: number | null = null;
  for (const set of workingSets(session)) {
    const value = epleyE1rm(set.actualLoadKg, set.actualReps);
    if (value != null && (best == null || value > best)) best = value;
  }
  return best;
}

/** Most reps completed in any working set. */
export function bestReps(session: ExerciseSession): number {
  return workingSets(session).reduce((best, set) => Math.max(best, set.actualReps ?? 0), 0);
}

/** Heaviest load moved for at least one rep. */
export function bestLoadKg(session: ExerciseSession): number | null {
  let best: number | null = null;
  for (const set of workingSets(session)) {
    if (set.actualLoadKg == null || (set.actualReps ?? 0) < 1) continue;
    if (best == null || set.actualLoadKg > best) best = set.actualLoadKg;
  }
  return best;
}

/** Arithmetic mean, or null for an empty list. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return roundTo(values.reduce((sum, value) => sum + value, 0) / values.length, 4);
}

export function sum(values: readonly number[]): number {
  return roundTo(
    values.reduce((total, value) => total + value, 0),
    4,
  );
}

/** Least-squares slope of `y` over `x`, or null when `x` never varies. */
export function linearSlope(points: readonly { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const meanX = points.reduce((total, p) => total + p.x, 0) / n;
  const meanY = points.reduce((total, p) => total + p.y, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    covariance += dx * (point.y - meanY);
    variance += dx * dx;
  }
  if (variance <= 0) return null;
  return roundTo(covariance / variance, 6);
}

/** Sorts sessions oldest → newest without mutating the input. */
export function sortSessionsAscending(sessions: readonly ExerciseSession[]): ExerciseSession[] {
  return [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Sorts sessions newest → oldest without mutating the input. */
export function sortSessionsDescending(sessions: readonly ExerciseSession[]): ExerciseSession[] {
  return sortSessionsAscending(sessions).reverse();
}
