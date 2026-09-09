/**
 * Finishing a session — DESIGN.md §5.7 (PR engine) and §7.1 ("finish summary
 * with PRs"). The records engine decides what counts as a personal record; this
 * module only persists what it decided and shapes the summary the screen shows.
 *
 * `e1rm` and `max_load` are celebrated loudly; every other kind is listed
 * quietly, exactly as DESIGN.md §5.7 prescribes.
 */

import {
  detectPersonalRecords,
  sessionVolumeKg,
  type Id,
  type PersonalRecord,
  type PersonalRecordKind,
  type Rationale,
  type UnitSystem,
  type Workout,
  type WorkoutWithExercises,
} from '@vigor/core';
import type { Repositories } from '@vigor/db';

import { sessionsOf } from '../lib/history';

/** DESIGN.md §5.7 — the two kinds the UI celebrates. */
export const LOUD_RECORD_KINDS: readonly PersonalRecordKind[] = ['e1rm', 'max_load'];

export interface SessionRecordSummary {
  record: PersonalRecord;
  exerciseId: Id;
  exerciseName: string;
}

export interface SessionSummary {
  workout: Workout;
  durationMin: number | null;
  totalVolumeKg: number;
  setsCompleted: number;
  setsPlanned: number;
  /** New `e1rm` / `max_load` records — the celebration. */
  celebrated: SessionRecordSummary[];
  /** Every other new record, listed quietly. */
  quiet: SessionRecordSummary[];
  /** One rationale per exercise, so "Why?" can explain the verdict. */
  rationales: { exerciseId: Id; exerciseName: string; rationale: Rationale }[];
}

function durationMinutes(workout: Workout): number | null {
  if (!workout.startedAt || !workout.finishedAt) return null;
  const ms = Date.parse(workout.finishedAt) - Date.parse(workout.startedAt);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60_000)) : null;
}

/**
 * Marks the workout complete, runs the PR engine over every exercise in it and
 * stores the records it found. Returns what the finish screen renders.
 */
export async function finishSession(
  repos: Repositories,
  workoutId: Id,
  options: { unitSystem: UnitSystem; exerciseNames: ReadonlyMap<Id, string> },
): Promise<SessionSummary> {
  const before = await repos.workouts.getWithExercises(workoutId);
  if (!before) throw new Error(`VigorEngine: workout ${workoutId} is gone`);

  const celebrated: SessionRecordSummary[] = [];
  const quiet: SessionRecordSummary[] = [];
  const rationales: SessionSummary['rationales'] = [];

  for (const session of sessionsOf(before)) {
    const existing = await repos.records.listForExercise(session.exerciseId);
    const detected = detectPersonalRecords({
      exerciseId: session.exerciseId,
      date: before.date,
      sets: session.sets,
      existing,
      unitSystem: options.unitSystem,
    });
    const exerciseName = options.exerciseNames.get(session.exerciseId) ?? 'This exercise';
    rationales.push({
      exerciseId: session.exerciseId,
      exerciseName,
      rationale: detected.rationale,
    });
    for (const draft of detected.records) {
      const stored = await repos.records.create(draft);
      const entry = { record: stored, exerciseId: session.exerciseId, exerciseName };
      if (LOUD_RECORD_KINDS.includes(stored.kind)) celebrated.push(entry);
      else quiet.push(entry);
    }
  }

  const workout = await repos.workouts.finish(workoutId, 'completed');
  return {
    workout,
    durationMin: durationMinutes(workout),
    ...volumeOf(before),
    celebrated,
    quiet,
    rationales,
  };
}

/** Abandoning keeps every set already logged — DESIGN.md §4.1 `abandoned`. */
export async function abandonSession(repos: Repositories, workoutId: Id): Promise<Workout> {
  return repos.workouts.finish(workoutId, 'abandoned');
}

/** Total volume and set counts, straight from the core set arithmetic. */
export function volumeOf(workout: WorkoutWithExercises): {
  totalVolumeKg: number;
  setsCompleted: number;
  setsPlanned: number;
} {
  let totalVolumeKg = 0;
  let setsCompleted = 0;
  let setsPlanned = 0;
  for (const session of sessionsOf(workout)) {
    totalVolumeKg += sessionVolumeKg(session);
    for (const set of session.sets) {
      if (set.isWarmup) continue;
      setsPlanned += 1;
      if (set.completed) setsCompleted += 1;
    }
  }
  return { totalVolumeKg: Math.round(totalVolumeKg * 100) / 100, setsCompleted, setsPlanned };
}
