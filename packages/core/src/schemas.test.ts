import { describe, expect, it } from 'vitest';

import { isUuidV7, newId } from './ids';
import { progressionDecisionSchema, rationaleSchema, workoutPlanSchema } from './schemas';
import type { WorkoutPlan } from './types';

describe('ids', () => {
  it('mints UUID v7 strings', () => {
    const id = newId();
    expect(isUuidV7(id)).toBe(true);
  });

  it('sorts by creation time because v7 is time-ordered', () => {
    const first = newId();
    const second = newId();
    expect([second, first].sort()).toEqual([first, second]);
  });
});

describe('rationaleSchema', () => {
  it('accepts a template-generated rationale', () => {
    const rationale = {
      codes: ['ALL_SETS_TOP_OF_RANGE', 'RPE_UNDER_THRESHOLD'],
      facts: { meanRpe: 8, repsPerSet: [12, 12, 12] },
      summary: 'You hit 12 reps on every set at RPE 8, so the load goes up one increment.',
    };
    expect(rationaleSchema.parse(rationale)).toEqual(rationale);
  });

  it('rejects a rationale with no summary sentence', () => {
    const result = rationaleSchema.safeParse({ codes: [], facts: {} });
    expect(result.success).toBe(false);
  });
});

describe('workoutPlanSchema', () => {
  const plan: WorkoutPlan = {
    date: '2026-09-10',
    title: 'Lower body — squat focus',
    focus: ['quads', 'glutes'],
    plannedDurationMin: 45,
    source: 'rule',
    exercises: [
      {
        exerciseId: newId(),
        order: 0,
        targetSets: 3,
        targetRepMin: 8,
        targetRepMax: 12,
        targetLoadKg: 60,
        restSec: 120,
        tempo: null,
        substitutedFromExerciseId: null,
        progressionDecision: null,
        notes: null,
      },
    ],
    readinessId: null,
    notes: null,
    rationale: {
      codes: ['LEAST_RECENTLY_TRAINED'],
      facts: { daysSinceLastLowerBody: 4 },
      summary: 'Your last lower-body session was four days ago.',
    },
  };

  it('round-trips a plan the rule-based planner would produce', () => {
    expect(workoutPlanSchema.parse(plan)).toEqual(plan);
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    const result = workoutPlanSchema.safeParse({ ...plan, date: '10/09/2026' });
    expect(result.success).toBe(false);
  });
});

describe('progressionDecisionSchema', () => {
  it('requires a rationale on every decision', () => {
    const result = progressionDecisionSchema.safeParse({
      exerciseId: newId(),
      action: 'increase_load',
      targetLoadKg: 62.5,
      targetRepMin: 8,
      targetRepMax: 12,
      targetSets: 3,
      restSec: 120,
      suggestedExerciseId: null,
      loadDeltaKg: 2.5,
    });
    expect(result.success).toBe(false);
  });
});
