import { beforeEach, describe, expect, it } from 'vitest';

import { makeSession, makeWorkout, resetFixtureIds } from './fixtures';
import {
  DELOAD_LOAD_MULTIPLIER,
  DELOAD_VOLUME_MULTIPLIER,
  detectDeload,
  detectPlateau,
  type ReadinessDay,
} from './plateau';
import type { ExerciseRelation, ExerciseSession, WorkoutWithExercises } from './types';

beforeEach(() => {
  resetFixtureIds();
});

const RANGE = { min: 8, max: 12 };

/** Five sessions: one that sets the bar, then four that never clear it. */
function stalledHistory(rpes: number[]): ExerciseSession[] {
  const dates = ['2026-08-13', '2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10'];
  return dates.map((date, index) =>
    makeSession({
      date,
      reps: [10, 10, 10],
      loadKg: 60,
      rpe: rpes[index],
      targetRepMin: 8,
      targetRepMax: 12,
    }),
  );
}

describe('detectPlateau — DESIGN.md §5.3', () => {
  it('fires when four sessions set no PR and RPE keeps climbing', () => {
    const result = detectPlateau({
      exerciseId: 'ex-bench',
      exerciseName: 'Barbell bench press',
      history: stalledHistory([8, 8.5, 9, 9.5, 10]),
      repRange: RANGE,
    });

    expect(result.plateaued).toBe(true);
    expect(result.rationale.codes).toEqual(['PLATEAU', 'NO_NEW_PR', 'RPE_TREND_RISING']);
    expect(result.rpeSlopePerSession).toBeGreaterThan(0);
    expect(result.suggestions.map((suggestion) => suggestion.kind)).toEqual([
      'rep_range_change',
      'deload',
    ]);
  });

  it('offers the variation swap first when a relation exists', () => {
    const relations: ExerciseRelation[] = [
      { fromId: 'ex-bench', toId: 'ex-dbbench', kind: 'variation', note: null },
    ];
    const result = detectPlateau({
      exerciseId: 'ex-bench',
      exerciseName: 'Barbell bench press',
      history: stalledHistory([8, 8.5, 9, 9.5, 10]),
      repRange: RANGE,
      relations,
    });

    expect(result.suggestions[0]).toMatchObject({
      kind: 'variation_swap',
      exerciseId: 'ex-dbbench',
    });
  });

  it('does not fire when a new rep PR lands inside the window', () => {
    const history = stalledHistory([8, 8.5, 9, 9.5, 10]);
    history[4] = makeSession({ date: '2026-09-10', reps: [12, 11, 11], loadKg: 60, rpe: 10 });

    const result = detectPlateau({
      exerciseId: 'ex-bench',
      exerciseName: 'Barbell bench press',
      history,
      repRange: RANGE,
    });

    expect(result.plateaued).toBe(false);
    expect(result.rationale.codes).toEqual(['STILL_PROGRESSING']);
    expect(result.suggestions).toEqual([]);
  });

  it('does not fire when effort is flat, even with no new PR', () => {
    const result = detectPlateau({
      exerciseId: 'ex-bench',
      exerciseName: 'Barbell bench press',
      history: stalledHistory([9, 9, 9, 9, 9]),
      repRange: RANGE,
    });

    expect(result.plateaued).toBe(false);
    expect(result.rationale.codes).toEqual(['NO_PR_BUT_RPE_STEADY']);
  });

  it('needs five sessions before it will judge anything', () => {
    const result = detectPlateau({
      exerciseId: 'ex-bench',
      exerciseName: 'Barbell bench press',
      history: stalledHistory([8, 9, 10, 10, 10]).slice(0, 3),
      repRange: RANGE,
    });

    expect(result.plateaued).toBe(false);
    expect(result.rationale.codes).toEqual(['NOT_ENOUGH_SESSIONS']);
    expect(result.sessionsConsidered).toBe(3);
  });

  it('shifts a heavy range up and a light range down', () => {
    const heavy = detectPlateau({
      exerciseId: 'ex-squat',
      exerciseName: 'Back squat',
      history: stalledHistory([8, 8.5, 9, 9.5, 10]),
      repRange: { min: 3, max: 5 },
    });
    const light = detectPlateau({
      exerciseId: 'ex-squat',
      exerciseName: 'Back squat',
      history: stalledHistory([8, 8.5, 9, 9.5, 10]),
      repRange: { min: 15, max: 20 },
    });

    expect(heavy.suggestions[0].repRange).toEqual({ min: 7, max: 11 });
    expect(light.suggestions[0].repRange).toEqual({ min: 11, max: 14 });
  });
});

