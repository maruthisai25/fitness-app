/**
 * Plumbing shared by every coach tool — DESIGN.md §6.3.
 *
 * Tool results are JSON strings so the model reads one predictable shape:
 * `{"ok":true, …}` or `{"ok":false,"error":"…","hint":"…"}`. A tool that
 * cannot do what was asked returns `ok:false` and says why; it does not throw,
 * because a thrown tool is a dead turn while a refusal the model can read is a
 * turn it can recover from.
 */

import {
  formatLoad,
  type EquipmentCategory,
  type Exercise,
  type Id,
  type LocalDate,
  type UnitSystem,
} from '@vigor/core';
import type { Repositories } from '@vigor/db';
import { z } from 'zod';

/** `YYYY-MM-DD`, the only date shape any tool accepts. */
export const localDateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a YYYY-MM-DD calendar date');

/** A row id as the app writes them. */
export const idInput = z.string().min(1).max(64);

/** A successful tool result. */
export function ok(payload: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...payload });
}

/** A refused tool result: the model sees why and can try something else. */
export function fail(error: string, hint?: string): string {
  return JSON.stringify(hint == null ? { ok: false, error } : { ok: false, error, hint });
}

/** The unit system to phrase loads in. Metric when there is no profile yet. */
export async function unitSystemOf(repos: Repositories): Promise<UnitSystem> {
  const profile = await repos.profile.get();
  return profile?.unitSystem ?? 'metric';
}

/**
 * A load as both the canonical number and the string the coach should say.
 * DESIGN.md §4: storage is always metric; display happens through
 * `@vigor/core/units`.
 */
export function loadFields(
  loadKg: number | null,
  unitSystem: UnitSystem,
  incrementKg?: number | null,
): { loadKg: number | null; display: string } {
  return {
    loadKg,
    display: loadKg == null ? 'bodyweight' : formatLoad(loadKg, unitSystem, incrementKg),
  };
}

/**
 * The equipment category that decides an exercise's load increment: the first
 * non-bodyweight category it needs, since that is what the user loads.
 */
export function loadingCategoryOf(exercise: Exercise): EquipmentCategory | null {
  return exercise.equipment.find((category) => category !== 'bodyweight') ?? null;
}

/** Categories the user can actually use right now, `bodyweight` always included. */
export async function availableCategories(repos: Repositories): Promise<EquipmentCategory[]> {
  const rows = await repos.equipment.listAvailable();
  const set = new Set<EquipmentCategory>(['bodyweight']);
  for (const row of rows) set.add(row.category);
  return [...set].sort();
}

/**
 * Exercise ids the user has told the coach they dislike or that hurt. Memories
 * of kind `dislike` or `injury` carry `exercises` evidence rows when the coach
 * stored them properly (DESIGN.md §4.1 `memories.evidence`).
 */
export async function dislikedExerciseIds(repos: Repositories): Promise<Id[]> {
  const memories = await repos.memories.listActive();
  const ids = new Set<Id>();
  for (const memory of memories) {
    if (memory.kind !== 'dislike' && memory.kind !== 'injury') continue;
    for (const evidence of memory.evidence) {
      if (evidence.table === 'exercises') ids.add(evidence.id);
    }
  }
  return [...ids].sort();
}

/** Exercise ids with at least one logged session, for the substitution engine. */
export async function exercisedIds(repos: Repositories, today: LocalDate): Promise<Id[]> {
  const workouts = await repos.workouts.getRecent({ days: 180, today });
  const ids = new Set<Id>();
  for (const workout of workouts) {
    for (const entry of workout.exercises) {
      if (entry.sets.some((set) => set.completed)) ids.add(entry.exerciseId);
    }
  }
  return [...ids].sort();
}
