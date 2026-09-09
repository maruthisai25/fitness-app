import { describe, expect, it } from 'vitest';

import {
  daysBetween,
  isLocalDate,
  localDateFromTimestamp,
  shiftLocalDate,
  windowEndingOn,
} from './dates';

describe('local date helpers', () => {
  it('shifts across month and year boundaries', () => {
    expect(shiftLocalDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftLocalDate('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftLocalDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftLocalDate('2026-05-10', 0)).toBe('2026-05-10');
  });

  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-03-01', '2026-03-08')).toBe(7);
    expect(daysBetween('2026-03-08', '2026-03-01')).toBe(-7);
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
  });

  it('builds an inclusive window ending on a day', () => {
    expect(windowEndingOn('2026-03-08', 7)).toEqual({ from: '2026-03-02', to: '2026-03-08' });
    expect(windowEndingOn('2026-03-08', 1)).toEqual({ from: '2026-03-08', to: '2026-03-08' });
    expect(() => windowEndingOn('2026-03-08', 0)).toThrow();
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(isLocalDate('2026-03-08')).toBe(true);
    expect(isLocalDate('2026-3-8')).toBe(false);
    expect(isLocalDate('2026-03-08T00:00:00Z')).toBe(false);
    expect(() => shiftLocalDate('yesterday', 1)).toThrow(/YYYY-MM-DD/);
  });

  it('takes the calendar day off a timestamp', () => {
    expect(localDateFromTimestamp('2026-03-08T23:45:00.000Z')).toBe('2026-03-08');
  });
});