// ---------------------------------------------------------------------------

function volumeWorkouts(options: {
  weeks: number;
  setsPerWeek: number;
  loadKg: number;
  reps: number;
  rpe: number;
  today: string;
  lastWeekMultiplier?: number;
}): WorkoutWithExercises[] {
  const workouts: WorkoutWithExercises[] = [];
  for (let week = 0; week < options.weeks; week += 1) {
    const isLastWeek = week === 0;
    const sets = Math.round(
      options.setsPerWeek * (isLastWeek ? (options.lastWeekMultiplier ?? 1) : 1),
    );
    const day = new Date(Date.parse(`${options.today}T00:00:00Z`) - week * 7 * 86_400_000);
    workouts.push(
      makeWorkout({
        date: day.toISOString().slice(0, 10),
        exercises: [
          {
            exerciseId: 'ex-bench',
            reps: Array.from({ length: sets }, () => options.reps),
            loadKg: options.loadKg,
            rpe: options.rpe,
          },
        ],
      }),
    );
  }
  return workouts;
}

describe('detectDeload — DESIGN.md §5.3', () => {
  const today = '2026-09-10';

  it('recommends a deload when RPE is high and volume spiked', () => {
    const workouts = volumeWorkouts({
      weeks: 6,
      setsPerWeek: 10,
      loadKg: 60,
      reps: 10,
      rpe: 9,
      today,
      lastWeekMultiplier: 2.5,
    });

    const result = detectDeload({ today, workouts, readiness: [] });

    expect(result.recommended).toBe(true);
    expect(result.rationale.codes).toContain('RPE_MEAN_HIGH');
    expect(result.rationale.codes).toContain('VOLUME_SPIKE');
    expect(result.volumeMultiplier).toBe(DELOAD_VOLUME_MULTIPLIER);
    expect(result.loadMultiplier).toBe(DELOAD_LOAD_MULTIPLIER);
  });

  it('does not recommend one when RPE is high but volume is steady', () => {
    const workouts = volumeWorkouts({
      weeks: 6,
      setsPerWeek: 10,
      loadKg: 60,
      reps: 10,
      rpe: 9,
      today,
    });

    const result = detectDeload({ today, workouts, readiness: [] });
    expect(result.recommended).toBe(false);
    expect(result.rationale.codes).toEqual(['NO_DELOAD_NEEDED']);
  });

  it('does not recommend one when volume spiked but effort stayed low', () => {
    const workouts = volumeWorkouts({
      weeks: 6,
      setsPerWeek: 10,
      loadKg: 60,
      reps: 10,
      rpe: 7,
      today,
      lastWeekMultiplier: 2.5,
    });

    expect(detectDeload({ today, workouts, readiness: [] }).recommended).toBe(false);
  });

  it('recommends one on two low-readiness days in a week regardless of volume', () => {
    const readiness: ReadinessDay[] = [
      { date: '2026-09-08', modifier: 'reduce' },
      { date: '2026-09-09', modifier: 'reduce' },
      { date: '2026-09-10', modifier: 'normal' },
    ];

    const result = detectDeload({ today, workouts: [], readiness });
    expect(result.recommended).toBe(true);
    expect(result.rationale.codes).toContain('READINESS_REDUCE_DAYS');
    expect(result.reduceDaysThisWeek).toBe(2);
  });

  it('ignores low-readiness days outside the week', () => {
    const readiness: ReadinessDay[] = [
      { date: '2026-08-20', modifier: 'reduce' },
      { date: '2026-09-09', modifier: 'reduce' },
    ];
    const result = detectDeload({ today, workouts: [], readiness });
    expect(result.reduceDaysThisWeek).toBe(1);
    expect(result.recommended).toBe(false);
  });

  it('reports the numbers it used', () => {
    const workouts = volumeWorkouts({
      weeks: 6,
      setsPerWeek: 10,
      loadKg: 60,
      reps: 10,
      rpe: 8,
      today,
    });
    const result = detectDeload({ today, workouts, readiness: [] });

    expect(result.rolling14DayMeanRpe).toBe(8);
    expect(result.lastWeekVolumeKg).toBe(6000);
    expect(result.sixWeekMeanWeeklyVolumeKg).toBe(6000);
  });
});
