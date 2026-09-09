import { describe, expect, it } from 'vitest';

import {
  addDays,
  ageYearsAt,
  compareLocalDate,
  compareLocalTime,
  daysBetween,
  eachDay,
  endOfWeek,
  isAfter,
  isBefore,
  isLocalDate,
  isLocalTime,
  isWithin,
  lastNDays,
  laterTime,
  makeLocalDate,
  minutesOfDay,
  parseLocalDate,
  startOfWeek,
  timeReached,
  weekdayName,
  weekdayOf,
} from './dates';

describe('local dates', () => {
  it('parses and validates YYYY-MM-DD', () => {
    expect(parseLocalDate('2026-09-10')).toEqual({ year: 2026, month: 9, day: 10 });
    expect(isLocalDate('2026-09-10')).toBe(true);
    expect(isLocalDate('10/09/2026')).toBe(false);
    expect(() => parseLocalDate('10/09/2026')).toThrow(RangeError);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-09-10', 1)).toBe('2026-09-11');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('normalises overflow in makeLocalDate', () => {
    expect(makeLocalDate(2026, 13, 1)).toBe('2027-01-01');
  });

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-09-01', '2026-09-10')).toBe(9);
    expect(daysBetween('2026-09-10', '2026-09-01')).toBe(-9);
  });

  it('compares and orders', () => {
    expect(compareLocalDate('2026-09-01', '2026-09-02')).toBe(-1);
    expect(compareLocalDate('2026-09-02', '2026-09-01')).toBe(1);
    expect(compareLocalDate('2026-09-01', '2026-09-01')).toBe(0);
    expect(isBefore('2026-09-01', '2026-09-02')).toBe(true);
    expect(isAfter('2026-09-01', '2026-09-02')).toBe(false);
    expect(isWithin('2026-09-05', '2026-09-01', '2026-09-10')).toBe(true);
    expect(isWithin('2026-09-11', '2026-09-01', '2026-09-10')).toBe(false);
  });

  it('knows weekdays', () => {
    expect(weekdayOf('2026-09-10')).toBe(4); // a Thursday
    expect(weekdayName(weekdayOf('2026-09-10'))).toBe('Thursday');
  });

  it('snaps to the start and end of the week', () => {
    expect(startOfWeek('2026-09-10', 1)).toBe('2026-09-07');
    expect(endOfWeek('2026-09-10', 1)).toBe('2026-09-13');
    expect(startOfWeek('2026-09-10', 0)).toBe('2026-09-06');
  });

  it('enumerates a range and a rolling window', () => {
    expect(eachDay('2026-09-08', '2026-09-10')).toEqual(['2026-09-08', '2026-09-09', '2026-09-10']);
    expect(eachDay('2026-09-10', '2026-09-08')).toEqual([]);
    expect(lastNDays('2026-09-10', 7)).toEqual({ from: '2026-09-04', to: '2026-09-10' });
  });

  it('computes completed years of age', () => {
    expect(ageYearsAt('1994-05-02', '2026-09-10')).toBe(32);
    expect(ageYearsAt('1994-12-02', '2026-09-10')).toBe(31);
    expect(ageYearsAt('1994-09-10', '2026-09-10')).toBe(32);
  });
});

describe('local times', () => {
  it('parses HH:mm into minutes', () => {
    expect(minutesOfDay('18:30')).toBe(1110);
    expect(isLocalTime('18:30')).toBe(true);
    expect(isLocalTime('25:00')).toBe(false);
    expect(() => minutesOfDay('7:00')).toThrow(RangeError);
  });

  it('compares times of day', () => {
    expect(compareLocalTime('17:00', '18:00')).toBe(-1);
    expect(compareLocalTime('18:00', '17:00')).toBe(1);
    expect(compareLocalTime('18:00', '18:00')).toBe(0);
    expect(timeReached('18:30', '18:00')).toBe(true);
    expect(timeReached('17:30', '18:00')).toBe(false);
    expect(laterTime('16:00', '18:00')).toBe('18:00');
    expect(laterTime('20:00', '18:00')).toBe('20:00');
  });
});
