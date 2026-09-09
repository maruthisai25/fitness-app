import { beforeEach, describe, expect, it } from 'vitest';

import { addDays } from './dates';
import {
  makeFoodItem,
  makeLibrary,
  makeSession,
  makeTargets,
  makeWorkout,
  resetFixtureIds,
} from './fixtures';
import {
  DURATION_BUCKETS,
  FREQUENT_FOOD_MIN_COUNT,
  INSIGHT_DETECTORS,
  MACRO_KEYS,
  detectCompletionByDuration,
  detectExerciseTrend,
  detectFrequentFoods,
  detectMissedTargetStreak,
  detectProteinGapByDay,
  detectPushPullBalance,
  detectSkippedPattern,
  durationBucketOf,
  macroMissed,
  runInsightDetectors,
  type InsightInput,
  type InsightNutritionDay,
} from './insights';
import type { MacroTotals } from './types';

beforeEach(() => {
  resetFixtureIds();
});

const TODAY = '2026-09-10';
const LIBRARY = makeLibrary();

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    today: TODAY,
    period: { from: addDays(TODAY, -27), to: TODAY },
    workouts: [],
    exercises: LIBRARY,
    exerciseHistories: [],
    nutritionDays: [],
    ...overrides,
  };
}

function macros(partial: Partial<MacroTotals> = {}): MacroTotals {
  return { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, ...partial };
}

// ---------------------------------------------------------------------------

describe('EXERCISE_TREND', () => {
  const rising = Array.from({ length: 6 }, (_, index) =>
    makeSession({
      date: addDays('2026-08-01', index * 7),
      exerciseId: 'ex-bench',
      reps: [8, 8, 8],
      loadKg: 60 + index * 2.5,
    }),
  );

  it('fires with six sessions and a clear slope', () => {
    const result = detectExerciseTrend(
      input({
        exerciseHistories: [
          { exerciseId: 'ex-bench', exerciseName: 'Barbell bench press', sessions: rising },
        ],
      }),
    );

    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].detector).toBe('EXERCISE_TREND');
    expect(result.insights[0].headline).toContain('trending up');
    expect(result.insights[0].severity).toBe('info');
    expect(result.insights[0].evidence).toHaveLength(6);
  });

  it('flags a falling trend as a notice', () => {
    const falling = [...rising].reverse().map((session, index) => ({
      ...session,
      date: addDays('2026-08-01', index * 7),
    }));
    const result = detectExerciseTrend(
      input({
        exerciseHistories: [
          { exerciseId: 'ex-bench', exerciseName: 'Barbell bench press', sessions: falling },
        ],
      }),
    );
    expect(result.insights[0].severity).toBe('notice');
    expect(result.insights[0].headline).toContain('trending down');
  });

  it('does not fire below six sessions', () => {
    const result = detectExerciseTrend(
      input({
        exerciseHistories: [
          {
            exerciseId: 'ex-bench',
            exerciseName: 'Barbell bench press',
            sessions: rising.slice(0, 5),
          },
        ],
      }),
    );
    expect(result.insights).toEqual([]);
    expect(result.rationale.codes).toEqual(['EXERCISE_TREND_NONE']);
  });

  it('does not fire on a flat trend', () => {
    const flat = Array.from({ length: 6 }, (_, index) =>
      makeSession({
        date: addDays('2026-08-01', index * 7),
        exerciseId: 'ex-bench',
        reps: [8, 8, 8],
        loadKg: 60,
      }),
    );
    const result = detectExerciseTrend(
      input({
        exerciseHistories: [
          { exerciseId: 'ex-bench', exerciseName: 'Barbell bench press', sessions: flat },
        ],
      }),
    );
    expect(result.insights).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('PUSH_PULL_BALANCE', () => {
  const pushWorkout = (date: string, sets: number) =>
    makeWorkout({
      date,
      exercises: [
        { exerciseId: 'ex-bench', reps: Array.from({ length: sets }, () => 10), loadKg: 60 },
      ],
    });
  const pullWorkout = (date: string, sets: number) =>
    makeWorkout({
      date,
      exercises: [
        { exerciseId: 'ex-row', reps: Array.from({ length: sets }, () => 10), loadKg: 60 },
      ],
    });

  it('fires when pushing outruns pulling', () => {
    const result = detectPushPullBalance(
      input({ workouts: [pushWorkout('2026-09-08', 12), pullWorkout('2026-09-07', 4)] }),
    );
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].headline).toContain('Pushing volume');
    expect(result.rationale.facts.ratio).toBe(3);
  });

  it('fires when pulling outruns pushing', () => {
    const result = detectPushPullBalance(
      input({ workouts: [pushWorkout('2026-09-08', 3), pullWorkout('2026-09-07', 12)] }),
    );
    expect(result.insights[0].headline).toContain('Pulling volume');
  });

  it('does not fire inside the 0.75–1.33 band', () => {
    const result = detectPushPullBalance(
      input({ workouts: [pushWorkout('2026-09-08', 9), pullWorkout('2026-09-07', 9)] }),
    );
    expect(result.insights).toEqual([]);
    expect(result.rationale.codes).toEqual(['PUSH_PULL_BALANCED']);
  });

  it('does not fire on too few sets', () => {
    const result = detectPushPullBalance(input({ workouts: [pushWorkout('2026-09-08', 2)] }));
    expect(result.insights).toEqual([]);
    expect(result.rationale.codes).toContain('NOT_ENOUGH_SETS');
  });

  it('ignores workouts outside the four-week window and unfinished ones', () => {
    const result = detectPushPullBalance(
      input({
        workouts: [
          pushWorkout('2026-06-01', 20),
          { ...pullWorkout('2026-09-05', 20), status: 'skipped' as const },
          pushWorkout('2026-09-08', 6),
          pullWorkout('2026-09-07', 6),
        ],
      }),
    );
    expect(result.rationale.facts.pushSets).toBe(6);
    expect(result.rationale.facts.pullSets).toBe(6);
  });
});

