/**
 * Which food logs count towards a day's totals.
 *
 * DESIGN.md §6.4: a log whose estimate is still queued shows "estimating…" and
 * carries no final numbers. The Eat screens say the totals skip it until the
 * estimate lands, so the totals really must skip it — every caller of
 * `buildDayNutrition` filters through here first.
 *
 * Kept in its own module (no queries, no React) so both the Eat screens and the
 * foreground runner can use it without importing each other.
 */

import type { FoodLogWithItems } from '@vigor/core';

/** False only while the coach's estimate for this log is still outstanding. */
export function isFinalLog(log: FoodLogWithItems): boolean {
  return log.estimationStatus !== 'pending';
}

/** The logs whose items are settled, i.e. the ones the totals may count. */
export function finalLogs(logs: readonly FoodLogWithItems[]): FoodLogWithItems[] {
  return logs.filter(isFinalLog);
}
