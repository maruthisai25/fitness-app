import { beforeEach, describe, expect, it } from 'vitest';

import {
  makeEquipment,
  makeGoal,
  makeLibrary,
  makeProfile,
  makeSession,
  makeWorkout,
  resetFixtureIds,
} from './fixtures';
import {
  GOAL_TEMPLATES,
  PATTERN_GROUP_OF,
  SECONDS_PER_SET_WORK,
  availableEquipmentCategories,
  daysSinceGroupTrained,
  exerciseCostSeconds,
  planWorkout,
  type PlannerInput,
} from './planner';
import type { Exercise, Id } from './types';

beforeEach(() => {
  resetFixtureIds();
});

const LIBRARY = makeLibrary();
const BY_ID = new Map(LIBRARY.map((exercise) => [exercise.id, exercise]));

const FULL_GYM = [
  makeEquipment({ id: 'eq-bar', category: 'barbell' }),
  makeEquipment({ id: 'eq-db', name: 'Dumbbells', category: 'dumbbell' }),
  makeEquipment({ id: 'eq-machine', name: 'Row machine', category: 'machine' }),
];

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    date: '2026-09-10',
    profile: makeProfile({ preferredDurationMin: 45 }),
    goals: [makeGoal({ type: 'hypertrophy', priority: 1 })],
    exercises: LIBRARY,
    equipment: FULL_GYM,
    recentWorkouts: [],
    ...overrides,
  };
}

function patternGroupsOf(exerciseIds: readonly Id[]): string[] {
  return exerciseIds.map((id) => PATTERN_GROUP_OF[(BY_ID.get(id) as Exercise).movementPattern]);
}

describe('exercise cost — DESIGN.md §5.4', () => {
  it('charges sets × (rest + 40 s)', () => {
    expect(SECONDS_PER_SET_WORK).toBe(40);
    expect(exerciseCostSeconds(3, 90)).toBe(390);
  });
});

describe('equipment and location filtering', () => {
  it('always includes bodyweight and every available row', () => {
    expect(availableEquipmentCategories(FULL_GYM, 'gym').sort()).toEqual(
      ['barbell', 'bodyweight', 'dumbbell', 'machine'].sort(),
    );
  });

  it('drops machines and cables in a hotel unless explicitly owned', () => {
    expect(availableEquipmentCategories([], 'hotel')).toEqual(['bodyweight']);
    expect(
      availableEquipmentCategories([makeEquipment({ category: 'machine' })], 'hotel'),
    ).toContain('machine');
  });

  it('ignores unavailable rows', () => {
    const categories = availableEquipmentCategories(
      [makeEquipment({ category: 'barbell', available: false })],
      'home',
    );
    expect(categories).toEqual(['bodyweight']);
  });

  it('plans only bodyweight work with bands-and-nothing-else', () => {
    const plan = planWorkout(
      input({
        profile: makeProfile({ trainingLocation: 'home', preferredDurationMin: 30 }),
        equipment: [],
      }),
    );
    for (const slot of plan.exercises) {
      expect(BY_ID.get(slot.exerciseId)?.equipment).toEqual(['bodyweight']);
    }
    expect(plan.rationale.codes).toContain('EQUIPMENT_FILTERED');
  });
});

describe('least recently trained rotation', () => {
  it('counts days since a pattern group was last completed', () => {
    const workouts = [
      makeWorkout({
        date: '2026-09-08',
        exercises: [{ exerciseId: 'ex-bench', reps: [10, 10] }],
      }),
    ];
    expect(daysSinceGroupTrained('push', '2026-09-10', workouts, BY_ID)).toBe(2);
    expect(daysSinceGroupTrained('pull', '2026-09-10', workouts, BY_ID)).toBeNull();
  });

  it('leads with the group trained longest ago', () => {
    const workouts = [
      makeWorkout({ date: '2026-09-09', exercises: [{ exerciseId: 'ex-squat', reps: [8] }] }),
      makeWorkout({ date: '2026-09-08', exercises: [{ exerciseId: 'ex-rdl', reps: [8] }] }),
      makeWorkout({ date: '2026-09-07', exercises: [{ exerciseId: 'ex-bench', reps: [8] }] }),
      makeWorkout({ date: '2026-09-04', exercises: [{ exerciseId: 'ex-row', reps: [8] }] }),
    ];
    const plan = planWorkout(input({ recentWorkouts: workouts }));

    expect(plan.groupOrder[0]).toBe('pull');
    expect(plan.rationale.codes).toContain('LEAST_RECENTLY_TRAINED');
    expect(plan.rationale.facts.daysSincePrimaryGroup).toBe(6);
    expect(patternGroupsOf(plan.exercises.map((slot) => slot.exerciseId))[0]).toBe('pull');
    expect(plan.title).toContain('pull');
  });

  it('treats a never-trained group as the least recently trained', () => {
    const workouts = [
      makeWorkout({ date: '2026-09-09', exercises: [{ exerciseId: 'ex-squat', reps: [8] }] }),
      makeWorkout({ date: '2026-09-08', exercises: [{ exerciseId: 'ex-bench', reps: [8] }] }),
      makeWorkout({ date: '2026-09-07', exercises: [{ exerciseId: 'ex-row', reps: [8] }] }),
    ];
    const plan = planWorkout(input({ recentWorkouts: workouts }));
    expect(plan.groupOrder[0]).toBe('hinge');
  });

  it('ignores workouts that were never completed', () => {
    const workouts = [
      makeWorkout({
        date: '2026-09-09',
        status: 'skipped',
        exercises: [{ exerciseId: 'ex-row', reps: [8] }],
      }),
    ];
    expect(daysSinceGroupTrained('pull', '2026-09-10', workouts, BY_ID)).toBeNull();
  });
});

