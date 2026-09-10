import { beforeEach, describe, expect, it } from 'vitest';

import { makeReadiness, resetFixtureIds } from './fixtures';
import {
  READINESS_HOLD_MIN,
  READINESS_NORMAL_MIN,
  SHORT_SLEEP_PENALTY,
  assessReadiness,
  orderSafetyEvents,
  readinessScore,
} from './readiness';
import type { SafetyEvent } from './types';

beforeEach(() => {
  resetFixtureIds();
});

describe('readiness scoring — DESIGN.md §5.2', () => {
  it('scores a perfect check-in at 100 and reads normal', () => {
    const result = assessReadiness(
      makeReadiness({
        sleepHours: 9,
        sleepQuality: 5,
        energy: 5,
        soreness: 1,
        fatigue: 1,
        stress: 1,
      }),
    );
    expect(result.score).toBe(100);
    expect(result.modifier).toBe('normal');
    expect(result.rationale.codes).toContain('READINESS_NORMAL');
  });

  it('scores the worst possible check-in at 0 and reads reduce', () => {
    const result = assessReadiness(
      makeReadiness({
        sleepHours: 8,
        sleepQuality: 1,
        energy: 1,
        soreness: 5,
        fatigue: 5,
        stress: 5,
      }),
    );
    expect(result.score).toBe(0);
    expect(result.modifier).toBe('reduce');
  });

  it('weights the middle of every scale at 50', () => {
    const result = assessReadiness(
      makeReadiness({
        sleepHours: 8,
        sleepQuality: 3,
        energy: 3,
        soreness: 3,
        fatigue: 3,
        stress: 3,
      }),
    );
    expect(result.score).toBe(50);
    expect(result.modifier).toBe('hold');
  });

  it('applies the documented component weights', () => {
    // Sleep quality carries 30 %: dropping it from 5 to 1 costs 30 points.
    const high = assessReadiness(
      makeReadiness({
        sleepHours: 8,
        sleepQuality: 5,
        energy: 5,
        soreness: 1,
        fatigue: 1,
        stress: 1,
      }),
    ).score as number;
    const low = assessReadiness(
      makeReadiness({
        sleepHours: 8,
        sleepQuality: 1,
        energy: 5,
        soreness: 1,
        fatigue: 1,
        stress: 1,
      }),
    ).score as number;
    expect(high - low).toBe(30);
  });

  it('subtracts 10 points for less than six hours of sleep', () => {
    const rested = assessReadiness(makeReadiness({ sleepHours: 8 })).score as number;
    const short = assessReadiness(makeReadiness({ sleepHours: 5 })).score as number;
    expect(rested - short).toBe(SHORT_SLEEP_PENALTY);
    expect(assessReadiness(makeReadiness({ sleepHours: 5 })).rationale.codes).toContain(
      'SHORT_SLEEP',
    );
  });

  it('does not penalise exactly six hours', () => {
    expect(assessReadiness(makeReadiness({ sleepHours: 6 })).score).toBe(
      assessReadiness(makeReadiness({ sleepHours: 8 })).score,
    );
  });
});

describe('modifier thresholds', () => {
  const at = (score: number) =>
    assessReadiness(
      makeReadiness({
        sleepHours: 8,
        sleepQuality: null,
        energy: null,
        soreness: null,
        fatigue: null,
        stress: null,
        score,
      }),
    );

  it('uses 65 and 45 as the boundaries', () => {
    expect(READINESS_NORMAL_MIN).toBe(65);
    expect(READINESS_HOLD_MIN).toBe(45);
  });

  it('normal at 65, hold at 64 and 45, reduce at 44', () => {
    // Build scores exactly on the boundaries out of the raw components.
    const scoreOf = (quality: 1 | 2 | 3 | 4 | 5) =>
      assessReadiness(
        makeReadiness({
          sleepHours: 8,
          sleepQuality: quality,
          energy: null,
          soreness: null,
          fatigue: null,
          stress: null,
        }),
      );
    expect(scoreOf(5).score).toBe(100);
    expect(scoreOf(5).modifier).toBe('normal');
    expect(scoreOf(3).score).toBe(50);
    expect(scoreOf(3).modifier).toBe('hold');
    expect(scoreOf(2).score).toBe(25);
    expect(scoreOf(2).modifier).toBe('reduce');
    expect(at(50).modifier).toBe('normal'); // score column is ignored, recomputed
  });
});

