/**
 * Runs the Progress tab's background work when the app comes to the front:
 * the insight detectors, last week's review, and rescheduling the reminders.
 *
 * All three are idempotent, so re-running on every foreground is safe; the
 * once-a-day guard lives in `foreground.ts`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useInvalidator } from '../data/queries';
import { usePlatform, useRepos } from '../db/AppDataProvider';
import { ensureWeeklyReview, runDailyInsights } from './foreground';
import { readReminderState, syncReminders, type ReminderSyncResult } from './reminders';

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

export function useProgressForeground(): ForegroundStatus {
  const repos = useRepos();
  const { clock, notifications } = usePlatform();
  const invalidate = useInvalidator();

  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [insights, setInsights] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [reminders, setReminders] = useState<ReminderSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    setError(null);
    try {
      const today = clock.today();
      const settings = await repos.settings.getAll();

      const insightOutcome = await runDailyInsights(repos, today);
      setInsights(insightOutcome.reason);
      if (insightOutcome.created > 0) invalidate('dismissInsight');

      const reviewOutcome = await ensureWeeklyReview(repos, today, settings.weekStartsOn);
      setReview(reviewOutcome.reason);
      if (reviewOutcome.weekStart) invalidate('saveWeeklyReview', 'enqueueAiJob');

      if (settings.notificationsEnabled) {
        const state = await readReminderState(repos, { today });
        setReminders(await syncReminders(notifications, state));
      } else {
        setReminders(null);
      }

      setLastRunAt(clock.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      busy.current = false;
      setRunning(false);
    }
  }, [clock, invalidate, notifications, repos]);

  useEffect(() => {
    void run();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void run();
    });
    return () => subscription.remove();
  }, [run]);

  return {
    running,
    lastRunAt,
    insights,
    review,
    reminders,
    error,
    refresh: () => void run(),
  };
}