describe('duration budget', () => {
  it('never plans more work than the window allows', () => {
    const plan = planWorkout(input({ durationMin: 20 }));
    const cost = plan.exercises.reduce(
      (total, slot) => total + exerciseCostSeconds(slot.targetSets, slot.restSec),
      0,
    );
    expect(cost).toBeLessThanOrEqual(20 * 60);
    expect(plan.estimatedSeconds).toBe(cost);
    expect(plan.plannedDurationMin).toBeLessThanOrEqual(20);
    expect(plan.rationale.facts.droppedForTime).toBeGreaterThan(0);
  });

  it('fits more work into a longer window', () => {
    const short = planWorkout(input({ durationMin: 20 }));
    const long = planWorkout(input({ durationMin: 75 }));
    expect(long.exercises.length).toBeGreaterThan(short.exercises.length);
  });

  it('always plans at least one exercise, even in a tiny window', () => {
    const plan = planWorkout(input({ durationMin: 1 }));
    expect(plan.exercises).toHaveLength(1);
  });

  it('uses the profile duration when no override is given', () => {
    const plan = planWorkout(input({ profile: makeProfile({ preferredDurationMin: 30 }) }));
    expect(plan.rationale.facts.durationMin).toBe(30);
    expect(plan.estimatedSeconds).toBeLessThanOrEqual(30 * 60);
  });
});

describe('goals shape the session', () => {
  it('uses the strength template for a strength-first athlete', () => {
    const plan = planWorkout(
      input({ goals: [makeGoal({ type: 'strength', priority: 1 })], durationMin: 90 }),
    );
    expect(plan.exercises[0].targetSets).toBe(GOAL_TEMPLATES.strength.sets);
    expect(plan.exercises[0].restSec).toBe(GOAL_TEMPLATES.strength.restSec);
    expect(plan.exercises[0].targetRepMin).toBe(GOAL_TEMPLATES.strength.repRange.min);
  });

  it('honours goal priority and ignores inactive goals', () => {
    const plan = planWorkout(
      input({
        goals: [
          makeGoal({ type: 'strength', priority: 2 }),
          makeGoal({ type: 'endurance', priority: 1 }),
          makeGoal({ type: 'fat_loss', priority: 0, active: false }),
        ],
        durationMin: 90,
      }),
    );
    expect(plan.rationale.facts.primaryGoal).toBe('endurance');
  });
});

describe('dislikes, safety and readiness', () => {
  it('never plans a disliked exercise', () => {
    const plan = planWorkout(
      input({ dislikedExerciseIds: ['ex-squat', 'ex-goblet'], durationMin: 90 }),
    );
    const ids = plan.exercises.map((slot) => slot.exerciseId);
    expect(ids).not.toContain('ex-squat');
    expect(ids).not.toContain('ex-goblet');
    expect(plan.rationale.codes).toContain('DISLIKES_EXCLUDED');
  });

  it('drops an excluded movement pattern entirely', () => {
    const plan = planWorkout(
      input({ excludedPatterns: ['horizontal_push', 'vertical_push'], durationMin: 90 }),
    );
    for (const slot of plan.exercises) {
      expect(PATTERN_GROUP_OF[(BY_ID.get(slot.exerciseId) as Exercise).movementPattern]).not.toBe(
        'push',
      );
    }
    expect(plan.rationale.codes).toContain('PATTERN_EXCLUDED');
  });

  it('passes the readiness modifier through to every progression decision', () => {
    const plan = planWorkout(input({ readinessModifier: 'reduce', durationMin: 90 }));
    expect(plan.rationale.codes).toContain('READINESS_REDUCE');
    for (const slot of plan.exercises) {
      expect(slot.progressionDecision?.rationale.codes).toContain('READINESS_REDUCE');
    }
  });

  it('holds every load while a safety event is open', () => {
    const plan = planWorkout(input({ safetyActive: true, durationMin: 90 }));
    expect(plan.rationale.codes).toContain('SAFETY_HOLD');
    for (const slot of plan.exercises) {
      expect(slot.progressionDecision?.rationale.codes).toEqual(['SAFETY_HOLD']);
      expect(slot.progressionDecision?.loadDeltaKg).toBe(0);
    }
  });
});