describe('pain always wins — DESIGN.md §5.2', () => {
  it('returns the safety modifier and a safety event draft', () => {
    const result = assessReadiness(
      makeReadiness({
        date: '2026-09-10',
        sleepHours: 9,
        sleepQuality: 5,
        energy: 5,
        soreness: 1,
        fatigue: 1,
        stress: 1,
        painReported: true,
        painNote: 'Sharp left knee pain on stairs',
      }),
    );

    expect(result.modifier).toBe('safety');
    expect(result.safetyEvent).toEqual({
      date: '2026-09-10',
      kind: 'pain',
      text: 'Sharp left knee pain on stairs',
      source: 'readiness',
    });
    expect(result.rationale.codes).toContain('PAIN_REPORTED');
    expect(result.score).toBe(100);
  });

  it('falls back to a generic note when the user did not write one', () => {
    const result = assessReadiness(makeReadiness({ painReported: true, painNote: null }));
    expect(result.safetyEvent?.text).toBe('Pain reported on the readiness check-in.');
  });
});

describe('partial and missing check-ins', () => {
  it('renormalises when some components are blank', () => {
    const result = assessReadiness(
      makeReadiness({
        sleepHours: 8,
        sleepQuality: 5,
        energy: 5,
        soreness: null,
        fatigue: null,
        stress: null,
      }),
    );
    expect(result.score).toBe(100);
    expect(result.rationale.facts.componentsScored).toEqual(['sleepQuality', 'energy']);
  });

  it('reads normal with no check-in at all', () => {
    const result = assessReadiness(null, '2026-09-10');
    expect(result.score).toBeNull();
    expect(result.modifier).toBe('normal');
    expect(result.date).toBe('2026-09-10');
    expect(result.rationale.codes).toEqual(['NO_CHECKIN']);
  });

  it('reads normal when nothing at all was scored', () => {
    const result = assessReadiness(
      makeReadiness({
        sleepHours: null,
        sleepQuality: null,
        energy: null,
        soreness: null,
        fatigue: null,
        stress: null,
      }),
    );
    expect(result.score).toBeNull();
    expect(result.modifier).toBe('normal');
    expect(result.rationale.codes).toEqual(['NO_CHECKIN']);
  });

  it('exposes a score-only helper for the check-in form', () => {
    expect(
      readinessScore(
        makeReadiness({ sleepQuality: 3, energy: 3, soreness: 3, fatigue: 3, stress: 3 }),
      ),
    ).toBe(50);
  });
});

describe('safety event ordering — You → Safety', () => {
  function event(overrides: Partial<SafetyEvent> & Pick<SafetyEvent, 'id' | 'date'>): SafetyEvent {
    return {
      kind: 'pain',
      text: 'Left knee complained on the last set.',
      source: 'session',
      resolvedAt: null,
      note: null,
      ...overrides,
    };
  }

  it('puts every open event ahead of every resolved one', () => {
    const oldOpen = event({ id: 'a', date: '2026-01-01' });
    const newResolved = event({
      id: 'b',
      date: '2026-06-01',
      resolvedAt: '2026-06-02T00:00:00.000Z',
    });

    expect(orderSafetyEvents([newResolved, oldOpen]).map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('orders each group newest date first', () => {
    const ordered = orderSafetyEvents([
      event({ id: 'open-old', date: '2026-01-01' }),
      event({ id: 'resolved-new', date: '2026-04-01', resolvedAt: '2026-04-02T00:00:00.000Z' }),
      event({ id: 'open-new', date: '2026-03-01' }),
      event({ id: 'resolved-old', date: '2026-02-01', resolvedAt: '2026-02-02T00:00:00.000Z' }),
    ]);

    expect(ordered.map((row) => row.id)).toEqual([
      'open-new',
      'open-old',
      'resolved-new',
      'resolved-old',
    ]);
  });

  it('breaks a same-day tie on id so the order is stable between renders', () => {
    const ordered = orderSafetyEvents([
      event({ id: 'evt-1', date: '2026-03-01' }),
      event({ id: 'evt-2', date: '2026-03-01' }),
    ]);
    expect(ordered.map((row) => row.id)).toEqual(['evt-2', 'evt-1']);
  });

  it('does not mutate the array it was given', () => {
    const rows = [event({ id: 'a', date: '2026-01-01' }), event({ id: 'b', date: '2026-02-01' })];
    const copy = [...rows];
    orderSafetyEvents(rows);
    expect(rows).toEqual(copy);
  });
});
