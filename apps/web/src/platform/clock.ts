import type { Clock } from '@vigor/platform';

/** Web `Clock` — DESIGN.md §4: ISO 8601 UTC instants, `YYYY-MM-DD` local calendar days. */
export const webClock: Clock = {
  now(): string {
    return new Date().toISOString();
  },
  today(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },
};
