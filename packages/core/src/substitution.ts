/**
 * Substitution engine — DESIGN.md §5.5.
 *
 * `substitute(exerciseId, reason, ctx)` ranks candidates by:
 *
 *   same movement pattern              must
 *   equipment available                must
 *   not disliked                       must
 *   explicit `substitution` relation   weight 4
 *   primary muscle overlap             weight 3
 *   difficulty within ±1               weight 2
 *   user has history with it           weight 1
 *
 * Returns the top three with a rationale.
 */

import { makeRationale } from './rationale';
import type { EquipmentCategory, Exercise, ExerciseRelation, Id, Rationale } from './types';
import { roundTo } from './units';

export const SUBSTITUTION_WEIGHTS = {
  explicitRelation: 4,
  muscleOverlap: 3,
  difficultyWithinOne: 2,
  hasHistory: 1,
} as const;

export const SUBSTITUTION_RESULT_LIMIT = 3;

/** Why the user wants a swap — carried into the rationale and the coach turn. */
export type SubstitutionReason =
  'equipment_unavailable' | 'pain' | 'disliked' | 'too_hard' | 'too_easy' | 'variety' | 'other';

export interface SubstitutionContext {
  /** The full library, custom exercises included. */
  exercises: readonly Exercise[];
  /** Every relation row; both directions are considered. */
  relations?: readonly ExerciseRelation[];
  /** Equipment categories the user can actually use right now. */
  availableEquipment: readonly EquipmentCategory[];
  /** Exercises the user has logged at least one working set of. */
  exercisedIds?: readonly Id[];
  /** Exercises the user has told us they dislike, or that hurt. */
  dislikedExerciseIds?: readonly Id[];
  /** Extra ids to exclude, e.g. the rest of today's session. */
  excludeExerciseIds?: readonly Id[];
}

export interface SubstitutionScoreBreakdown {
  explicitRelation: number;
  muscleOverlap: number;
  difficultyWithinOne: number;
  hasHistory: number;
}

export interface SubstitutionCandidate {
  exerciseId: Id;
  name: string;
  score: number;
  breakdown: SubstitutionScoreBreakdown;
  /** Share of the original's primary muscles this candidate also trains, 0–1. */
  muscleOverlapRatio: number;
  difficultyDelta: number;
  rationale: Rationale;
}

export interface SubstitutionResult {
  exerciseId: Id;
  reason: SubstitutionReason;
  candidates: SubstitutionCandidate[];
  rationale: Rationale;
}

/** `bodyweight` needs no kit, so it is always usable. */
export function isEquipmentSatisfied(
  required: readonly EquipmentCategory[],
  available: readonly EquipmentCategory[],
): boolean {
  return required.every((category) => category === 'bodyweight' || available.includes(category));
}

function overlapRatio(original: readonly string[], candidate: readonly string[]): number {
  if (original.length === 0) return 0;
  const candidateSet = new Set(candidate.map((muscle) => muscle.toLowerCase()));
  const hits = original.filter((muscle) => candidateSet.has(muscle.toLowerCase())).length;
  return roundTo(hits / original.length, 4);
}

