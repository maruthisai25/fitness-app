import { beforeEach, describe, expect, it } from 'vitest';

import { makeSession, makeSet, resetFixtureIds } from './fixtures';
import {
  DEFAULT_REST_SEC,
  decideProgression,
  isLoadableLoadType,
  type ProgressionInput,
} from './progression';
import type { ExerciseSession, RepRange } from './types';
import { KG_PER_LB, toDisplay } from './units';

const LB = (pounds: number): number => pounds * KG_PER_LB;
const RANGE: RepRange = { min: 8, max: 12 };

function input(overrides: Partial<ProgressionInput> = {}): ProgressionInput {
  return {
    exerciseId: 'ex-bench',
    loadType: 'external',
    repRange: RANGE,
    history: [],
    loadIncrementKg: 2.5,
    readinessModifier: 'normal',
    safetyActive: false,
    unitSystem: 'metric',
    ...overrides,
  };
}

beforeEach(() => {
  resetFixtureIds();
});

describe('idea.md §5 worked examples', () => {
  it('20 lb × 12/12/12 in an 8–12 range increases the resistance', () => {
    const history: ExerciseSession[] = [
      makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: LB(20) }),
    ];
    const decision = decideProgression(
      input({
        history,
        unitSystem: 'imperial',
        loadIncrementKg: LB(5),
      }),
    );

    expect(decision.action).toBe('increase_load');
    expect(decision.rationale.codes).toContain('PROGRESS_LOAD');
    expect(decision.rationale.codes).toContain('ALL_SETS_TOP_OF_RANGE');
    expect(toDisplay(decision.targetLoadKg ?? 0, 'load', 'imperial', { incrementKg: LB(5) })).toBe(
      25,
    );
    expect(decision.rationale.facts.targetRepsPerSet).toBe(8);
    expect(decision.rationale.summary).toContain('25 lb');
  });

  it('25 lb × 8/6/6 holds the resistance and builds toward 8/8/8', () => {
    const history: ExerciseSession[] = [
      makeSession({ date: '2026-09-08', reps: [8, 6, 6], loadKg: LB(25) }),
    ];
    const decision = decideProgression(
      input({ history, unitSystem: 'imperial', loadIncrementKg: LB(5) }),
    );

    expect(decision.action).toBe('hold_load');
    expect(decision.rationale.codes).toEqual(['HOLD_BUILD_REPS']);
    expect(decision.rationale.facts.nextMilestoneReps).toBe(8);
    expect(decision.loadDeltaKg).toBe(0);
    expect(toDisplay(decision.targetLoadKg ?? 0, 'load', 'imperial', { incrementKg: LB(5) })).toBe(
      25,
    );
    expect(decision.rationale.summary).toContain('8/6/6');
    expect(decision.rationale.summary).toContain('build toward 8 reps');
  });
});

describe('rule 1 — safety holds and takes a set off', () => {
  it('fires ahead of a session that otherwise earns a load increase', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: 60, rpe: 7 })];
    const decision = decideProgression(input({ history, safetyActive: true }));

    expect(decision.action).toBe('reduce_volume');
    expect(decision.rationale.codes).toEqual(['SAFETY_HOLD']);
    expect(decision.targetLoadKg).toBe(60);
    expect(decision.targetSets).toBe(2);
    expect(decision.loadDeltaKg).toBe(0);
  });

  it('treats a readiness modifier of safety the same way', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: 60 })];
    const decision = decideProgression(input({ history, readinessModifier: 'safety' }));
    expect(decision.rationale.codes).toEqual(['SAFETY_HOLD']);
  });

  it('never drops below one set', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [10], loadKg: 60 })];
    const decision = decideProgression(input({ history, safetyActive: true }));
    expect(decision.targetSets).toBe(1);
  });
});

describe('rules 2 and 3 — readiness', () => {
  it('reduce holds the load and cuts volume ~30 %', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: 60 })];
    const decision = decideProgression(input({ history, readinessModifier: 'reduce' }));

    expect(decision.action).toBe('reduce_volume');
    expect(decision.rationale.codes).toEqual(['READINESS_REDUCE']);
    expect(decision.targetSets).toBe(2);
    expect(decision.targetLoadKg).toBe(60);
  });

  it('hold keeps the load without touching volume', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: 60 })];
    const decision = decideProgression(input({ history, readinessModifier: 'hold' }));

    expect(decision.action).toBe('hold_load');
    expect(decision.rationale.codes).toEqual(['READINESS_HOLD']);
    expect(decision.targetSets).toBe(3);
    expect(decision.targetLoadKg).toBe(60);
  });
});

