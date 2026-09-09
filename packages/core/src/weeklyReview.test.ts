import { beforeEach, describe, expect, it } from 'vitest';

import { makeLibrary, makeTargets, makeWorkout, resetFixtureIds } from './fixtures';
import type { InsightDraft, InsightNutritionDay } from './insights';
import {
  TOP_INSIGHT_LIMIT,
  buildWeeklyReview,
  daysIntoWeek,
  topExerciseOfWeek,
} from './weeklyReview';
import type { MacroTotals, PersonalRecord } from './types';

beforeEach(() => {
  resetFixtureIds();
});

const LIBRARY = makeLibrary();

function macros(partial: Partial<MacroTotals> = {}): MacroTotals {
  return { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, ...partial };
}

describe('buildWeeklyReview — DESIGN.md §5.9', () => {
  it('snaps any day in the week to the configured week start', () => {
    const review = buildWeeklyReview({
      weekOf: '2026-09-10',
      weekStartsOn: 1,
      workouts: [],
      exercises: LIBRARY,
    });
    expect(review.weekStart).toBe('2026-09-07');
    expect(review.weekEnd).toBe('2026-09-13');
    expect(review.period).toEqual({ from: '2026-09-07', to: '2026-09-13' });

    const sunday = buildWeeklyReview({
      weekOf: '2026-09-10',
      weekStartsOn: 0,
      workouts: [],
      exercises: LIBRARY,
    });
    expect(sunday.weekStart).toBe('2026-09-06');
  });

  it('counts completed versus planned and totals volume by muscle group', () => {
    const review = buildWeeklyReview({
      weekOf: '2026-09-10',
      workouts: [
        makeWorkout({
          date: '2026-09-07',
          status: 'completed',
          exercises: [
            { exerciseId: 'ex-bench', reps: [10, 10, 10], loadKg: 60, rpe: 8 },
            { exerciseId: 'ex-row', reps: [10, 10], loadKg: 50, rpe: 7 },
          ],
        }),
        makeWorkout({ date: '2026-09-09', status: 'skipped' }),
        makeWorkout({ date: '2026-09-08', status: 'completed', exercises: [] }),
      ],
      exercises: LIBRARY,
    });

    expect(review.training.workoutsCompleted).toBe(2);
    expect(review.training.workoutsPlanned).toBe(3);
    expect(review.training.completionRate).toBeCloseTo(0.6667, 3);
    expect(review.training.missedSessions).toBe(1);
    expect(review.training.totalSets).toBe(5);
    expect(review.training.totalVolumeKg).toBe(2800);
    expect(review.training.averageRpe).toBe(7.6);

    const chest = review.training.volumeByMuscleGroup.find((row) => row.muscle === 'chest');
    expect(chest).toEqual({ muscle: 'chest', sets: 3, volumeKg: 1800 });
    const back = review.training.volumeByMuscleGroup.find((row) => row.muscle === 'back');
    expect(back).toEqual({ muscle: 'back', sets: 2, volumeKg: 1000 });
  });

  it('ignores workouts outside the week', () => {
    const review = buildWeeklyReview({
      weekOf: '2026-09-10',
      workouts: [
        makeWorkout({ date: '2026-09-06', status: 'completed' }),
        makeWorkout({ date: '2026-09-14', status: 'completed' }),
      ],
      exercises: LIBRARY,
    });
    expect(review.training.workoutsPlanned).toBe(0);
    expect(review.training.completionRate).toBe(0);
  });

  it('summarises the personal records set inside the week', () => {
    const records: PersonalRecord[] = [
      {
        id: 'pr-1',
        exerciseId: 'ex-bench',
        kind: 'e1rm',
        value: 83.3,
        loadKg: 62.5,
        reps: 10,
        setId: 'set-1',
        date: '2026-09-08',
      },
      {
        id: 'pr-2',
        exerciseId: 'ex-bench',
        kind: 'e1rm',
        value: 80,
        loadKg: 60,
        reps: 10,
        setId: 'set-0',
        date: '2026-08-01',
      },
    ];
    const review = buildWeeklyReview({
      weekOf: '2026-09-10',
      workouts: [],
      exercises: LIBRARY,
      personalRecords: records,
    });

    expect(review.training.personalRecords).toEqual([
      {
        exerciseId: 'ex-bench',
        exerciseName: 'Barbell bench press',
        kind: 'e1rm',
        value: 83.3,
        date: '2026-09-08',
      },
    ]);
    expect(review.rationale.codes).toContain('PRS_SET');
  });

  it('averages nutrition and reports which targets were missed', () => {
    const targets = makeTargets({ kcal: 2600, proteinG: 150, carbsG: 280, fatG: 72, fiberG: 36 });
    const days: InsightNutritionDay[] = [
      {
        date: '2026-09-07',
        consumed: macros({ kcal: 2600, proteinG: 100, carbsG: 280, fatG: 72, fiberG: 36 }),
        targets,
      },
      {
        date: '2026-09-08',
        consumed: macros({ kcal: 2600, proteinG: 100, carbsG: 280, fatG: 72, fiberG: 36 }),
        targets,
      },
      {
        date: '2026-09-09',
        consumed: macros({ kcal: 2600, proteinG: 150, carbsG: 280, fatG: 72, fiberG: 36 }),
        targets,
      },
    ];

    const review = buildWeeklyReview({
      weekOf: '2026-09-10',
      workouts: [],
      exercises: LIBRARY,
      nutritionDays: days,
    });

    expect(review.nutrition.daysLogged).toBe(3);
    expect(review.nutrition.averageKcal).toBe(2600);
    expect(review.nutrition.averageProteinG).toBeCloseTo(116.67, 1);
    expect(review.nutrition.targetHitRate.kcal).toBe(1);
    expect(review.nutrition.targetHitRate.proteinG).toBeCloseTo(0.3333, 3);
    expect(review.nutrition.missedTargets).toEqual(['proteinG']);
    expect(review.rationale.codes).toContain('NUTRITION_TARGETS_MISSED');
  });

  it('returns an empty nutrition block when nothing was logged', () => {
    const review = buildWeeklyReview({
      weekOf: '2026-09-10',
      workouts: [],
      exercises: LIBRARY,
    });
    expect(review.nutrition).toEqual({
      daysLogged: 0,
      averageKcal: 0,
      averageProteinG: 0,
      averageCarbsG: 0,
      averageFatG: 0,
      averageFiberG: 0,
      targetHitRate: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
      missedTargets: [],
    });
  });

  it('keeps the three most severe insights', () => {
    const insight = (detector: string, severity: InsightDraft['severity']): InsightDraft => ({
      detector,
      period: { from: '2026-09-07', to: '2026-09-13' },
      headline: detector,
      detail: detector,
      evidence: [],
      severity,
      dismissed: false,
      dismissedAt: null,
    });

    const review = buildWeeklyReview({
      weekOf: '2026-09-10',
      workouts: [],
      exercises: LIBRARY,
      insights: [
        insight('A_INFO', 'info'),
        insight('B_WARNING', 'warning'),
        insight('C_NOTICE', 'notice'),
        insight('D_WARNING', 'warning'),
      ],
    });

    expect(review.topInsights).toHaveLength(TOP_INSIGHT_LIMIT);
    expect(review.topInsights.map((item) => item.detector)).toEqual([
      'B_WARNING',
      'D_WARNING',
      'C_NOTICE',
    ]);
  });

  it('computes average session duration from the start and finish timestamps', () => {
    const workout = makeWorkout({ date: '2026-09-08', status: 'completed' });
    const review = buildWeeklyReview({
      weekOf: '2026-09-10',
      workouts: [
        {
          ...workout,
          startedAt: '2026-09-08T17:00:00.000Z',
          finishedAt: '2026-09-08T17:48:00.000Z',
        },
      ],
      exercises: LIBRARY,
    });
    expect(review.training.averageDurationMin).toBe(48);
  });

  it('carries a summary sentence in the rationale', () => {
    const review = buildWeeklyReview({
      weekOf: '2026-09-10',
      workouts: [makeWorkout({ date: '2026-09-08', status: 'completed' })],
      exercises: LIBRARY,
    });
    expect(review.rationale.codes).toContain('WEEKLY_REVIEW_STATS');
    expect(review.rationale.summary).toContain('completed 1 of 1');
  });
});

describe('daysIntoWeek', () => {
  it('counts from the configured week start', () => {
    expect(daysIntoWeek('2026-09-10', 1)).toBe(3);
    expect(daysIntoWeek('2026-09-07', 1)).toBe(0);
  });
});

describe('topExerciseOfWeek', () => {
  it('names the exercise behind the first PR, or nothing', () => {
    const empty = buildWeeklyReview({
      weekOf: '2026-09-10',
      workouts: [],
      exercises: LIBRARY,
    });
    expect(topExerciseOfWeek(empty)).toBeNull();

    const withPr = buildWeeklyReview({
      weekOf: '2026-09-10',
      workouts: [],
      exercises: LIBRARY,
      personalRecords: [
        {
          id: 'pr-1',
          exerciseId: 'ex-row',
          kind: 'max_load',
          value: 70,
          loadKg: 70,
          reps: 5,
          setId: null,
          date: '2026-09-09',
        },
      ],
    });
    expect(topExerciseOfWeek(withPr)).toBe('ex-row');
  });
});
