/**
 * "Can't do this" — DESIGN.md §5.5 (substitution engine) and §6.3
 * (`substitute_exercise`: run the engine, apply the pick, keep the
 * alternatives). Ranking is the engine's job; this module only assembles the
 * context from the repositories and writes the pick back.
 *
 * After a swap the loads are re-derived by the progression engine from the new
 * exercise's own history — a component never picks a number (DESIGN.md §11).
 */

import {
  assessReadiness,
  availableEquipmentCategories,
  decideProgression,
  substitute,
  type Id,
  type SubstitutionReason,
  type SubstitutionResult,
  type WorkoutExercise,
} from '@vigor/core';
import type { Repositories } from '@vigor/db';

import { buildHistoryByExercise, exercisedIds } from '../lib/history';
import { incrementKgFor } from '../lib/increments';
import { todayLocalDate } from '../lib/localDate';

export const SUBSTITUTION_REASONS: readonly { value: SubstitutionReason; label: string }[] = [
  { value: 'equipment_unavailable', label: 'The equipment is taken or missing' },
  { value: 'pain', label: 'It hurts today' },
  { value: 'too_hard', label: 'Too hard right now' },
  { value: 'too_easy', label: 'Too easy right now' },
  { value: 'disliked', label: 'I do not like this one' },
  { value: 'variety', label: 'I want something different' },
  { value: 'other', label: 'Another reason' },
];

/** Ranks replacements for one slot of the current workout. */
export async function rankSubstitutes(
  repos: Repositories,
  input: { workoutId: Id; exerciseId: Id; reason: SubstitutionReason; today?: string },
): Promise<SubstitutionResult> {
  const [profile, exercises, relations, equipment, recent, slots] = await Promise.all([
    repos.profile.get(),
    repos.exercises.list(),
    repos.exercises.listRelations(),
    repos.equipment.list(),
    repos.workouts.getRecent({ days: 90, today: input.today }),
    repos.workouts.listExercises(input.workoutId),
  ]);

  return substitute(input.exerciseId, input.reason, {
    exercises,
    relations,
    availableEquipment: availableEquipmentCategories(equipment, profile?.trainingLocation ?? 'gym'),
    exercisedIds: exercisedIds(recent),
    // Everything else in today's session stays off the list.
    excludeExerciseIds: slots.map((slot) => slot.exerciseId),
  });
}

/**
 * Applies the pick: the slot points at the new exercise, remembers what it
 * replaced, and carries fresh targets from the progression engine. The already
 * logged sets are left exactly as they were.
 */
export async function applySubstitution(
  repos: Repositories,
  input: { workoutExerciseId: Id; toExerciseId: Id; today?: string },
): Promise<WorkoutExercise> {
  const slot = await repos.workouts.getExercise(input.workoutExerciseId);
  if (!slot) throw new Error(`VigorEngine: workout exercise ${input.workoutExerciseId} is gone`);

  const today = input.today ?? todayLocalDate();
  const [profile, replacement, equipment, recent, relations, readinessRow, safetyActive] =
    await Promise.all([
      repos.profile.get(),
      repos.exercises.get(input.toExerciseId),
      repos.equipment.list(),
      repos.workouts.getRecent({ days: 90, today: input.today }),
      repos.exercises.listRelations(input.toExerciseId, 'progression'),
      repos.readiness.getByDate(today),
      repos.safety.isActive(),
    ]);
  if (!replacement) throw new Error(`VigorEngine: exercise ${input.toExerciseId} is gone`);

  const unitSystem = profile?.unitSystem ?? 'metric';
  const history = buildHistoryByExercise(recent)[input.toExerciseId] ?? [];
  const decision = decideProgression({
    exerciseId: replacement.id,
    loadType: replacement.loadType,
    repRange: { min: slot.targetRepMin, max: slot.targetRepMax },
    history,
    loadIncrementKg: incrementKgFor({
      exercise: replacement,
      equipment,
      unitSystem,
      currentLoadKg: history.length > 0 ? slot.targetLoadKg : null,
    }),
    // A swap made on a low-readiness day is still a low-readiness day:
    // DESIGN.md §5.1 rules 2 and 3 must apply to the replacement too.
    readinessModifier: assessReadiness(readinessRow, today).modifier,
    safetyActive,
    unitSystem,
    // The slot keeps the sets it already has rows for.
    targetSets: slot.targetSets,
    restSec: slot.restSec,
    progressionExerciseId: relations[0]?.toId ?? null,
  });

  const updated = await repos.workouts.updateExercise(input.workoutExerciseId, {
    exerciseId: replacement.id,
    substitutedFromExerciseId: slot.substitutedFromExerciseId ?? slot.exerciseId,
    targetLoadKg: decision.targetLoadKg,
    targetRepMin: decision.targetRepMin,
    targetRepMax: decision.targetRepMax,
    progressionDecision: decision,
  });

  // Sets not yet logged inherit the new rep target.
  const sets = await repos.sets.listForWorkoutExercise(input.workoutExerciseId);
  for (const set of sets) {
    if (set.completed) continue;
    await repos.sets.update(set.id, { targetReps: decision.targetRepMin });
  }
  return updated;
}