describe('rule 4 — double progression', () => {
  it('adds one increment when every set tops the range at RPE 8', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: 60, rpe: 8 })];
    const decision = decideProgression(input({ history }));

    expect(decision.action).toBe('increase_load');
    expect(decision.targetLoadKg).toBe(62.5);
    expect(decision.loadDeltaKg).toBe(2.5);
    expect(decision.rationale.codes).toContain('RPE_UNDER_THRESHOLD');
  });

  it('does not add load when mean RPE is over 8.5', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: 60, rpe: 9 })];
    const decision = decideProgression(input({ history }));

    expect(decision.action).toBe('hold_load');
    expect(decision.rationale.codes).toEqual(['HOLD_BUILD_REPS']);
    expect(decision.rationale.facts.nextMilestoneReps).toBe(12);
  });

  it('treats an unrated session as passing the RPE ceiling', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: 60 })];
    const decision = decideProgression(input({ history }));
    expect(decision.action).toBe('increase_load');
    expect(decision.rationale.codes).toContain('RPE_NOT_RATED');
  });

  it('ignores warmups and incomplete sets when judging the range', () => {
    const history: ExerciseSession[] = [
      {
        ...makeSession({ date: '2026-09-08', reps: [12, 12], loadKg: 60 }),
        sets: [
          makeSet({ actualReps: 5, actualLoadKg: 20, isWarmup: true }),
          makeSet({ actualReps: 12, actualLoadKg: 60, setIndex: 1 }),
          makeSet({ actualReps: 12, actualLoadKg: 60, setIndex: 2 }),
          makeSet({ actualReps: 4, actualLoadKg: 60, setIndex: 3, completed: false }),
        ],
      },
    ];
    const decision = decideProgression(input({ history }));
    expect(decision.action).toBe('increase_load');
    expect(decision.targetSets).toBe(2);
  });
});

describe('rule 5 — bodyweight, time and variation progression', () => {
  it('raises the rep range for bodyweight work', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: null, rpe: 8 })];
    const decision = decideProgression(input({ history, loadType: 'bodyweight' }));

    expect(decision.action).toBe('increase_reps');
    expect(decision.rationale.codes).toContain('PROGRESS_REPS');
    expect(decision.targetRepMin).toBe(9);
    expect(decision.targetRepMax).toBe(13);
    expect(decision.targetLoadKg).toBeNull();
  });

  it('adds two reps when the session felt easy', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: null, rpe: 6 })];
    const decision = decideProgression(input({ history, loadType: 'bodyweight' }));
    expect(decision.targetRepMax).toBe(14);
  });

  it('adds 10 % to a time target', () => {
    const history = [
      makeSession({
        date: '2026-09-08',
        reps: [60, 60],
        loadKg: null,
        targetRepMin: 30,
        targetRepMax: 60,
      }),
    ];
    const decision = decideProgression(
      input({ history, loadType: 'time', repRange: { min: 30, max: 60 } }),
    );

    expect(decision.action).toBe('increase_time');
    expect(decision.rationale.codes).toEqual(['PROGRESS_TIME']);
    expect(decision.targetRepMin).toBe(33);
    expect(decision.targetRepMax).toBe(66);
  });

  it('moves to the harder variation after two sessions at the top of the range', () => {
    const history = [
      makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: null, rpe: 8 }),
      makeSession({ date: '2026-09-04', reps: [12, 12, 12], loadKg: null, rpe: 8 }),
    ];
    const decision = decideProgression(
      input({ history, loadType: 'bodyweight', progressionExerciseId: 'ex-pullup' }),
    );

    expect(decision.action).toBe('progress_variation');
    expect(decision.suggestedExerciseId).toBe('ex-pullup');
    expect(decision.rationale.codes).toEqual(['PROGRESS_VARIATION']);
  });

  it('stays on reps when only one session topped the range', () => {
    const history = [
      makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: null, rpe: 8 }),
      makeSession({ date: '2026-09-04', reps: [10, 10, 9], loadKg: null, rpe: 8 }),
    ];
    const decision = decideProgression(
      input({ history, loadType: 'bodyweight', progressionExerciseId: 'ex-pullup' }),
    );
    expect(decision.action).toBe('increase_reps');
  });
});

