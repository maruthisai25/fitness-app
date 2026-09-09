import { beforeEach, describe, expect, it } from 'vitest';

import { makeSet, resetFixtureIds } from './fixtures';
import { computeStreak, detectPersonalRecords, expandRestDays, type StreakDay } from './records';
import { epleyE1rm } from './setMath';
import type { PersonalRecord } from './types';

beforeEach(() => {
  resetFixtureIds();
});

describe('Epley e1RM — DESIGN.md §5.7', () => {
  it('uses load × (1 + reps / 30)', () => {
    expect(epleyE1rm(100, 1)).toBeCloseTo(103.333, 3);
    expect(epleyE1rm(60, 10)).toBe(80);
  });

  it('refuses above twelve reps and for unloaded work', () => {
    expect(epleyE1rm(60, 13)).toBeNull();
    expect(epleyE1rm(60, 12)).not.toBeNull();
    expect(epleyE1rm(null, 5)).toBeNull();
    expect(epleyE1rm(60, null)).toBeNull();
    expect(epleyE1rm(0, 5)).toBeNull();
    expect(epleyE1rm(60, 0)).toBeNull();
  });
});

describe('detectPersonalRecords', () => {
  const existing: PersonalRecord[] = [
    {
      id: 'pr-1',
      exerciseId: 'ex-bench',
      kind: 'e1rm',
      value: 78,
      loadKg: 60,
      reps: 9,
      setId: 'set-old',
      date: '2026-08-01',
    },
    {
      id: 'pr-2',
      exerciseId: 'ex-bench',
      kind: 'max_load',
      value: 70,
      loadKg: 70,
      reps: 3,
      setId: 'set-old-2',
      date: '2026-08-01',
    },
    {
      id: 'pr-3',
      exerciseId: 'ex-bench',
      kind: 'session_volume',
      value: 2000,
      loadKg: null,
      reps: null,
      setId: null,
      date: '2026-08-01',
    },
  ];

  it('detects a new estimated 1RM', () => {
    const result = detectPersonalRecords({
      exerciseId: 'ex-bench',
      date: '2026-09-10',
      sets: [makeSet({ id: 'set-a', actualReps: 10, actualLoadKg: 62.5 })],
      existing,
    });

    const e1rm = result.records.find((record) => record.kind === 'e1rm');
    expect(e1rm).toMatchObject({ kind: 'e1rm', loadKg: 62.5, reps: 10, setId: 'set-a' });
    expect(e1rm?.value).toBeCloseTo(83.333, 3);
    expect(result.rationale.codes).toContain('PR_E1RM');
    expect(result.rationale.summary).toContain('New estimated 1RM');
  });

  it('detects a new max load and reports it as a record', () => {
    const result = detectPersonalRecords({
      exerciseId: 'ex-bench',
      date: '2026-09-10',
      sets: [makeSet({ actualReps: 2, actualLoadKg: 75 })],
      existing,
    });
    expect(result.records.some((record) => record.kind === 'max_load')).toBe(true);
    expect(result.rationale.codes).toContain('PR_MAX_LOAD');
  });

  it('detects most reps at a given load', () => {
    const withRepRecord: PersonalRecord[] = [
      ...existing,
      {
        id: 'pr-4',
        exerciseId: 'ex-bench',
        kind: 'max_reps_at_load',
        value: 8,
        loadKg: 60,
        reps: 8,
        setId: 'set-old-3',
        date: '2026-08-01',
      },
    ];

    const better = detectPersonalRecords({
      exerciseId: 'ex-bench',
      date: '2026-09-10',
      sets: [makeSet({ actualReps: 10, actualLoadKg: 60 })],
      existing: withRepRecord,
    });
    expect(better.records.some((record) => record.kind === 'max_reps_at_load')).toBe(true);

    const worse = detectPersonalRecords({
      exerciseId: 'ex-bench',
      date: '2026-09-10',
      sets: [makeSet({ actualReps: 7, actualLoadKg: 60 })],
      existing: withRepRecord,
    });
    expect(worse.records.some((record) => record.kind === 'max_reps_at_load')).toBe(false);
  });

  it('detects a session volume record', () => {
    const result = detectPersonalRecords({
      exerciseId: 'ex-bench',
      date: '2026-09-10',
      sets: [
        makeSet({ actualReps: 12, actualLoadKg: 60 }),
        makeSet({ actualReps: 12, actualLoadKg: 60, setIndex: 1 }),
        makeSet({ actualReps: 12, actualLoadKg: 60, setIndex: 2 }),
      ],
      existing,
    });
    const volume = result.records.find((record) => record.kind === 'session_volume');
    expect(volume?.value).toBe(2160);
  });

  it('reports no PR when nothing beat the record', () => {
    const result = detectPersonalRecords({
      exerciseId: 'ex-bench',
      date: '2026-09-10',
      sets: [makeSet({ actualReps: 5, actualLoadKg: 50 })],
      existing: [
        ...existing,
        {
          id: 'pr-5',
          exerciseId: 'ex-bench',
          kind: 'max_reps_at_load',
          value: 8,
          loadKg: 50,
          reps: 8,
          setId: 'set-old-4',
          date: '2026-08-01',
        },
      ],
    });
    expect(result.records).toEqual([]);
    expect(result.rationale.codes).toEqual(['NO_NEW_PR']);
  });

  it('treats the first ever session at a load as a reps-at-load record', () => {
    const result = detectPersonalRecords({
      exerciseId: 'ex-bench',
      date: '2026-09-10',
      sets: [makeSet({ actualReps: 5, actualLoadKg: 50 })],
      existing,
    });
    expect(result.records.map((record) => record.kind)).toEqual(['max_reps_at_load']);
  });

  it('ignores warmups and incomplete sets', () => {
    const result = detectPersonalRecords({
      exerciseId: 'ex-bench',
      date: '2026-09-10',
      sets: [
        makeSet({ actualReps: 12, actualLoadKg: 100, isWarmup: true }),
        makeSet({ actualReps: 12, actualLoadKg: 100, completed: false, setIndex: 1 }),
      ],
      existing,
    });
    expect(result.records).toEqual([]);
    expect(result.rationale.codes).toEqual(['NO_COMPLETED_SETS']);
  });

  it('sets every record on a first-ever session', () => {
    const result = detectPersonalRecords({
      exerciseId: 'ex-bench',
      date: '2026-09-10',
      sets: [makeSet({ actualReps: 10, actualLoadKg: 40 })],
      existing: [],
    });
    expect(result.records.map((record) => record.kind).sort()).toEqual([
      'e1rm',
      'max_load',
      'max_reps_at_load',
      'session_volume',
    ]);
  });
});

