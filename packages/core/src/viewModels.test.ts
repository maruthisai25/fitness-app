import { beforeEach, describe, expect, it } from 'vitest';

import { addDays } from './dates';
import {
  makeExercise,
  makeFoodItem,
  makeFoodLog,
  makeReadiness,
  makeSession,
  makeTargets,
  makeWorkout,
  resetFixtureIds,
} from './fixtures';
import { buildDayNutrition } from './nutrition';
import { assessReadiness } from './readiness';
import { computeStreak } from './records';
import {
  buildExerciseStats,
  buildProgressSeries,
  buildTodayView,
  type TodayViewInput,
} from './viewModels';
import type { BodyMetric, SafetyEvent, WorkoutPlan } from './types';

beforeEach(() => {
  resetFixtureIds();
});

const TODAY = '2026-09-10';

function nutrition(consumedKcal = 1600, consumedProtein = 100) {
  return buildDayNutrition({
    date: TODAY,
    targets: makeTargets({ kcal: 2600, proteinG: 150 }),
    logs: [
      makeFoodLog({
        date: TODAY,
        items: [makeFoodItem({ kcal: consumedKcal, proteinG: consumedProtein })],
      }),
    ],
  });
}

function todayInput(overrides: Partial<TodayViewInput> = {}): TodayViewInput {
  return {
    date: TODAY,
    readiness: assessReadiness(makeReadiness({ date: TODAY })),
    workoutsToday: [],
    nutrition: nutrition(),
    ...overrides,
  };
}

