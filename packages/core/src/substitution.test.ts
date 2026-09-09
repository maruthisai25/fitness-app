import { beforeEach, describe, expect, it } from 'vitest';

import { makeExercise, makeLibrary, resetFixtureIds } from './fixtures';
import {
  SUBSTITUTION_RESULT_LIMIT,
  SUBSTITUTION_WEIGHTS,
  isEquipmentSatisfied,
  substitute,
  type SubstitutionContext,
} from './substitution';
import type { ExerciseRelation } from './types';

beforeEach(() => {
  resetFixtureIds();
});

const LIBRARY = makeLibrary();

function ctx(overrides: Partial<SubstitutionContext> = {}): SubstitutionContext {
  return {
    exercises: LIBRARY,
    availableEquipment: ['barbell', 'dumbbell', 'machine', 'bodyweight'],
    ...overrides,
  };
}

describe('substitute — DESIGN.md §5.5', () => {
  it('only offers exercises in the same movement pattern', () => {
    const result = substitute('ex-bench', 'equipment_unavailable', ctx());
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const candidate of result.candidates) {
      const exercise = LIBRARY.find((row) => row.id === candidate.exerciseId);
      expect(exercise?.movementPattern).toBe('horizontal_push');
    }
    expect(result.candidates.map((candidate) => candidate.exerciseId)).not.toContain('ex-bench');
  });

  it('drops candidates whose equipment the user does not have', () => {
    const result = substitute(
      'ex-bench',
      'equipment_unavailable',
      ctx({ availableEquipment: ['bodyweight'] }),
    );
    expect(result.candidates.map((candidate) => candidate.exerciseId)).toEqual(['ex-pushup']);
    expect(result.rationale.facts.rejectedForEquipment).toBeGreaterThan(0);
  });

  it('never offers a disliked exercise', () => {
    const result = substitute('ex-bench', 'disliked', ctx({ dislikedExerciseIds: ['ex-dbbench'] }));
    expect(result.candidates.map((candidate) => candidate.exerciseId)).not.toContain('ex-dbbench');
    expect(result.rationale.facts.rejectedForDislike).toBe(1);
  });

  it('ranks an explicit substitution relation above a plain pattern match', () => {
    const relations: ExerciseRelation[] = [
      { fromId: 'ex-bench', toId: 'ex-pushup', kind: 'substitution', note: null },
    ];
    const result = substitute('ex-bench', 'equipment_unavailable', ctx({ relations }));

    expect(result.candidates[0].exerciseId).toBe('ex-pushup');
    expect(result.candidates[0].breakdown.explicitRelation).toBe(
      SUBSTITUTION_WEIGHTS.explicitRelation,
    );
    expect(result.rationale.codes).toContain('EXPLICIT_SUBSTITUTION_RELATION');
  });

  it('reads a relation in either direction', () => {
    const relations: ExerciseRelation[] = [
      { fromId: 'ex-pushup', toId: 'ex-bench', kind: 'substitution', note: null },
    ];
    const result = substitute('ex-bench', 'variety', ctx({ relations }));
    expect(result.candidates[0].exerciseId).toBe('ex-pushup');
  });

  it('scores muscle overlap, difficulty proximity and history', () => {
    const result = substitute('ex-bench', 'variety', ctx({ exercisedIds: ['ex-dbbench'] }));
    const dumbbell = result.candidates.find((candidate) => candidate.exerciseId === 'ex-dbbench');

    expect(dumbbell).toBeDefined();
    expect(dumbbell?.muscleOverlapRatio).toBe(1);
    expect(dumbbell?.breakdown).toEqual({
      explicitRelation: 0,
      muscleOverlap: SUBSTITUTION_WEIGHTS.muscleOverlap,
      difficultyWithinOne: SUBSTITUTION_WEIGHTS.difficultyWithinOne,
      hasHistory: SUBSTITUTION_WEIGHTS.hasHistory,
    });
    expect(dumbbell?.score).toBe(6);
    expect(result.candidates[0].exerciseId).toBe('ex-dbbench');
  });

  it('withholds the difficulty weight when the gap is more than one', () => {
    const library = [
      ...LIBRARY,
      makeExercise({
        id: 'ex-planche',
        name: 'Planche push-up',
        movementPattern: 'horizontal_push',
        equipment: ['bodyweight'],
        difficulty: 5,
        primaryMuscles: ['chest', 'triceps'],
      }),
    ];
    const result = substitute('ex-bench', 'variety', ctx({ exercises: library }));
    const planche = result.candidates.find((candidate) => candidate.exerciseId === 'ex-planche');
    const pushup = result.candidates.find((candidate) => candidate.exerciseId === 'ex-pushup');
    expect(pushup?.breakdown.difficultyWithinOne).toBe(SUBSTITUTION_WEIGHTS.difficultyWithinOne);
    expect(planche?.breakdown.difficultyWithinOne ?? 0).toBe(0);
  });

  it('returns at most three candidates', () => {
    const library = [
      ...LIBRARY,
      makeExercise({ id: 'ex-p1', name: 'Incline press', movementPattern: 'horizontal_push' }),
      makeExercise({ id: 'ex-p2', name: 'Decline press', movementPattern: 'horizontal_push' }),
      makeExercise({ id: 'ex-p3', name: 'Floor press', movementPattern: 'horizontal_push' }),
    ];
    const result = substitute('ex-bench', 'variety', ctx({ exercises: library }));
    expect(result.candidates).toHaveLength(SUBSTITUTION_RESULT_LIMIT);
  });

  it('skips archived exercises and explicit exclusions', () => {
    const library = LIBRARY.map((exercise) =>
      exercise.id === 'ex-pushup' ? { ...exercise, archived: true } : exercise,
    );
    const result = substitute(
      'ex-bench',
      'variety',
      ctx({ exercises: library, excludeExerciseIds: ['ex-dbbench'] }),
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.rationale.codes).toEqual(['NO_SUBSTITUTE_FOUND']);
  });

  it('reports an unknown exercise instead of throwing', () => {
    const result = substitute('ex-nope', 'other', ctx());
    expect(result.candidates).toEqual([]);
    expect(result.rationale.codes).toEqual(['UNKNOWN_EXERCISE']);
  });

  it('carries a rationale on the result and on every candidate', () => {
    const result = substitute('ex-bench', 'pain', ctx());
    expect(result.rationale.summary).toContain('closest match');
    expect(result.rationale.facts.reason).toBe('pain');
    for (const candidate of result.candidates) {
      expect(candidate.rationale.codes).toContain('SAME_MOVEMENT_PATTERN');
      expect(candidate.rationale.summary.length).toBeGreaterThan(0);
    }
  });
});

describe('isEquipmentSatisfied', () => {
  it('treats bodyweight as always available', () => {
    expect(isEquipmentSatisfied(['bodyweight'], [])).toBe(true);
    expect(isEquipmentSatisfied(['barbell'], [])).toBe(false);
    expect(isEquipmentSatisfied(['barbell', 'bodyweight'], ['barbell'])).toBe(true);
  });
});
