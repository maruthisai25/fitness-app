/**
 * Reminder scheduling — DESIGN.md §7.3, §7.4.
 *
 * Two things a sync has to get right, both of them regressions:
 *
 *  - the weekly-review reminder still fires on review day after the runner has
 *    written the review row; only reading the review silences it;
 *  - a reminder that was decided earlier is decided again after a mutation, so
 *    a meal logged in between cancels the meal-log reminder instead of letting
 *    it fire from a stale plan.
 */

import type { Settings } from '@vigor/core';
import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/notifications', () => ({
  webNotifications: {
    requestPermission: vi.fn(async () => true),
    hasPermission: vi.fn(async () => true),
    schedule: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    cancelAll: vi.fn(async () => undefined),
    supportsBackgroundDelivery: () => false,
  },
}));

import { webNotifications } from '../platform/notifications';
import {
  lastCompletedWeekStart,
  loadReminderState,
  markWeeklyReviewSeen,
  notificationIdFor,
  runWeeklyReviewIfDue,
  syncReminders,
} from '../progress/foreground';

/** A Monday, so `weekStartsOn: 1` makes today the review day. */
const TODAY = '2026-01-05';

let db: TestDatabase;
let settings: Settings;

beforeEach(async () => {
  window.localStorage.clear();
  vi.clearAllMocks();
  db = await createTestDatabase({ start: `${TODAY}T08:00:00.000Z` });
  settings = {
    ...(await db.repos.settings.getAll()),
    notificationsEnabled: true,
    weekStartsOn: 1,
    reminderTimes: {
      workout: null,
      missedWorkout: '08:00',
      mealLog: '08:00',
      protein: null,
      weeklyReview: '09:00',
      measurement: '08:00',
    },
  };
});

afterEach(async () => {
  window.localStorage.clear();
  await db.close();
});

describe('loadReminderState', () => {
  it('loads the real skip-rule inputs, and asks about the week that just ended', async () => {
    await db.repos.targets.create({
      effectiveFrom: '2025-12-01',
      kcal: 2200,
      proteinG: 150,
      carbsG: 250,
      fatG: 60,
      fiberG: 30,
    });
    await db.repos.nutrition.createLog({
      date: TODAY,
      mealSlot: 'lunch',
      rawText: 'a bowl of dal',
      source: 'manual',
      estimationStatus: 'final',
      loggedAt: new Date().toISOString(),
      items: [
        {
          name: 'Dal',
          quantity: 1,
          unit: 'bowl',
          kcal: 300,
          proteinG: 20,
          carbsG: 40,
          fatG: 8,
          fiberG: 6,
          confidence: 1,
          savedMealId: null,
        },
      ],
    });

    // The review row exists; nobody has read it.
    await runWeeklyReviewIfDue(db.repos, TODAY, settings.weekStartsOn);

    const state = await loadReminderState(db.repos, settings, TODAY, '12:00');

    // Not the hard-coded nulls the preview used to pass.
    expect(state.remainingProteinG).toBeCloseTo(130, 6);
    expect(state.minutesSinceLastMealLog).not.toBeNull();
    expect(state.minutesSinceLastMealLog ?? Number.NaN).toBeLessThan(5);
    // "Has this week's review been read", not "does any review exist".
    expect(state.reviewWeekViewed).toBe(false);
    // The two §24 inputs the web shell used to have no answer for.
    expect(state.lastMissedWorkoutDate).toBeNull();
    expect(state.daysSinceLastMeasurement).toBeNull();

    await markWeeklyReviewSeen(db.repos, lastCompletedWeekStart(TODAY, settings.weekStartsOn));
    const seenSettings: Settings = {
      ...settings,
      lastReviewViewedWeek: await db.repos.settings.get('lastReviewViewedWeek'),
    };
    expect((await loadReminderState(db.repos, seenSettings, TODAY, '12:00')).reviewWeekViewed).toBe(
      true,
    );
  });
});