/** Ranks replacements for one exercise. Pure; the caller applies the top pick. */
export function substitute(
  exerciseId: Id,
  reason: SubstitutionReason,
  ctx: SubstitutionContext,
): SubstitutionResult {
  const original = ctx.exercises.find((exercise) => exercise.id === exerciseId) ?? null;
  const disliked = new Set(ctx.dislikedExerciseIds ?? []);
  const excluded = new Set([exerciseId, ...(ctx.excludeExerciseIds ?? [])]);
  const withHistory = new Set(ctx.exercisedIds ?? []);
  const relations = ctx.relations ?? [];

  if (original == null) {
    return {
      exerciseId,
      reason,
      candidates: [],
      rationale: makeRationale(
        ['UNKNOWN_EXERCISE'],
        { exerciseId },
        'That exercise is not in the library, so no substitution could be ranked.',
      ),
    };
  }

  const explicitTargets = new Set(
    relations
      .filter(
        (relation) =>
          relation.kind === 'substitution' &&
          (relation.fromId === exerciseId || relation.toId === exerciseId),
      )
      .map((relation) => (relation.fromId === exerciseId ? relation.toId : relation.fromId)),
  );

  const candidates: SubstitutionCandidate[] = [];
  let rejectedForEquipment = 0;
  let rejectedForPattern = 0;
  let rejectedForDislike = 0;

  for (const candidate of ctx.exercises) {
    if (excluded.has(candidate.id) || candidate.archived) continue;
    if (candidate.movementPattern !== original.movementPattern) {
      rejectedForPattern += 1;
      continue;
    }
    if (disliked.has(candidate.id)) {
      rejectedForDislike += 1;
      continue;
    }
    if (!isEquipmentSatisfied(candidate.equipment, ctx.availableEquipment)) {
      rejectedForEquipment += 1;
      continue;
    }

    const ratio = overlapRatio(original.primaryMuscles, candidate.primaryMuscles);
    const difficultyDelta = candidate.difficulty - original.difficulty;
    const breakdown: SubstitutionScoreBreakdown = {
      explicitRelation: explicitTargets.has(candidate.id)
        ? SUBSTITUTION_WEIGHTS.explicitRelation
        : 0,
      muscleOverlap: roundTo(SUBSTITUTION_WEIGHTS.muscleOverlap * ratio, 4),
      difficultyWithinOne:
        Math.abs(difficultyDelta) <= 1 ? SUBSTITUTION_WEIGHTS.difficultyWithinOne : 0,
      hasHistory: withHistory.has(candidate.id) ? SUBSTITUTION_WEIGHTS.hasHistory : 0,
    };
    const score = roundTo(
      breakdown.explicitRelation +
        breakdown.muscleOverlap +
        breakdown.difficultyWithinOne +
        breakdown.hasHistory,
      4,
    );

    const reasons: string[] = [];
    if (breakdown.explicitRelation > 0) reasons.push('EXPLICIT_SUBSTITUTION_RELATION');
    if (ratio >= 0.5) reasons.push('PRIMARY_MUSCLE_OVERLAP');
    if (breakdown.difficultyWithinOne > 0) reasons.push('DIFFICULTY_MATCH');
    if (breakdown.hasHistory > 0) reasons.push('USER_HAS_HISTORY');
    reasons.push('SAME_MOVEMENT_PATTERN');

    candidates.push({
      exerciseId: candidate.id,
      name: candidate.name,
      score,
      breakdown,
      muscleOverlapRatio: ratio,
      difficultyDelta,
      rationale: makeRationale(
        reasons,
        {
          exerciseId: candidate.id,
          movementPattern: candidate.movementPattern,
          muscleOverlapRatio: ratio,
          difficultyDelta,
          score,
          breakdown,
        },
        `${candidate.name} is the same ${original.movementPattern.replace('_', ' ')} pattern, ` +
          `covers ${Math.round(ratio * 100)} % of the same primary muscles and needs only ` +
          `equipment you have.`,
      ),
    });
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      Math.abs(a.difficultyDelta) - Math.abs(b.difficultyDelta) ||
      a.name.localeCompare(b.name),
  );

  const top = candidates.slice(0, SUBSTITUTION_RESULT_LIMIT);
  const facts: Record<string, unknown> = {
    exerciseId,
    exerciseName: original.name,
    reason,
    movementPattern: original.movementPattern,
    considered: ctx.exercises.length,
    rejectedForPattern,
    rejectedForEquipment,
    rejectedForDislike,
    ranked: candidates.length,
    picks: top.map((candidate) => ({ exerciseId: candidate.exerciseId, score: candidate.score })),
  };

  if (top.length === 0) {
    return {
      exerciseId,
      reason,
      candidates: [],
      rationale: makeRationale(
        ['NO_SUBSTITUTE_FOUND'],
        facts,
        `Nothing in the library matches ${original.name}'s movement pattern with the equipment you have available.`,
      ),
    };
  }

  return {
    exerciseId,
    reason,
    candidates: top,
    rationale: makeRationale(
      ['SUBSTITUTION_RANKED', ...top[0].rationale.codes],
      facts,
      `${top[0].name} is the closest match for ${original.name}: same movement pattern, ` +
        `${Math.round(top[0].muscleOverlapRatio * 100)} % primary-muscle overlap and equipment you have.`,
    ),
  };
}
