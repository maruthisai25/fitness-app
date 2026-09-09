/**
 * The app's one foreground runner.
 *
 * Mounted once in `app/_layout.tsx`, above the tabs, and the only thing that
 * calls `runForegroundWork`. Screens read the status out of the context
 * (`useProgressForeground`) instead of starting their own pass, so Progress,
 * Insights and Reminders mounting together no longer race each other through
 * the same read-then-write; mutations call `useReminderResync()` when their
 * write lands.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { useInvalidator } from '../data/queries';
import { usePlatform, useRepos } from '../db/AppDataProvider';
import { runForegroundWork } from './foreground';
import { ForegroundContext, IDLE_FOREGROUND, type ForegroundStatus } from './useProgressForeground';

export function ProgressForegroundProvider({ children }: { children: ReactNode }) {
  const repos = useRepos();
  const { clock, notifications } = usePlatform();
  const invalidate = useInvalidator();

  const [status, setStatus] = useState<ForegroundStatus>(IDLE_FOREGROUND);

  const run = useCallback(async () => {
    setStatus((current) => ({ ...current, running: true, error: null }));
    try {
      // Overlapping calls join the in-flight pass; nothing is run twice.
      const result = await runForegroundWork({ repos, clock, notifications });
      if (result.insights.created > 0 || result.insights.updated > 0) {
        invalidate('dismissInsight');
      }
      if (result.review.weekStart) invalidate('saveWeeklyReview', 'enqueueAiJob');
      setStatus((current) => ({
        ...current,
        running: false,
        lastRunAt: result.ranAt,
        insights: result.insights.reason,
        review: result.review.reason,
        reminders: result.reminders,
        error: null,
      }));
    } catch (caught) {
      setStatus((current) => ({
        ...current,
        running: false,
        error: caught instanceof Error ? caught.message : String(caught),
      }));
    }
  }, [clock, invalidate, notifications, repos]);

  useEffect(() => {
    void run();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void run();
    });
    return () => subscription.remove();
  }, [run]);

  const refresh = useCallback(() => void run(), [run]);

  return (
    <ForegroundContext.Provider value={{ ...status, refresh }}>
      {children}
    </ForegroundContext.Provider>
  );
}