// ---------------------------------------------------------------------------

describe('SKIPPED_PATTERN', () => {
  it('fires for a weekday that rarely gets finished', () => {
    // 2026-08-17, -24, -31 and 2026-09-07 are Mondays.
    const workouts = [
      makeWorkout({ date: '2026-08-17', status: 'skipped' }),
      makeWorkout({ date: '2026-08-24', status: 'skipped' }),
      makeWorkout({ date: '2026-08-31', status: 'abandoned' }),
      makeWorkout({ date: '2026-09-07', status: 'completed' }),
    ];
    const result = detectSkippedPattern(input({ workouts }));
    const weekday = result.insights.find((insight) => insight.headline.includes('Monday'));

    expect(weekday).toBeDefined();
    expect(weekday?.detector).toBe('SKIPPED_PATTERN');
    expect(weekday?.detail).toContain('1 of 4');
  });

  it('does not fire above a 50 % completion rate', () => {
    const workouts = [
      makeWorkout({ date: '2026-08-17', status: 'completed' }),
      makeWorkout({ date: '2026-08-24', status: 'completed' }),
      makeWorkout({ date: '2026-08-31', status: 'skipped' }),
    ];
    expect(detectSkippedPattern(input({ workouts })).insights).toEqual([]);
  });

  it('does not fire on fewer than three sessions in a bucket', () => {
    const workouts = [
      makeWorkout({ date: '2026-08-17', status: 'skipped' }),
      makeWorkout({ date: '2026-08-24', status: 'skipped' }),
    ];
    const result = detectSkippedPattern(input({ workouts }));
    expect(result.insights).toEqual([]);
    expect(result.rationale.codes).toEqual(['SKIPPED_PATTERN_NONE']);
  });
});

// ---------------------------------------------------------------------------

