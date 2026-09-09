import { beforeEach, describe, expect, it } from 'vitest';

import { makeSession, makeSet, resetFixtureIds } from './fixtures';
import {
  countWord,
  fact,
  formatReps,
  makeRationale,
  mergeRationales,
  pluralize,
  withCodes,
  withFacts,
} from './rationale';
import {
  bestE1rm,
  bestLoadKg,
  bestReps,
  linearSlope,
  mean,
  meanRpe,
  plannedWorkingSets,
  repsOf,
  sessionLoadKg,
  sessionVolumeKg,
  sortSessionsAscending,
  sortSessionsDescending,
  sum,
  workingSets,
} from './setMath';

beforeEach(() => {
  resetFixtureIds();
});

describe('working sets', () => {
  const session = {
    ...makeSession({ date: '2026-09-10', reps: [10, 10], loadKg: 60 }),
    sets: [
      makeSet({ actualReps: 5, actualLoadKg: 20, isWarmup: true }),
      makeSet({ actualReps: 10, actualLoadKg: 60, setIndex: 1, rpe: 8 }),
      makeSet({ actualReps: 8, actualLoadKg: 60, setIndex: 2, rpe: 9 }),
      makeSet({ actualReps: null, actualLoadKg: 60, setIndex: 3, completed: false }),
    ],
  };

  it('drops warmups, incompletes and unlogged sets', () => {
    expect(workingSets(session)).toHaveLength(2);
    expect(repsOf(workingSets(session))).toEqual([10, 8]);
    expect(plannedWorkingSets(session)).toHaveLength(3);
  });

  it('averages only the rated sets', () => {
    expect(meanRpe(workingSets(session))).toBe(8.5);
    expect(meanRpe([makeSet({ rpe: null })])).toBeNull();
  });

  it('reports the working load, volume and bests', () => {
    expect(sessionLoadKg(session)).toBe(60);
    expect(sessionVolumeKg(session)).toBe(1080);
    expect(bestReps(session)).toBe(10);
    expect(bestLoadKg(session)).toBe(60);
    expect(bestE1rm(session)).toBe(80);
  });

  it('breaks a load tie towards the heavier value', () => {
    const mixed = {
      ...session,
      sets: [
        makeSet({ actualReps: 10, actualLoadKg: 55 }),
        makeSet({ actualReps: 10, actualLoadKg: 60, setIndex: 1 }),
      ],
    };
    expect(sessionLoadKg(mixed)).toBe(60);
  });

  it('picks the load used by most sets', () => {
    const mixed = {
      ...session,
      sets: [
        makeSet({ actualReps: 10, actualLoadKg: 55 }),
        makeSet({ actualReps: 10, actualLoadKg: 55, setIndex: 1 }),
        makeSet({ actualReps: 3, actualLoadKg: 70, setIndex: 2 }),
      ],
    };
    expect(sessionLoadKg(mixed)).toBe(55);
  });

  it('falls back to the planned load when nothing was logged', () => {
    const empty = { ...makeSession({ date: '2026-09-10', reps: [], loadKg: 42 }), sets: [] };
    expect(sessionLoadKg(empty)).toBe(42);
    expect(bestE1rm(empty)).toBeNull();
    expect(bestLoadKg(empty)).toBeNull();
    expect(bestReps(empty)).toBe(0);
  });
});

describe('statistics helpers', () => {
  it('means and sums', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBeNull();
    expect(sum([0.1, 0.2])).toBe(0.3);
  });

  it('fits a least-squares slope', () => {
    expect(
      linearSlope([
        { x: 0, y: 0 },
        { x: 1, y: 2 },
        { x: 2, y: 4 },
      ]),
    ).toBe(2);
    expect(linearSlope([{ x: 1, y: 1 }])).toBeNull();
    expect(
      linearSlope([
        { x: 1, y: 1 },
        { x: 1, y: 5 },
      ]),
    ).toBeNull();
  });

  it('sorts sessions in both directions without mutating', () => {
    const sessions = [
      makeSession({ date: '2026-09-10', reps: [10] }),
      makeSession({ date: '2026-09-01', reps: [10] }),
    ];
    expect(sortSessionsAscending(sessions).map((session) => session.date)).toEqual([
      '2026-09-01',
      '2026-09-10',
    ]);
    expect(sortSessionsDescending(sessions).map((session) => session.date)).toEqual([
      '2026-09-10',
      '2026-09-01',
    ]);
    expect(sessions[0].date).toBe('2026-09-10');
  });
});

describe('rationale helpers', () => {
  it('builds and extends without mutating', () => {
    const base = makeRationale(['A'], { x: 1 }, 'Because A.');
    const extended = withCodes(base, 'B', 'A');
    const enriched = withFacts(base, { y: 2 });

    expect(base.codes).toEqual(['A']);
    expect(extended.codes).toEqual(['A', 'B']);
    expect(enriched.facts).toEqual({ x: 1, y: 2 });
    expect(base.facts).toEqual({ x: 1 });
  });

  it('merges several rationales into one', () => {
    const merged = mergeRationales(
      'Combined.',
      makeRationale(['A'], { x: 1 }, 'A'),
      makeRationale(['B', 'A'], { y: 2 }, 'B'),
    );
    expect(merged.codes).toEqual(['A', 'B']);
    expect(merged.facts).toEqual({ x: 1, y: 2 });
    expect(merged.summary).toBe('Combined.');
  });

  it('formats facts and phrases', () => {
    expect(fact(1.23456)).toBe(1.23);
    expect(fact(null)).toBeNull();
    expect(fact(Number.NaN)).toBeNull();
    expect(formatReps([12, 12, 12])).toBe('12/12/12');
    expect(countWord(3)).toBe('three');
    expect(countWord(42)).toBe('42');
    expect(pluralize(1, 'set')).toBe('1 set');
    expect(pluralize(3, 'set')).toBe('3 sets');
  });
});
