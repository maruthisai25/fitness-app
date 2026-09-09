/**
 * Calendar-day helpers for `YYYY-MM-DD` strings (DESIGN.md §4).
 *
 * A `LocalDate` is the user's calendar day, so arithmetic on it must not drift
 * with the device timezone. These functions treat the string as a plain civil
 * date and do the maths in UTC, which makes them exact for day counts.
 */

import type { IsoTimestamp, LocalDate } from '@vigor/core';

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: string): boolean {
  return LOCAL_DATE_PATTERN.test(value);
}

function assertLocalDate(date: LocalDate): void {
  if (!isLocalDate(date)) {
    throw new Error(`expected a YYYY-MM-DD local date, received "${date}"`);
  }
}

/** Moves a calendar day by whole days. Negative `days` goes backwards. */
export function shiftLocalDate(date: LocalDate, days: number): LocalDate {
  assertLocalDate(date);
  const time = Date.parse(`${date}T00:00:00.000Z`);
  const shifted = new Date(time + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  assertLocalDate(from);
  assertLocalDate(to);
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
  );
}

/**
 * The calendar day of an ISO timestamp, in UTC.
 *
 * Repositories use this only for defaults; anywhere the user's own day matters,
 * the caller passes the `LocalDate` it computed in the device timezone.
 */
export function localDateFromTimestamp(timestamp: IsoTimestamp): LocalDate {
  return timestamp.slice(0, 10);
}

/** The inclusive `days`-long window ending on `today`. */
export function windowEndingOn(today: LocalDate, days: number): { from: LocalDate; to: LocalDate } {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`expected a window of at least 1 day, received ${days}`);
  }
  return { from: shiftLocalDate(today, -(days - 1)), to: today };
}