describe('progression is applied to every slot', () => {
  it('carries loads over from history and increases where earned', () => {
    const plan = planWorkout(
      input({
        recentWorkouts: [
          makeWorkout({ date: '2026-09-09', exercises: [{ exerciseId: 'ex-squat', reps: [8] }] }),
          makeWorkout({ date: '2026-09-08', exercises: [{ exerciseId: 'ex-rdl', reps: [8] }] }),
          makeWorkout({ date: '2026-09-07', exercises: [{ exerciseId: 'ex-bench', reps: [8] }] }),
        ],
        historyByExercise: {
          'ex-row': [
            makeSession({
              date: '2026-09-04',
              exerciseId: 'ex-row',
              reps: [12, 12, 12],
              loadKg: 60,
              rpe: 8,
            }),
          ],
        },
        durationMin: 90,
      }),
    );

    const row = plan.exercises.find((slot) => slot.exerciseId === 'ex-row');
    expect(row).toBeDefined();
    expect(row?.progressionDecision?.action).toBe('increase_load');
    expect(row?.targetLoadKg).toBe(62.5);
  });

  it('uses the equipment row increment when one is set', () => {
    const plan = planWorkout(
      input({
        equipment: [makeEquipment({ id: 'eq-bar', category: 'barbell', loadIncrementKg: 1.25 })],
        recentWorkouts: [
          makeWorkout({ date: '2026-09-09', exercises: [{ exerciseId: 'ex-squat', reps: [8] }] }),
          makeWorkout({ date: '2026-09-08', exercises: [{ exerciseId: 'ex-rdl', reps: [8] }] }),
          makeWorkout({ date: '2026-09-07', exercises: [{ exerciseId: 'ex-row', reps: [8] }] }),
        ],
        historyByExercise: {
          'ex-bench': [
            makeSession({
              date: '2026-09-04',
              exerciseId: 'ex-bench',
              reps: [12, 12, 12],
              loadKg: 60,
            }),
          ],
        },
        durationMin: 90,
      }),
    );
    const bench = plan.exercises.find((slot) => slot.exerciseId === 'ex-bench');
    expect(bench?.targetLoadKg).toBe(61.25);
  });

  it('uses the exercise default rep range for non-loadable work', () => {
    const plan = planWorkout(
      input({
        equipment: [],
        profile: makeProfile({ trainingLocation: 'home' }),
        durationMin: 90,
      }),
    );
    const plank = plan.exercises.find((slot) => slot.exerciseId === 'ex-plank');
    expect(plank?.targetRepMin).toBe(30);
    expect(plank?.targetRepMax).toBe(60);
  });
});

describe('plan shape', () => {
  it('produces an ordered, focused, rationale-carrying WorkoutPlan', () => {
    const plan = planWorkout(input({ durationMin: 60 }));

    expect(plan.source).toBe('rule');
    expect(plan.date).toBe('2026-09-10');
    expect(plan.exercises.map((slot) => slot.order)).toEqual(
      plan.exercises.map((_, index) => index),
    );
    expect(new Set(plan.exercises.map((slot) => slot.exerciseId)).size).toBe(plan.exercises.length);
    expect(plan.focus.length).toBeGreaterThan(0);
    expect(plan.rationale.codes).toContain('RULE_BASED_PLAN');
    expect(plan.rationale.summary.length).toBeGreaterThan(0);
    expect(plan.readinessId).toBeNull();
  });

  it('is deterministic for the same input', () => {
    expect(planWorkout(input())).toEqual(planWorkout(input()));
  });

  it('handles an empty library without throwing', () => {
    const plan = planWorkout(input({ exercises: [] }));
    expect(plan.exercises).toEqual([]);
    expect(plan.title).toBe('Full body');
    expect(plan.plannedDurationMin).toBe(0);
  });

  it('respects a hard cap on exercise count', () => {
    const plan = planWorkout(input({ durationMin: 240, maxExercises: 2 }));
    expect(plan.exercises).toHaveLength(2);
  });
});
