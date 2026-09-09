/**
 * Reading the app's one foreground runner.
 *
 * The runner itself is `ProgressForegroundProvider`, mounted once above the
 * tabs. This module is only the context around it, and holds no imports of the
 * database or the platform adapters on purpose: any component — a food-log
 * card deep in the Eat tab — can ask for a resync without dragging the Expo
 * modules into its own module graph.
 */
import { createContext, useContext } from 'react';

import type { ReminderSyncResult } from './reminders';

export interface ForegroundStatus {
  running: boolean;
  lastRunAt: string | null;
  insights: string | null;
  review: string | null;
  reminders: ReminderSyncResult | null;
  error: string | null;
  /** Re-runs everything now — the Progress screens offer this as a refresh. */
  refresh: () => void;
}

/** What a component sees when no runner is mounted above it. */
export const IDLE_FOREGROUND: ForegroundStatus = {
  running: false,
  lastRunAt: null,
  insights: null,
  review: null,
  reminders: null,
  error: null,
  refresh: () => undefined,
};

export const ForegroundContext = createContext<ForegroundStatus | null>(null);

/**
 * The runner's status. Outside the provider — a component rendered on its own
 * in a test, say — this reports an idle runner rather than starting a second
 * one, because exactly one runner exists and it lives at app level.
 */
export function useProgressForeground(): ForegroundStatus {
  return useContext(ForegroundContext) ?? IDLE_FOREGROUND;
}

/**
 * The resync a successful mutation calls: run it after the write lands, so the
 * reminder rules are re-evaluated against the state the user just created
 * instead of waiting for the next visit to the Progress tab.
 *
 * Outside the provider it is a no-op, so components stay renderable alone.
 */
export function useReminderResync(): () => void {
  const foreground = useContext(ForegroundContext);
  return foreground?.refresh ?? IDLE_FOREGROUND.refresh;
}