describe('rule 6 — regression', () => {
  it('drops one increment after two hard sessions under the range', () => {
    const history = [
      makeSession({ date: '2026-09-08', reps: [7, 6, 5], loadKg: 60, rpe: 10 }),
      makeSession({ date: '2026-09-04', reps: [7, 6, 6], loadKg: 60, rpe: 9.5 }),
    ];
    const decision = decideProgression(input({ history }));

    expect(decision.action).toBe('decrease_load');
    expect(decision.targetLoadKg).toBe(57.5);
    expect(decision.loadDeltaKg).toBe(-2.5);
    expect(decision.rationale.codes).toContain('REGRESS_LOAD');
  });

  it('holds instead when only the most recent session was hard', () => {
    const history = [
      makeSession({ date: '2026-09-08', reps: [7, 6, 5], loadKg: 60, rpe: 10 }),
      makeSession({ date: '2026-09-04', reps: [10, 10, 9], loadKg: 60, rpe: 8 }),
    ];
    const decision = decideProgression(input({ history }));
    expect(decision.action).toBe('hold_load');
    expect(decision.rationale.codes).toEqual(['HOLD_BUILD_REPS']);
  });

  it('holds when the sets were low but the RPE was not maximal', () => {
    const history = [
      makeSession({ date: '2026-09-08', reps: [7, 6, 5], loadKg: 60, rpe: 8 }),
      makeSession({ date: '2026-09-04', reps: [7, 6, 6], loadKg: 60, rpe: 8 }),
    ];
    expect(decideProgression(input({ history })).action).toBe('hold_load');
  });

  it('never drives the load below zero', () => {
    const history = [
      makeSession({ date: '2026-09-08', reps: [4], loadKg: 2, rpe: 10 }),
      makeSession({ date: '2026-09-04', reps: [4], loadKg: 2, rpe: 10 }),
    ];
    const decision = decideProgression(input({ history }));
    expect(decision.targetLoadKg).toBe(0);
  });
});

describe('rule 7 and no history', () => {
  it('targets the bottom of the range when a set fell short', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [10, 9, 6], loadKg: 60 })];
    const decision = decideProgression(input({ history }));
    expect(decision.rationale.facts.nextMilestoneReps).toBe(8);
    expect(decision.rationale.facts.worstSetReps).toBe(6);
  });

  it('targets one more rep when every set is already inside the range', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [10, 9, 9], loadKg: 60 })];
    expect(decideProgression(input({ history })).rationale.facts.nextMilestoneReps).toBe(10);
  });

  it('starts from the supplied baseline when there is no history', () => {
    const decision = decideProgression(input({ startingLoadKg: 40 }));
    expect(decision.action).toBe('hold_load');
    expect(decision.rationale.codes).toEqual(['NO_HISTORY', 'HOLD_BUILD_REPS']);
    expect(decision.targetLoadKg).toBe(40);
    expect(decision.targetSets).toBe(3);
  });

  it('phrases the summary without a load when nothing is known', () => {
    const decision = decideProgression(input());
    expect(decision.targetLoadKg).toBeNull();
    expect(decision.rationale.summary).toContain('the same resistance');
  });
});

describe('coach overrides — DESIGN.md §6.3', () => {
  it('honours a hold request instead of adding load', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: 60 })];
    const decision = decideProgression(
      input({ history, coachOverride: 'hold', coachOverrideReason: 'you asked to stay put' }),
    );
    expect(decision.action).toBe('hold_load');
    expect(decision.rationale.codes).toEqual(['COACH_OVERRIDE_HOLD']);
    expect(decision.rationale.summary).toContain('you asked to stay put');
  });

  it('honours a lighter request', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: 60 })];
    const decision = decideProgression(input({ history, coachOverride: 'lighter' }));
    expect(decision.action).toBe('decrease_load');
    expect(decision.targetLoadKg).toBe(57.5);
  });

  it('cannot override safety or readiness', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: 60 })];
    const decision = decideProgression(
      input({ history, coachOverride: 'lighter', safetyActive: true }),
    );
    expect(decision.rationale.codes).toEqual(['SAFETY_HOLD']);
  });
});

describe('decision shape', () => {
  it('carries rest, sets and the rationale facts every time', () => {
    const history = [makeSession({ date: '2026-09-08', reps: [10, 10, 10], loadKg: 60, rpe: 8 })];
    const decision = decideProgression(input({ history }));

    expect(decision.restSec).toBe(DEFAULT_REST_SEC.external);
    expect(decision.exerciseId).toBe('ex-bench');
    expect(decision.rationale.facts).toMatchObject({
      lastLoadKg: 60,
      lastReps: [10, 10, 10],
      meanRpe: 8,
      loadIncrementKg: 2.5,
      sessionsConsidered: 1,
    });
  });

  it('lets the caller pin sets and rest', () => {
    const decision = decideProgression(input({ targetSets: 5, restSec: 210 }));
    expect(decision.targetSets).toBe(5);
    expect(decision.restSec).toBe(210);
  });

  it('sorts history so the newest session drives the decision', () => {
    const history = [
      makeSession({ date: '2026-09-01', reps: [6, 6, 6], loadKg: 50 }),
      makeSession({ date: '2026-09-08', reps: [12, 12, 12], loadKg: 60 }),
    ];
    const decision = decideProgression(input({ history }));
    expect(decision.rationale.facts.lastLoadKg).toBe(60);
    expect(decision.action).toBe('increase_load');
  });

  it('knows which load types are progressed by load', () => {
    expect(isLoadableLoadType('external')).toBe(true);
    expect(isLoadableLoadType('band')).toBe(true);
    expect(isLoadableLoadType('bodyweight')).toBe(false);
    expect(isLoadableLoadType('time')).toBe(false);
  });
});
