/**
 * The once-a-day insight run and the weekly review — DESIGN.md §5.8, §5.9, §8.
 *
 * Both run against a real migrated database so the dedupe rules and the
 * idempotent `ai_jobs` id are exercised for real, not mocked.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addDays, type FoodItemDraft, type LocalDate, type ReminderKind } from '@vigor/core';
import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';

import type { Notifications, ScheduledNotification } from '@vigor/platform';

import {
  dismissInsight,
  ensureWeeklyReview,
  resetDetectorGuard,
  runDailyInsights,
  runForegroundWork,
  weeklyReviewJobId,
} from './foreground';
import { insightIdentity } from './insightIdentity';
import { notificationIdFor } from './reminders';

const TODAY: LocalDate = '2026-09-10';

const SHORTFALL: FoodItemDraft = {
  name: 'Instant noodles',
  quantity: 1,
  unit: 'pack',
  kcal: 1000,
  proteinG: 40,
  carbsG: 120,
  fatG: 30,
  fiberG: 3,
  confidence: 1,
  savedMealId: null,
};

let db: TestDatabase;

beforeEach(async () => {
  resetDetectorGuard();
  db = await createTestDatabase();
});

afterEach(async () => {
  await db.close();
});

async function seedShortWeeks(days: number): Promise<void> {
  await db.repos.targets.create({
    effectiveFrom: '2026-08-01',
    kcal: 2400,
    proteinG: 150,
    carbsG: 250,
    fatG: 70,
    fiberG: 34,
  });
  for (let index = 0; index < days; index += 1) {
    await db.repos.nutrition.createLog({
      date: addDays(TODAY, -index),
      mealSlot: 'dinner',
      rawText: 'noodles',
      source: 'manual',
      items: [SHORTFALL],
    });
  }
}

describe('runDailyInsights', () => {
  it('writes detector output once and then dedupes it', async () => {
    await seedShortWeeks(7);

    const first = await runDailyInsights(db.repos, TODAY);
    expect(first.ran).toBe(true);
    expect(first.created).toBeGreaterThan(0);

    const stored = await db.repos.insights.list({ includeDismissed: true });
    expect(stored.length).toBe(first.created);
    expect(stored.some((insight) => insight.detector === 'MISSED_TARGET_STREAK')).toBe(true);

    // Same session, same day: the guard stops it.
    const second = await runDailyInsights(db.repos, TODAY);
    expect(second.ran).toBe(false);

    // The guard is `settings.insightsLastRunOn`, so it survives a cold start
    // rather than resetting with the module.
    resetDetectorGuard();
    expect(await db.repos.settings.get('insightsLastRunOn')).toBe(TODAY);
    expect((await runDailyInsights(db.repos, TODAY)).ran).toBe(false);

    // Forced past the guard, every draft still matches a stored row, so a
    // repeat run writes nothing new.
    resetDetectorGuard();
    await db.repos.settings.set('insightsLastRunOn', null);
    const third = await runDailyInsights(db.repos, TODAY);
    expect(third.created).toBe(0);
    expect(third.duplicates).toBe(first.created);
    expect(await db.repos.insights.list({ includeDismissed: true })).toHaveLength(first.created);
  });

  it('keeps one row per insight across days and refreshes it in place', async () => {
    await seedShortWeeks(7);

    const first = await runDailyInsights(db.repos, TODAY);
    const before = await db.repos.insights.list({ includeDismissed: true });
    const streak = before.find((insight) => insight.detector === 'MISSED_TARGET_STREAK');
    expect(streak).toBeDefined();

    // Tomorrow the rolling window has moved, so every draft carries a new
    // period and a new detail. That must refresh the row, not clone it.
    resetDetectorGuard();
    const tomorrow = addDays(TODAY, 1);
    const second = await runDailyInsights(db.repos, tomorrow);

    expect(second.ran).toBe(true);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(first.created);

    const after = await db.repos.insights.list({ includeDismissed: true });
    expect(after).toHaveLength(before.length);
    const refreshed = after.find((insight) => insight.id === streak?.id);
    expect(refreshed).toBeDefined();
    expect(refreshed?.period.to).toBe(tomorrow);
  });

  it('leaves a dismissed insight dismissed on the next run', async () => {
    await seedShortWeeks(7);
    await runDailyInsights(db.repos, TODAY);

    const streak = (await db.repos.insights.list({ includeDismissed: true })).find(
      (insight) => insight.detector === 'MISSED_TARGET_STREAK',
    );
    expect(streak).toBeDefined();
    const dismissed = await dismissInsight(db.repos, streak as NonNullable<typeof streak>, TODAY);
    const identity = insightIdentity(dismissed);

    resetDetectorGuard();
    const second = await runDailyInsights(db.repos, addDays(TODAY, 1));

    expect(second.suppressed).toBe(1);
    const sameInsight = (await db.repos.insights.list({ includeDismissed: true })).filter(
      (insight) => insightIdentity(insight) === identity,
    );
    expect(sameInsight).toHaveLength(1);
    expect(sameInsight[0].dismissed).toBe(true);
  });

  it('writes once when two screens start a run at the same moment', async () => {
    await seedShortWeeks(7);

    const [left, right] = await Promise.all([
      runDailyInsights(db.repos, TODAY),
      runDailyInsights(db.repos, TODAY),
    ]);

    // Both callers joined the same pass, so both see the same outcome.
    expect(right).toBe(left);
    expect(await db.repos.insights.list({ includeDismissed: true })).toHaveLength(left.created);
  });

  it('reports honestly when there is nothing to say', async () => {
    const outcome = await runDailyInsights(db.repos, TODAY);
    expect(outcome.ran).toBe(true);
    expect(outcome.created).toBe(0);
    expect(outcome.reason).toContain('detectors ran');
  });
});

describe('ensureWeeklyReview', () => {
  it('builds the week that just ended and queues the coach summary', async () => {
    await seedShortWeeks(10);

    const outcome = await ensureWeeklyReview(db.repos, TODAY, 1);

    // 10 Sep 2026 is a Thursday, so the completed week began Monday 31 Aug.
    expect(outcome.weekStart).toBe('2026-08-31');
    expect(outcome.queuedSummary).toBe(true);

    const review = await db.repos.reviews.getByWeek('2026-08-31');
    expect(review).not.toBeNull();
    expect(review?.summary).toBeNull();
    expect(review?.nutrition.daysLogged).toBeGreaterThan(0);

    const jobs = await db.repos.aiJobs.list({ kind: 'weekly_review' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(weeklyReviewJobId('2026-08-31'));
    expect(jobs[0].resultRef).toBe(review?.id);
  });

  it('does nothing on a second run', async () => {
    await seedShortWeeks(10);
    await ensureWeeklyReview(db.repos, TODAY, 1);

    const second = await ensureWeeklyReview(db.repos, TODAY, 1);
    expect(second.weekStart).toBeNull();
    expect(second.queuedSummary).toBe(false);
    expect(await db.repos.aiJobs.list({ kind: 'weekly_review' })).toHaveLength(1);
  });
});

function notificationRecorder(): Notifications & {
  scheduled: ScheduledNotification[];
  cancelled: string[];
} {
  const scheduled: ScheduledNotification[] = [];
  const cancelled: string[] = [];
  return {
    scheduled,
    cancelled,
    requestPermission: async () => true,
    hasPermission: async () => true,
    schedule: async (notification) => {
      scheduled.push(notification);
    },
    cancel: async (id) => {
      cancelled.push(id);
    },
    cancelAll: async () => undefined,
    supportsBackgroundDelivery: () => true,
  };
}

const CLOCK = { now: () => '2026-09-10T12:00:00.000Z', today: () => TODAY };

describe('runForegroundWork', () => {
  it('writes once when several screens mount at the same moment', async () => {
    await seedShortWeeks(10);
    const notifications = notificationRecorder();

    const runs = await Promise.all([
      runForegroundWork({ repos: db.repos, clock: CLOCK, notifications }),
      runForegroundWork({ repos: db.repos, clock: CLOCK, notifications }),
      runForegroundWork({ repos: db.repos, clock: CLOCK, notifications }),
    ]);

    // One pass, joined by all three callers.
    expect(runs[1]).toBe(runs[0]);
    expect(runs[2]).toBe(runs[0]);
    expect(await db.repos.insights.list({ includeDismissed: true })).toHaveLength(
      runs[0].insights.created,
    );
    expect(await db.repos.aiJobs.list({ kind: 'weekly_review' })).toHaveLength(1);
    expect(await db.repos.reviews.list()).toHaveLength(1);
  });

  it('cancels every scheduled reminder when notifications are switched off elsewhere', async () => {
    await db.repos.settings.set('notificationsEnabled', false);
    const notifications = notificationRecorder();

    const result = await runForegroundWork({ repos: db.repos, clock: CLOCK, notifications });

    expect(result.reminders).toBeNull();
    expect(notifications.scheduled).toEqual([]);
    const everyKind: ReminderKind[] = ['workout', 'meal_log', 'protein', 'weekly_review'];
    expect(notifications.cancelled.sort()).toEqual(everyKind.map(notificationIdFor).sort());
  });
});