describe('COMPLETION_BY_DURATION', () => {
  const short = (date: string, status: 'completed' | 'skipped') =>
    makeWorkout({ date, status, plannedDurationMin: 25 });
  const long = (date: string, status: 'completed' | 'skipped') =>
    makeWorkout({ date, status, plannedDurationMin: 75 });

  it('buckets planned durations', () => {
    expect(durationBucketOf(20).key).toBe('under_30');
    expect(durationBucketOf(30).key).toBe('30_44');
    expect(durationBucketOf(50).key).toBe('45_59');
    expect(durationBucketOf(90).key).toBe('60_plus');
    expect(DURATION_BUCKETS).toHaveLength(4);
  });

  it('fires when completion swings with session length', () => {
    const workouts = [
      short('2026-08-18', 'completed'),
      short('2026-08-19', 'completed'),
      short('2026-08-20', 'completed'),
      long('2026-08-21', 'skipped'),
      long('2026-08-22', 'skipped'),
      long('2026-08-23', 'skipped'),
    ];
    const result = detectCompletionByDuration(input({ workouts }));
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].headline).toContain('under 30 minutes');
    expect(result.rationale.facts.spread).toBe(1);
  });

  it('does not fire when completion is flat across buckets', () => {
    const workouts = [
      short('2026-08-18', 'completed'),
      short('2026-08-19', 'completed'),
      short('2026-08-20', 'completed'),
      long('2026-08-21', 'completed'),
      long('2026-08-22', 'completed'),
      long('2026-08-23', 'completed'),
    ];
    const result = detectCompletionByDuration(input({ workouts }));
    expect(result.insights).toEqual([]);
    expect(result.rationale.codes).toEqual(['COMPLETION_BY_DURATION_FLAT']);
  });

  it('does not fire with only one populated bucket', () => {
    const workouts = [
      short('2026-08-18', 'completed'),
      short('2026-08-19', 'skipped'),
      short('2026-08-20', 'completed'),
    ];
    const result = detectCompletionByDuration(input({ workouts }));
    expect(result.rationale.codes).toContain('NOT_ENOUGH_BUCKETS');
  });
});

// ---------------------------------------------------------------------------