describe('the two idea.md §24 reminders the web shell was missing', () => {
  it('follows up the morning after a skipped session, and measures the measurement gap', async () => {
    const workout = await db.repos.workouts.create({
      date: '2026-01-04',
      status: 'planned',
      source: 'rule',
      title: 'Lower body',
    });
    await db.repos.workouts.setStatus(workout.id, 'skipped');
    await db.repos.body.upsertMetric({ date: '2025-12-01', weightKg: 80 });

    const state = await loadReminderState(db.repos, settings, TODAY, '09:00');
    expect(state.lastMissedWorkoutDate).toBe('2026-01-04');
    expect(state.daysSinceLastMeasurement).toBe(35);

    const result = await syncReminders(db.repos, settings, TODAY, '09:00');
    const missed = result.decisions.find((decision) => decision.kind === 'missed_workout');
    expect(missed?.fires).toBe(true);
    expect(missed?.rationale.codes).toContain('MISSED_WORKOUT_FOLLOW_UP');

    const measurement = result.decisions.find((decision) => decision.kind === 'measurement');
    expect(measurement?.fires).toBe(true);
    expect(measurement?.rationale.codes).toContain('MEASUREMENT_DUE');
  });

  it('stays quiet about a measurement taken this week', async () => {
    await db.repos.body.upsertMetric({ date: '2026-01-03', weightKg: 80 });
    const result = await syncReminders(db.repos, settings, TODAY, '09:00');
    const measurement = result.decisions.find((decision) => decision.kind === 'measurement');
    expect(measurement?.fires).toBe(false);
    expect(measurement?.rationale.codes).toContain('MEASUREMENT_RECENT');
    expect(result.cancelled).toContain(notificationIdFor('measurement'));
  });
});

describe('syncReminders', () => {
  it('still fires the weekly review reminder after the runner has written the row', async () => {
    // The foreground runner writes the review before reminders are evaluated.
    expect(await runWeeklyReviewIfDue(db.repos, TODAY, settings.weekStartsOn)).toBe(
      lastCompletedWeekStart(TODAY, settings.weekStartsOn),
    );
    expect(await db.repos.reviews.getByWeek(lastCompletedWeekStart(TODAY, 1))).not.toBeNull();

    const before = await syncReminders(db.repos, settings, TODAY, '10:00');
    const review = before.decisions.find((decision) => decision.kind === 'weekly_review');
    expect(review?.fires).toBe(true);
    expect(review?.rationale.codes).toContain('WEEKLY_REVIEW_DUE');
    expect(before.scheduled).toContain(notificationIdFor('weekly_review'));

    // Reading the week is what silences it — for that week only.
    await markWeeklyReviewSeen(db.repos, lastCompletedWeekStart(TODAY, settings.weekStartsOn));
    const seenSettings: Settings = {
      ...settings,
      lastReviewViewedWeek: await db.repos.settings.get('lastReviewViewedWeek'),
    };

    const after = await syncReminders(db.repos, seenSettings, TODAY, '10:00');
    const reviewAgain = after.decisions.find((decision) => decision.kind === 'weekly_review');
    expect(reviewAgain?.fires).toBe(false);
    expect(reviewAgain?.rationale.codes).toContain('REVIEW_ALREADY_VIEWED');
    expect(after.cancelled).toContain(notificationIdFor('weekly_review'));
  });

  it('re-decides a scheduled reminder after a meal is logged', async () => {
    const mealLogId = notificationIdFor('meal_log');

    const before = await syncReminders(db.repos, settings, TODAY, '12:00');
    expect(before.decisions.find((decision) => decision.kind === 'meal_log')?.fires).toBe(true);
    expect(before.scheduled).toContain(mealLogId);
    expect(webNotifications.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ id: mealLogId }),
    );

    // The mutation a resync follows: something was logged just now.
    await db.repos.nutrition.createLog({
      date: TODAY,
      mealSlot: 'lunch',
      rawText: 'a bowl of dal',
      source: 'manual',
      estimationStatus: 'final',
      loggedAt: new Date().toISOString(),
      items: [
        {
          name: 'Dal',
          quantity: 1,
          unit: 'bowl',
          kcal: 300,
          proteinG: 20,
          carbsG: 40,
          fatG: 8,
          fiberG: 6,
          confidence: 1,
          savedMealId: null,
        },
      ],
    });

    const after = await syncReminders(db.repos, settings, TODAY, '12:00');
    const mealLog = after.decisions.find((decision) => decision.kind === 'meal_log');
    expect(mealLog?.fires).toBe(false);
    expect(mealLog?.rationale.codes).toContain('MEAL_LOGGED_RECENTLY');
    expect(after.cancelled).toContain(mealLogId);
    expect(webNotifications.cancel).toHaveBeenCalledWith(mealLogId);
  });

  it('ignores a log whose estimate has not landed yet', async () => {
    await db.repos.nutrition.createLog({
      date: TODAY,
      mealSlot: 'lunch',
      rawText: 'whatever the coach makes of this',
      source: 'ai',
      estimationStatus: 'pending',
      loggedAt: new Date().toISOString(),
      items: [],
    });

    const result = await syncReminders(db.repos, settings, TODAY, '12:00');
    const mealLog = result.decisions.find((decision) => decision.kind === 'meal_log');
    expect(mealLog?.fires).toBe(true);
  });
});