describe('buildTodayView — DESIGN.md §7.2', () => {
  it('shows the readiness card from the engine output', () => {
    const view = buildTodayView(todayInput());
    expect(view.readiness.checkedIn).toBe(true);
    expect(view.readiness.modifier).toBe('normal');
    expect(view.readiness.score).toBeGreaterThan(0);
    expect(view.readiness.summary.length).toBeGreaterThan(0);
  });

  it('falls back to the "ask for a workout" state with nothing planned', () => {
    const view = buildTodayView(todayInput());
    expect(view.workout.state).toBe('none');
    expect(view.workout.workoutId).toBeNull();
    expect(view.headline).toContain('ask the coach');
  });

  it('surfaces a draft plan when nothing is stored yet', () => {
    const plan: WorkoutPlan = {
      date: TODAY,
      title: 'Upper body — pull focus',
      focus: ['back'],
      plannedDurationMin: 42,
      source: 'rule',
      exercises: [
        {
          exerciseId: 'ex-row',
          order: 0,
          targetSets: 3,
          targetRepMin: 8,
          targetRepMax: 12,
          targetLoadKg: 60,
          restSec: 90,
          tempo: null,
          substitutedFromExerciseId: null,
          progressionDecision: null,
          notes: null,
        },
      ],
      readinessId: null,
      notes: null,
      rationale: { codes: ['RULE_BASED_PLAN'], facts: {}, summary: 'Pull leads today.' },
    };

    const view = buildTodayView(todayInput({ draftPlan: plan }));
    expect(view.workout.state).toBe('none');
    expect(view.workout.title).toBe('Upper body — pull focus');
    expect(view.workout.setsPlanned).toBe(3);
    expect(view.workout.rationale?.summary).toBe('Pull leads today.');
  });

  it('prefers an in-progress session and counts its sets', () => {
    const workout = makeWorkout({
      date: TODAY,
      status: 'in_progress',
      exercises: [{ exerciseId: 'ex-bench', reps: [10, 10, 10], loadKg: 60 }],
    });
    workout.exercises[0].sets[2].completed = false;

    const view = buildTodayView(
      todayInput({
        workoutsToday: [makeWorkout({ date: TODAY, status: 'planned' }), workout],
      }),
    );
    expect(view.workout.state).toBe('in_progress');
    expect(view.workout.setsCompleted).toBe(2);
    expect(view.workout.setsPlanned).toBe(3);
    expect(view.headline).toContain('2 of 3 sets');
  });

  it('reports a finished session and a queued one', () => {
    const done = buildTodayView(
      todayInput({
        workoutsToday: [
          makeWorkout({
            date: TODAY,
            status: 'completed',
            exercises: [{ exerciseId: 'ex-bench', reps: [10, 10, 10], loadKg: 60 }],
          }),
        ],
      }),
    );
    expect(done.workout.state).toBe('completed');
    expect(done.headline).toContain('Session done: 3 sets logged');

    const queued = buildTodayView(
      todayInput({
        workoutsToday: [
          makeWorkout({ date: TODAY, status: 'planned', title: 'Upper body — pull focus' }),
        ],
      }),
    );
    expect(queued.workout.state).toBe('planned');
    expect(queued.headline).toContain('Upper body — pull focus is queued up');
  });

  it('reports an abandoned session as skipped', () => {
    const view = buildTodayView(
      todayInput({ workoutsToday: [makeWorkout({ date: TODAY, status: 'abandoned' })] }),
    );
    expect(view.workout.state).toBe('skipped');
  });

  it('builds the macro rings with clamped remaining values', () => {
    const view = buildTodayView(todayInput({ nutrition: nutrition(3000, 200) }));
    const kcal = view.nutrition.rings.find((ring) => ring.key === 'kcal');

    expect(view.nutrition.remaining.kcal).toBe(-400);
    expect(view.nutrition.remainingForDisplay.kcal).toBe(0);
    expect(kcal?.remaining).toBe(0);
    expect(kcal?.progress).toBeCloseTo(1.1538, 3);
    expect(view.nutrition.rings).toHaveLength(5);
    expect(view.nutrition.hasTargets).toBe(true);
  });

  it('raises the safety banner from an open event', () => {
    const event: SafetyEvent = {
      id: 'safety-1',
      date: TODAY,
      kind: 'pain',
      text: 'Left knee',
      source: 'readiness',
      resolvedAt: null,
      note: null,
    };
    const view = buildTodayView(todayInput({ openSafetyEvents: [event] }));

    expect(view.safetyActive).toBe(true);
    expect(view.safetyEvents).toHaveLength(1);
    expect(view.rationale.codes).toContain('SAFETY_STATE_ACTIVE');
    expect(view.headline).toContain('safety event');
  });

  it('drops resolved safety events', () => {
    const event: SafetyEvent = {
      id: 'safety-1',
      date: '2026-09-01',
      kind: 'pain',
      text: 'Left knee',
      source: 'readiness',
      resolvedAt: '2026-09-05T00:00:00.000Z',
      note: null,
    };
    expect(buildTodayView(todayInput({ openSafetyEvents: [event] })).safetyActive).toBe(false);
  });

  it('keeps only undismissed insights and reports the streak', () => {
    const view = buildTodayView(
      todayInput({
        insights: [
          {
            detector: 'PUSH_PULL_BALANCE',
            period: { from: '2026-08-14', to: TODAY },
            headline: 'Pushing volume is outrunning pulling',
            detail: 'x',
            evidence: [],
            severity: 'notice',
            dismissed: false,
          },
          {
            detector: 'FREQUENT_FOODS',
            period: { from: '2026-08-28', to: TODAY },
            headline: 'Rice is a staple',
            detail: 'x',
            evidence: [],
            severity: 'info',
            dismissed: true,
          },
        ],
        streak: computeStreak({
          today: TODAY,
          days: [
            { date: '2026-09-08', planned: true, completed: true },
            { date: '2026-09-09', planned: true, completed: true },
          ],
        }),
      }),
    );

    expect(view.openInsights).toHaveLength(1);
    expect(view.rationale.codes).toContain('OPEN_INSIGHTS');
    expect(view.streak).toEqual({ current: 2, longest: 2 });
    expect(view.headline).toContain('2-session streak');
  });

  it('handles a day with no targets', () => {
    const view = buildTodayView(
      todayInput({ nutrition: buildDayNutrition({ date: TODAY, targets: null, logs: [] }) }),
    );
    expect(view.nutrition.hasTargets).toBe(false);
    expect(view.rationale.codes).toContain('NO_NUTRITION_TARGETS');
    expect(view.nutrition.rings.every((ring) => ring.progress === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('buildExerciseStats — DESIGN.md §7.2', () => {
  const sessions = [
    makeSession({
      date: '2026-08-13',
      exerciseId: 'ex-bench',
      reps: [8, 8, 8],
      loadKg: 60,
      rpe: 8,
    }),
    makeSession({
      date: '2026-08-20',
      exerciseId: 'ex-bench',
      reps: [10, 9, 9],
      loadKg: 60,
      rpe: 8,
    }),
    makeSession({
      date: '2026-08-27',
      exerciseId: 'ex-bench',
      reps: [10, 10, 10],
      loadKg: 62.5,
      rpe: 9,
    }),
  ];

  it('aggregates bests, totals and the session list newest first', () => {
    const stats = buildExerciseStats({
      exercise: makeExercise({ id: 'ex-bench', name: 'Barbell bench press' }),
      sessions,
    });

    expect(stats.sessionCount).toBe(3);
    expect(stats.firstSessionDate).toBe('2026-08-13');
    expect(stats.lastSessionDate).toBe('2026-08-27');
    expect(stats.bestLoadKg).toBe(62.5);
    expect(stats.bestReps).toBe(10);
    expect(stats.bestE1rmKg).toBeCloseTo(83.333, 3);
    expect(stats.totalSets).toBe(9);
    expect(stats.totalVolumeKg).toBe(60 * 24 + 60 * 28 + 62.5 * 30);
    expect(stats.averageRpe).toBeCloseTo(8.33, 2);
    expect(stats.sessions[0].date).toBe('2026-08-27');
    expect(stats.sessions[0].reps).toEqual([10, 10, 10]);
  });

  it('reports the weekly e1RM trend', () => {
    const stats = buildExerciseStats({
      exercise: makeExercise({ id: 'ex-bench', name: 'Barbell bench press' }),
      sessions,
    });
    expect(stats.e1rmTrendKgPerWeek).toBeGreaterThan(0);
    expect(stats.rationale.codes).toContain('TREND_UP');
  });

  it('converts the headline numbers into the user units', () => {
    const stats = buildExerciseStats({
      exercise: makeExercise({ id: 'ex-bench', name: 'Barbell bench press' }),
      sessions,
      unitSystem: 'imperial',
    });
    expect(stats.display.unitSystem).toBe('imperial');
    expect(stats.display.bestLoad).toBeCloseTo(137.5, 1);
  });

  it('handles an exercise with no history', () => {
    const stats = buildExerciseStats({
      exercise: makeExercise({ id: 'ex-new', name: 'Zercher squat' }),
      sessions: [],
    });
    expect(stats.sessionCount).toBe(0);
    expect(stats.bestE1rmKg).toBeNull();
    expect(stats.e1rmTrendKgPerWeek).toBeNull();
    expect(stats.rationale.codes).toContain('NO_HISTORY');
    expect(stats.rationale.summary).toContain('No logged sets');
  });

  it('sorts personal records newest first', () => {
    const stats = buildExerciseStats({
      exercise: makeExercise({ id: 'ex-bench', name: 'Barbell bench press' }),
      sessions,
      personalRecords: [
        {
          id: 'pr-old',
          exerciseId: 'ex-bench',
          kind: 'e1rm',
          value: 78,
          loadKg: 60,
          reps: 9,
          setId: null,
          date: '2026-08-01',
        },
        {
          id: 'pr-new',
          exerciseId: 'ex-bench',
          kind: 'e1rm',
          value: 83.3,
          loadKg: 62.5,
          reps: 10,
          setId: null,
          date: '2026-08-27',
        },
      ],
    });
    expect(stats.personalRecords.map((record) => record.id)).toEqual(['pr-new', 'pr-old']);
  });
});

// ---------------------------------------------------------------------------

describe('buildProgressSeries — DESIGN.md §7.2', () => {
  const sessions = [
    makeSession({ date: '2026-08-13', exerciseId: 'ex-bench', reps: [8, 8, 8], loadKg: 60 }),
    makeSession({ date: '2026-08-20', exerciseId: 'ex-bench', reps: [8, 8, 8], loadKg: 62.5 }),
    makeSession({ date: '2026-08-27', exerciseId: 'ex-bench', reps: [8, 8, 8], loadKg: 65 }),
  ];

  it('charts estimated 1RM in the user units and reports the weekly trend', () => {
    const series = buildProgressSeries({
      metric: 'e1rm',
      from: '2026-08-01',
      to: TODAY,
      sessions,
      exerciseName: 'Barbell bench press',
    });

    expect(series.points).toHaveLength(3);
    expect(series.unit).toBe('kg');
    expect(series.label).toContain('Barbell bench press');
    expect(series.first).toBeCloseTo(76, 0);
    expect(series.change).toBeGreaterThan(0);
    expect(series.trendPerWeek).toBeGreaterThan(0);
    expect(series.rationale.codes).toContain('TREND_UP');
  });

  it('respects the date window', () => {
    const series = buildProgressSeries({
      metric: 'e1rm',
      from: '2026-08-20',
      to: '2026-08-27',
      sessions,
    });
    expect(series.points.map((point) => point.date)).toEqual(['2026-08-20', '2026-08-27']);
  });

  it('charts session volume', () => {
    const series = buildProgressSeries({
      metric: 'session_volume',
      from: '2026-08-01',
      to: TODAY,
      sessions,
    });
    expect(series.points[0].value).toBe(1440);
    expect(series.points).toHaveLength(3);
  });

  it('charts body weight and waist from body metrics', () => {
    const metrics: BodyMetric[] = [
      { id: 'bm-1', date: '2026-08-01', weightKg: 82, waistCm: 86, measurements: {}, notes: null },
      {
        id: 'bm-2',
        date: '2026-09-01',
        weightKg: 80.4,
        waistCm: 84,
        measurements: {},
        notes: null,
      },
    ];

    const weight = buildProgressSeries({
      metric: 'body_weight',
      from: '2026-07-01',
      to: TODAY,
      bodyMetrics: metrics,
      unitSystem: 'imperial',
    });
    expect(weight.unit).toBe('lb');
    expect(weight.points[0].display).toBeCloseTo(180.8, 1);
    expect(weight.change).toBeCloseTo(-1.6, 3);
    expect(weight.rationale.codes).toContain('TREND_DOWN');

    const waist = buildProgressSeries({
      metric: 'waist',
      from: '2026-07-01',
      to: TODAY,
      bodyMetrics: metrics,
    });
    expect(waist.unit).toBe('cm');
    expect(waist.points).toHaveLength(2);
  });

  it('buckets working sets into weeks', () => {
    const workouts = [
      makeWorkout({
        date: '2026-08-31',
        exercises: [{ exerciseId: 'ex-bench', reps: [10, 10, 10], loadKg: 60 }],
      }),
      makeWorkout({
        date: '2026-09-02',
        exercises: [{ exerciseId: 'ex-row', reps: [10, 10], loadKg: 50 }],
      }),
      makeWorkout({
        date: '2026-09-08',
        exercises: [{ exerciseId: 'ex-bench', reps: [10, 10], loadKg: 60 }],
      }),
    ];
    const series = buildProgressSeries({
      metric: 'weekly_sets',
      from: '2026-08-31',
      to: TODAY,
      workouts,
    });

    expect(series.unit).toBe('sets');
    expect(series.points).toEqual([
      { date: '2026-08-31', value: 5, display: 5 },
      { date: '2026-09-07', value: 2, display: 2 },
    ]);
  });

  it('reports an empty series without throwing', () => {
    const series = buildProgressSeries({
      metric: 'e1rm',
      from: addDays(TODAY, -30),
      to: TODAY,
      sessions: [],
    });
    expect(series.points).toEqual([]);
    expect(series.first).toBeNull();
    expect(series.change).toBeNull();
    expect(series.rationale.codes).toContain('NO_DATA');
  });
});
