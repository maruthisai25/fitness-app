/**
 * `Clock` adapter (DESIGN.md §4: timestamps are ISO 8601 UTC, calendar days
 * are local `YYYY-MM-DD` strings). Engines and repositories take a `Clock`
 * instead of calling `Date` directly so fixtures and tests stay deterministic
 * — this is the one implementation that actually reads the wall clock.
 */
import type { Clock } from '@vigor/platform';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function createClock(): Clock {
  return {
    now() {
      return new Date().toISOString();
    },
    today() {
      const now = new Date();
      return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    },
  };
}
