/**
 * Reminder scheduling — DESIGN.md §7.3.
 *
 * The rules themselves are tested in `packages/core`; these tests cover the
 * app's half: picking the next occurrence, skipping a slot the rules already
 * silenced, and cancelling anything the user turned off.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ReminderKind, ReminderState, Settings } from '@vigor/core';
import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';
import type { Notifications, ScheduledNotification } from '@vigor/platform';

import {
  cancelAllReminders,
  nextOccurrence,
  notificationIdFor,
  readReminderState,
  syncReminders,
} from './reminders';

function recorder(): Notifications & {
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

const SETTINGS: Settings = {
  apiKeyRef: null,
  coachModel: 'claude-opus-5',
  fastModel: 'claude-haiku-4-5',
  notificationsEnabled: true,
  reminderTimes: { workout: '18:00', mealLog: '13:00', protein: '20:00', weeklyReview: '09:00' },
  weekStartsOn: 1,
  onboardingComplete: true,
  disclaimerAcceptedAt: '2026-01-01T00:00:00.000Z',
};

function stateAt(now: Date, overrides: Partial<ReminderState> = {}): ReminderState {
  return {
    today: '2026-09-10',
    now: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    weekday: 4,
    settings: SETTINGS,
    workoutCompletedToday: false,
    plannedWorkoutToday: true,
    minutesSinceLastMealLog: null,
    remainingProteinG: 90,
    weeklyReviewDay: 1,
    weeklyReviewGenerated: false,
    ...overrides,
  };
}

describe('nextOccurrence', () => {
  it('uses today when the slot is still ahead', () => {
    const now = new Date(2026, 8, 10, 9, 0, 0);
    const fireAt = new Date(nextOccurrence({ now, time: '18:00', skipToday: false }));
    expect(fireAt.getDate()).toBe(10);
    expect(fireAt.getHours()).toBe(18);
  });

  it('rolls to tomorrow once the slot has passed', () => {
    const now = new Date(2026, 8, 10, 19, 0, 0);
    const fireAt = new Date(nextOccurrence({ now, time: '18:00', skipToday: false }));
    expect(fireAt.getDate()).toBe(11);
  });

  it('skips today when the rules already silenced it', () => {
    const now = new Date(2026, 8, 10, 9, 0, 0);
    const fireAt = new Date(nextOccurrence({ now, time: '18:00', skipToday: true }));
    expect(fireAt.getDate()).toBe(11);
    expect(fireAt.getHours()).toBe(18);
  });

  it('lands on the chosen weekday for the weekly review', () => {
    // 10 Sep 2026 is a Thursday; the next Monday is the 14th.
    const now = new Date(2026, 8, 10, 9, 0, 0);
    const fireAt = new Date(nextOccurrence({ now, time: '09:00', skipToday: false, weekday: 1 }));
    expect(fireAt.getDay()).toBe(1);
    expect(fireAt.getDate()).toBe(14);
  });
});

describe('syncReminders', () => {
  it('schedules every enabled reminder exactly once', async () => {
    const notifications = recorder();
    const now = new Date(2026, 8, 10, 8, 0, 0);

    const result = await syncReminders(notifications, stateAt(now), now);

    const expectedIds: ReminderKind[] = ['meal_log', 'protein', 'weekly_review', 'workout'];
    expect(notifications.scheduled.map((entry) => entry.id).sort()).toEqual(
      expectedIds.map(notificationIdFor).sort(),
    );
    expect(notifications.cancelled).toEqual([]);
    expect(result.decisions).toHaveLength(4);
    expect(result.scheduled.workout).not.toBeNull();
  });

  it('cancels a reminder whose time was cleared', async () => {
    const notifications = recorder();
    const now = new Date(2026, 8, 10, 8, 0, 0);
    const state = stateAt(now, {
      settings: {
        ...SETTINGS,
        reminderTimes: { ...SETTINGS.reminderTimes, workout: null },
      },
    });

    await syncReminders(notifications, state, now);

    expect(notifications.cancelled).toEqual([notificationIdFor('workout')]);
    expect(notifications.scheduled.map((entry) => entry.id)).not.toContain(
      notificationIdFor('workout'),
    );
  });

  it('pushes the workout reminder to tomorrow once today is already trained', async () => {
    const notifications = recorder();
    const now = new Date(2026, 8, 10, 8, 0, 0);

    await syncReminders(notifications, stateAt(now, { workoutCompletedToday: true }), now);

    const workout = notifications.scheduled.find(
      (entry) => entry.id === notificationIdFor('workout'),
    );
    expect(workout).toBeDefined();
    expect(new Date(workout?.fireAt ?? '').getDate()).toBe(11);
  });

  it('still schedules today when the quiet reason expires before the slot', async () => {
    const notifications = recorder();
    // 09:00 now, meal-log slot at 13:00: the three-hour quiet window from the
    // 08:00 log is long over by then, so today's slot must survive.
    const now = new Date(2026, 8, 10, 9, 0, 0);

    await syncReminders(notifications, stateAt(now, { minutesSinceLastMealLog: 60 }), now);

    const mealLog = notifications.scheduled.find(
      (entry) => entry.id === notificationIdFor('meal_log'),
    );
    expect(new Date(mealLog?.fireAt ?? '').getDate()).toBe(10);
    expect(new Date(mealLog?.fireAt ?? '').getHours()).toBe(13);
  });

  it('skips today when the quiet reason still holds at the slot', async () => {
    const notifications = recorder();
    // 12:00 now, slot at 13:00, logged 30 minutes ago: still inside the quiet
    // window when the notification would fire, so today is given up.
    const now = new Date(2026, 8, 10, 12, 0, 0);

    await syncReminders(notifications, stateAt(now, { minutesSinceLastMealLog: 30 }), now);

    const mealLog = notifications.scheduled.find(
      (entry) => entry.id === notificationIdFor('meal_log'),
    );
    expect(new Date(mealLog?.fireAt ?? '').getDate()).toBe(11);
  });

  it('cancels everything when the user turns notifications off', async () => {
    const notifications = recorder();
    await cancelAllReminders(notifications);
    expect(notifications.cancelled).toHaveLength(4);
  });
});

describe('readReminderState', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('reads the protein gap and the meal-log gap out of the database', async () => {
    await db.repos.targets.create({
      effectiveFrom: '2026-09-01',
      kcal: 2400,
      proteinG: 150,
      carbsG: 250,
      fatG: 70,
      fiberG: 34,
    });
    await db.repos.nutrition.createLog({
      date: '2026-09-10',
      mealSlot: 'breakfast',
      source: 'manual',
      loggedAt: '2026-09-10T04:00:00.000Z',
      items: [
        {
          name: 'Eggs',
          quantity: 3,
          unit: 'egg',
          kcal: 210,
          proteinG: 18,
          carbsG: 2,
          fatG: 15,
          fiberG: 0,
          confidence: 1,
          savedMealId: null,
        },
      ],
    });

    const state = await readReminderState(db.repos, {
      today: '2026-09-10',
      now: new Date('2026-09-10T10:00:00.000Z'),
    });

    expect(state.remainingProteinG).toBe(132);
    expect(state.minutesSinceLastMealLog).toBe(360);
    expect(state.workoutCompletedToday).toBe(false);
    expect(state.weeklyReviewGenerated).toBe(false);
  });

  it('counts the review of the week that just ended, not the current one', async () => {
    // 10 Sep 2026 is a Thursday; with weeks starting on Monday the week that
    // just ended began on 31 Aug. A review for it means the reminder has
    // nothing left to nag about — waiting for a review of the week still in
    // progress would keep it firing forever.
    await db.repos.reviews.upsert({
      weekStart: '2026-08-31',
      training: {
        workoutsCompleted: 0,
        workoutsPlanned: 0,
        completionRate: 0,
        totalSets: 0,
        totalVolumeKg: 0,
        volumeByMuscleGroup: [],
        personalRecords: [],
        missedSessions: 0,
        averageRpe: null,
        averageDurationMin: null,
      },
      nutrition: {
        daysLogged: 0,
        averageKcal: 0,
        averageProteinG: 0,
        averageCarbsG: 0,
        averageFatG: 0,
        averageFiberG: 0,
        targetHitRate: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
        missedTargets: [],
      },
    });

    const state = await readReminderState(db.repos, {
      today: '2026-09-10',
      now: new Date('2026-09-10T10:00:00.000Z'),
    });

    expect(state.weeklyReviewGenerated).toBe(true);
  });
});