describe('computeStreak — DESIGN.md §5.7', () => {
  const day = (date: string, planned: boolean, completed: boolean): StreakDay => ({
    date,
    planned,
    completed,
  });

  it('counts consecutive completed planned days', () => {
    const result = computeStreak({
      today: '2026-09-10',
      days: [
        day('2026-09-08', true, true),
        day('2026-09-09', true, true),
        day('2026-09-10', true, true),
      ],
    });
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
    expect(result.startedOn).toBe('2026-09-08');
    expect(result.rationale.codes).toEqual(['STREAK_ACTIVE']);
  });

  it('never breaks a streak on a rest day', () => {
    const result = computeStreak({
      today: '2026-09-10',
      days: [
        day('2026-09-07', true, true),
        day('2026-09-08', false, false),
        day('2026-09-09', false, false),
        day('2026-09-10', true, true),
      ],
    });
    expect(result.current).toBe(2);
    expect(result.rationale.summary).toContain('rest days do not break it');
  });

  it('breaks on a missed planned day', () => {
    const result = computeStreak({
      today: '2026-09-10',
      days: [
        day('2026-09-07', true, true),
        day('2026-09-08', true, true),
        day('2026-09-09', true, false),
        day('2026-09-10', true, true),
      ],
    });
    expect(result.current).toBe(1);
    expect(result.longest).toBe(2);
    expect(result.lastMissedOn).toBe('2026-09-09');
  });

  it('reports no streak when the latest planned day was missed', () => {
    const result = computeStreak({
      today: '2026-09-10',
      days: [day('2026-09-09', true, true), day('2026-09-10', true, false)],
    });
    expect(result.current).toBe(0);
    expect(result.startedOn).toBeNull();
    expect(result.rationale.codes).toEqual(['STREAK_BROKEN']);
  });

  it('ignores days after today', () => {
    const result = computeStreak({
      today: '2026-09-09',
      days: [day('2026-09-09', true, true), day('2026-09-10', true, false)],
    });
    expect(result.current).toBe(1);
  });

  it('handles an empty history', () => {
    const result = computeStreak({ today: '2026-09-10', days: [] });
    expect(result).toMatchObject({ current: 0, longest: 0, startedOn: null, lastMissedOn: null });
  });

  it('expands the gaps into rest days', () => {
    const days = expandRestDays('2026-09-08', '2026-09-10', [day('2026-09-09', true, true)]);
    expect(days).toEqual([
      { date: '2026-09-08', planned: false, completed: false },
      { date: '2026-09-09', planned: true, completed: true },
      { date: '2026-09-10', planned: false, completed: false },
    ]);
    expect(computeStreak({ today: '2026-09-10', days }).current).toBe(1);
  });
});
