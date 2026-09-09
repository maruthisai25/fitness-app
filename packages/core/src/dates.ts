/**
 * Calendar helpers for `LocalDate` (`YYYY-MM-DD`) and `LocalTime` (`HH:mm`).
 *
 * `packages/core` is pure (DESIGN.md §5): nothing here reads the ambient clock.
 * Every function that needs "now" takes it as a parameter.
 *
 * All arithmetic runs through `Date.UTC`, so a `LocalDate` is treated as a
 * timezone-free calendar label — adding a day never lands on 23:00 the day
 * before because of a DST shift.
 */

import type { LocalDate, LocalTime, WeekDay } from './types';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MS_PER_DAY = 86_400_000;

/** A `LocalDate` split into its parts. `month` is 1-based. */
export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function parseLocalDate(date: LocalDate): DateParts {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD local date: "${date}"`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function isLocalDate(value: string): boolean {
  return DATE_PATTERN.test(value);
}

/** Milliseconds at midnight UTC of the calendar day. */
export function toEpochDay(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return Date.UTC(year, month - 1, day);
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Inverse of {@link toEpochDay}. */
export function fromEpochDay(millis: number): LocalDate {
  const d = new Date(millis);
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate(),
  )}`;
}

/** Builds a `LocalDate` from parts, normalising overflow (month 13 → next year). */
export function makeLocalDate(year: number, month: number, day: number): LocalDate {
  return fromEpochDay(Date.UTC(year, month - 1, day));
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromEpochDay(toEpochDay(date) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((toEpochDay(to) - toEpochDay(from)) / MS_PER_DAY);
}

/** -1, 0 or 1 — safe to pass straight to `Array#sort`. */
export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: LocalDate, b: LocalDate): boolean {
  return a < b;
}

export function isAfter(a: LocalDate, b: LocalDate): boolean {
  return a > b;
}

/** True when `date` is inside the inclusive range. */
export function isWithin(date: LocalDate, from: LocalDate, to: LocalDate): boolean {
  return date >= from && date <= to;
}

/** 0 = Sunday .. 6 = Saturday. */
export function weekdayOf(date: LocalDate): WeekDay {
  return new Date(toEpochDay(date)).getUTCDay() as WeekDay;
}

/** English weekday names, indexed by {@link WeekDay}. */
export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function weekdayName(day: WeekDay): string {
  return WEEKDAY_NAMES[day];
}

/** The first day of the week containing `date`, honouring `settings.weekStartsOn`. */
export function startOfWeek(date: LocalDate, weekStartsOn: WeekDay = 1): LocalDate {
  const offset = (weekdayOf(date) - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

export function endOfWeek(date: LocalDate, weekStartsOn: WeekDay = 1): LocalDate {
  return addDays(startOfWeek(date, weekStartsOn), 6);
}

/** Every day from `from` to `to` inclusive, ascending. */
export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  const out: LocalDate[] = [];
  for (let i = 0; i <= span; i += 1) out.push(addDays(from, i));
  return out;
}

/** The inclusive range `[to - (days - 1), to]`, i.e. a rolling window ending today. */
export function lastNDays(to: LocalDate, days: number): { from: LocalDate; to: LocalDate } {
  return { from: addDays(to, -(Math.max(1, days) - 1)), to };
}

/** Completed years between `birthDate` and `on`. */
export function ageYearsAt(birthDate: LocalDate, on: LocalDate): number {
  const b = parseLocalDate(birthDate);
  const o = parseLocalDate(on);
  let age = o.year - b.year;
  if (o.month < b.month || (o.month === b.month && o.day < b.day)) age -= 1;
  return age;
}

// ---------------------------------------------------------------------------
// Times of day
// ---------------------------------------------------------------------------

/** Minutes since local midnight. */
export function minutesOfDay(time: LocalTime): number {
  const match = TIME_PATTERN.exec(time);
  if (!match) throw new RangeError(`Not an HH:mm local time: "${time}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isLocalTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** -1, 0 or 1. */
export function compareLocalTime(a: LocalTime, b: LocalTime): number {
  const left = minutesOfDay(a);
  const right = minutesOfDay(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** True when the wall clock has reached `time`. */
export function timeReached(now: LocalTime, time: LocalTime): boolean {
  return minutesOfDay(now) >= minutesOfDay(time);
}

/** The later of two times of day. */
export function laterTime(a: LocalTime, b: LocalTime): LocalTime {
  return minutesOfDay(a) >= minutesOfDay(b) ? a : b;
}
