import type { LocalDate } from '@vigor/core';

/**
 * "Today" as the user's calendar day — DESIGN.md §4: every date that means a
 * day for the user is a `YYYY-MM-DD` **local** string, so this reads the
 * device timezone rather than slicing an ISO UTC timestamp.
 */
export function todayLocalDate(now: Date = new Date()): LocalDate {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `2026-09-10` → `Thu 10 Sep`. Long form for headings, short for rows. */
export function formatDate(date: LocalDate, variant: 'short' | 'long' = 'short'): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, (month ?? 1) - 1, day ?? 1);
  return value.toLocaleDateString(undefined, {
    weekday: variant === 'long' ? 'long' : 'short',
    day: 'numeric',
    month: variant === 'long' ? 'long' : 'short',
    ...(variant === 'long' ? { year: 'numeric' as const } : {}),
  });
}

/** Whole minutes between two ISO timestamps, floored at 0. */
export function minutesBetween(startedAt: string | null, finishedAt: string | null): number | null {
  if (!startedAt || !finishedAt) return null;
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 60_000));
}

/** `95` → `1:35`, for the rest countdown. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