describe('PROTEIN_GAP_BY_DAY', () => {
  const targets = makeTargets({ proteinG: 150 });
  const day = (date: string, proteinG: number): InsightNutritionDay => ({
    date,
    consumed: macros({ proteinG }),
    targets,
  });

  it('fires for a weekday averaging under 85 % of target', () => {
    const result = detectProteinGapByDay(
      input({
        // Saturdays in this window.
        nutritionDays: [day('2026-08-29', 90), day('2026-09-05', 100)],
      }),
    );
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].headline).toContain('Saturday');
    expect(result.insights[0].detail).toContain('63 %');
  });

  it('does not fire above 85 %', () => {
    const result = detectProteinGapByDay(
      input({ nutritionDays: [day('2026-08-29', 140), day('2026-09-05', 150)] }),
    );
    expect(result.insights).toEqual([]);
    expect(result.rationale.codes).toEqual(['PROTEIN_GAP_BY_DAY_NONE']);
  });

  it('needs at least two days of the same weekday', () => {
    const result = detectProteinGapByDay(input({ nutritionDays: [day('2026-09-05', 30)] }));
    expect(result.insights).toEqual([]);
  });

  it('ignores days with no target', () => {
    const result = detectProteinGapByDay(
      input({
        nutritionDays: [
          { date: '2026-08-29', consumed: macros({ proteinG: 10 }), targets: null },
          { date: '2026-09-05', consumed: macros({ proteinG: 10 }), targets: null },
        ],
      }),
    );
    expect(result.insights).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('FREQUENT_FOODS', () => {
  const dayWith = (date: string, names: string[]): InsightNutritionDay => ({
    date,
    consumed: macros(),
    targets: null,
    items: names.map((name) => makeFoodItem({ name })),
  });

  it('fires for a food logged four times in fourteen days', () => {
    const result = detectFrequentFoods(
      input({
        nutritionDays: [
          dayWith('2026-09-07', ['Chicken breast']),
          dayWith('2026-09-08', ['chicken breast']),
          dayWith('2026-09-09', ['Chicken Breast']),
          dayWith('2026-09-10', ['chicken breast', 'Rice']),
        ],
      }),
    );
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].headline).toContain('Chicken breast');
    expect(result.insights[0].evidence).toHaveLength(FREQUENT_FOOD_MIN_COUNT);
  });

  it('does not fire below the threshold', () => {
    const result = detectFrequentFoods(
      input({
        nutritionDays: [
          dayWith('2026-09-08', ['Chicken breast']),
          dayWith('2026-09-09', ['Chicken breast']),
          dayWith('2026-09-10', ['Chicken breast']),
        ],
      }),
    );
    expect(result.insights).toEqual([]);
    expect(result.rationale.codes).toEqual(['FREQUENT_FOODS_NONE']);
  });

  it('ignores logs older than fourteen days', () => {
    const result = detectFrequentFoods(
      input({
        nutritionDays: [
          dayWith('2026-07-01', ['Rice']),
          dayWith('2026-07-02', ['Rice']),
          dayWith('2026-07-03', ['Rice']),
          dayWith('2026-09-10', ['Rice']),
        ],
      }),
    );
    expect(result.insights).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('MISSED_TARGET_STREAK', () => {
  const targets = makeTargets({ kcal: 2600, proteinG: 150, carbsG: 280, fatG: 72, fiberG: 36 });

  it('judges each macro by its own rule', () => {
    expect(macroMissed('proteinG', 120, 150)).toBe(true);
    expect(macroMissed('proteinG', 140, 150)).toBe(false);
    expect(macroMissed('kcal', 3000, 2600)).toBe(true);
    expect(macroMissed('kcal', 2500, 2600)).toBe(false);
    expect(macroMissed('carbsG', 200, 280)).toBe(true);
    expect(macroMissed('proteinG', 0, 0)).toBe(false);
    expect(MACRO_KEYS).toHaveLength(5);
  });

  it('fires when a macro is missed five of the last seven days', () => {
    const days: InsightNutritionDay[] = Array.from({ length: 7 }, (_, index) => ({
      date: addDays('2026-09-04', index),
      consumed: macros({
        kcal: 2600,
        proteinG: index < 5 ? 90 : 150,
        carbsG: 280,
        fatG: 72,
        fiberG: 36,
      }),
      targets,
    }));

    const result = detectMissedTargetStreak(input({ nutritionDays: days }));
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].headline).toContain('protein missed 5');
    expect(result.insights[0].severity).toBe('warning');
  });

  it('does not fire at four misses', () => {
    const days: InsightNutritionDay[] = Array.from({ length: 7 }, (_, index) => ({
      date: addDays('2026-09-04', index),
      consumed: macros({
        kcal: 2600,
        proteinG: index < 4 ? 90 : 150,
        carbsG: 280,
        fatG: 72,
        fiberG: 36,
      }),
      targets,
    }));
    const result = detectMissedTargetStreak(input({ nutritionDays: days }));
    expect(result.insights).toEqual([]);
    expect(result.rationale.codes).toEqual(['MISSED_TARGET_STREAK_NONE']);
  });

  it('ignores days with no targets', () => {
    const days: InsightNutritionDay[] = Array.from({ length: 7 }, (_, index) => ({
      date: addDays('2026-09-04', index),
      consumed: macros(),
      targets: null,
    }));
    expect(detectMissedTargetStreak(input({ nutritionDays: days })).insights).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('runInsightDetectors', () => {
  it('runs all seven detectors and reports what each found', () => {
    expect(INSIGHT_DETECTORS).toHaveLength(7);

    const result = runInsightDetectors(input());
    expect(result.rationales).toHaveLength(7);
    expect(result.insights).toEqual([]);
    expect(result.rationale.facts.detectorsRun).toBe(7);
  });

  it('collects insights from every detector that fired', () => {
    const result = runInsightDetectors(
      input({
        workouts: [
          makeWorkout({
            date: '2026-09-08',
            exercises: [
              { exerciseId: 'ex-bench', reps: Array.from({ length: 12 }, () => 10), loadKg: 60 },
            ],
          }),
          makeWorkout({
            date: '2026-09-07',
            exercises: [{ exerciseId: 'ex-row', reps: [10, 10, 10], loadKg: 60 }],
          }),
        ],
      }),
    );
    expect(result.insights.some((insight) => insight.detector === 'PUSH_PULL_BALANCE')).toBe(true);
    expect(result.rationale.facts.insightsFound).toBe(result.insights.length);
  });
});
