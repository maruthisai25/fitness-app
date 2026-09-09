import { beforeEach, describe, expect, it } from 'vitest';

import { makeSettings, resetFixtureIds } from './fixtures';
import {
  MEAL_LOG_QUIET_MINUTES,
  PROTEIN_REMAINING_THRESHOLD_G,
  REMINDER_KINDS,
  decideMealLogReminder,
  decideProteinReminder,
  decideReminders,
  decideWeeklyReviewReminder,
  decideWorkoutReminder,
  firingReminders,
  type ReminderState,
} from './reminders';

beforeEach(() => {
  resetFixtureIds();
});

function state(overrides: Partial<ReminderState> = {}): ReminderState {
  return {
    today: '2026-09-10',
    now: '19:30',
    weekday: 4,
    settings: makeSettings(),
    workoutCompletedToday: false,
    plannedWorkoutToday: true,
    minutesSinceLastMealLog: null,
    remainingProteinG: 80,
    weeklyReviewDay: 0,
    weeklyReviewGenerated: false,
    ...overrides,
  };
}

describe('notifications master switch', () => {
  it('silences every reminder when notifications are off', () => {
    const decisions = decideReminders(
      state({ settings: makeSettings({ notificationsEnabled: false }) }),
    );
    expect(decisions).toHaveLength(REMINDER_KINDS.length);
    expect(decisions.every((decision) => !decision.fires)).toBe(true);
    expect(decisions[0].rationale.codes).toEqual(['NOTIFICATIONS_DISABLED']);
  });

  it('returns one decision per reminder kind, in order', () => {
    expect(decideReminders(state()).map((decision) => decision.kind)).toEqual([
      'workout',
      'meal_log',
      'protein',
      'weekly_review',
    ]);
  });
});

describe('workout reminder — DESIGN.md §7.3', () => {
  it('fires once the reminder time has passed and nothing is completed', () => {
    const decision = decideWorkoutReminder(state({ now: '17:30' }));
    expect(decision.fires).toBe(true);
    expect(decision.scheduledFor).toBe('17:30');
    expect(decision.rationale.codes).toContain('WORKOUT_DUE');
  });

  it('is skipped when a workout is already completed today', () => {
    const decision = decideWorkoutReminder(state({ workoutCompletedToday: true }));
    expect(decision.fires).toBe(false);
    expect(decision.rationale.codes).toEqual(['WORKOUT_ALREADY_COMPLETED']);
  });

  it('waits until the reminder time', () => {
    const decision = decideWorkoutReminder(state({ now: '09:00' }));
    expect(decision.fires).toBe(false);
    expect(decision.rationale.codes).toEqual(['NOT_YET_DUE']);
  });

  it('is disabled when no time is configured', () => {
    const decision = decideWorkoutReminder(
      state({
        settings: makeSettings({
          reminderTimes: { workout: null, mealLog: null, protein: null, weeklyReview: null },
        }),
      }),
    );
    expect(decision.fires).toBe(false);
    expect(decision.scheduledFor).toBeNull();
    expect(decision.rationale.codes).toEqual(['REMINDER_DISABLED']);
  });

  it('still fires with nothing planned, and says so', () => {
    const decision = decideWorkoutReminder(state({ plannedWorkoutToday: false }));
    expect(decision.fires).toBe(true);
    expect(decision.rationale.codes).toEqual(['WORKOUT_DUE']);
  });
});

describe('meal-log reminder — DESIGN.md §7.3', () => {
  it('is skipped when a meal was logged in the last three hours', () => {
    const decision = decideMealLogReminder(state({ minutesSinceLastMealLog: 90 }));
    expect(decision.fires).toBe(false);
    expect(decision.rationale.codes).toEqual(['MEAL_LOGGED_RECENTLY']);
  });

  it('fires again exactly at the three-hour boundary', () => {
    expect(
      decideMealLogReminder(state({ minutesSinceLastMealLog: MEAL_LOG_QUIET_MINUTES })).fires,
    ).toBe(true);
    expect(
      decideMealLogReminder(state({ minutesSinceLastMealLog: MEAL_LOG_QUIET_MINUTES - 1 })).fires,
    ).toBe(false);
  });

  it('fires when nothing has been logged today', () => {
    const decision = decideMealLogReminder(state({ minutesSinceLastMealLog: null }));
    expect(decision.fires).toBe(true);
    expect(decision.rationale.summary).toContain('Nothing has been logged today');
  });

  it('waits for its configured time', () => {
    expect(decideMealLogReminder(state({ now: '08:00' })).fires).toBe(false);
  });
});

describe('protein reminder — DESIGN.md §7.3', () => {
  it('fires after 18:00 when more than 40 g is left', () => {
    const decision = decideProteinReminder(state({ now: '18:30', remainingProteinG: 55 }));
    expect(decision.fires).toBe(true);
    expect(decision.rationale.codes).toEqual(['PROTEIN_GAP']);
  });

  it('does not fire before 18:00, even if the user picked an earlier time', () => {
    const decision = decideProteinReminder(
      state({
        now: '16:30',
        remainingProteinG: 90,
        settings: makeSettings({
          reminderTimes: {
            workout: '17:30',
            mealLog: '13:00',
            protein: '16:00',
            weeklyReview: '19:00',
          },
        }),
      }),
    );
    expect(decision.fires).toBe(false);
    expect(decision.scheduledFor).toBe('18:00');
    expect(decision.rationale.codes).toEqual(['NOT_YET_DUE']);
  });

  it('does not fire at or under the 40 g threshold', () => {
    expect(
      decideProteinReminder(state({ remainingProteinG: PROTEIN_REMAINING_THRESHOLD_G })).fires,
    ).toBe(false);
    expect(
      decideProteinReminder(state({ remainingProteinG: PROTEIN_REMAINING_THRESHOLD_G + 1 })).fires,
    ).toBe(true);
  });

  it('does not fire when the user is already over target', () => {
    const decision = decideProteinReminder(state({ remainingProteinG: -20 }));
    expect(decision.fires).toBe(false);
    expect(decision.rationale.codes).toEqual(['PROTEIN_ON_TRACK']);
  });

  it('does not fire when there is no protein target at all', () => {
    const decision = decideProteinReminder(state({ remainingProteinG: null }));
    expect(decision.fires).toBe(false);
    expect(decision.rationale.codes).toEqual(['NO_PROTEIN_TARGET']);
  });
});

describe('weekly review reminder — DESIGN.md §7.3', () => {
  it('fires on the chosen day once the time has passed', () => {
    const decision = decideWeeklyReviewReminder(state({ weekday: 0, weeklyReviewDay: 0 }));
    expect(decision.fires).toBe(true);
    expect(decision.rationale.codes).toEqual(['WEEKLY_REVIEW_DUE']);
    expect(decision.rationale.summary).toContain('Sunday');
  });

  it('stays quiet on every other day', () => {
    const decision = decideWeeklyReviewReminder(state({ weekday: 3, weeklyReviewDay: 0 }));
    expect(decision.fires).toBe(false);
    expect(decision.rationale.codes).toEqual(['WRONG_DAY']);
  });

  it('stays quiet once the review has been generated', () => {
    const decision = decideWeeklyReviewReminder(
      state({ weekday: 0, weeklyReviewDay: 0, weeklyReviewGenerated: true }),
    );
    expect(decision.fires).toBe(false);
    expect(decision.rationale.codes).toEqual(['REVIEW_ALREADY_GENERATED']);
  });

  it('waits for its configured time', () => {
    const decision = decideWeeklyReviewReminder(
      state({ weekday: 0, weeklyReviewDay: 0, now: '08:00' }),
    );
    expect(decision.fires).toBe(false);
    expect(decision.rationale.codes).toEqual(['NOT_YET_DUE']);
  });
});

describe('firingReminders', () => {
  it('returns only what should fire right now', () => {
    const firing = firingReminders(
      state({
        now: '19:30',
        weekday: 0,
        weeklyReviewDay: 0,
        workoutCompletedToday: true,
        minutesSinceLastMealLog: 30,
        remainingProteinG: 60,
      }),
    );
    expect(firing.map((decision) => decision.kind)).toEqual(['protein', 'weekly_review']);
  });
});
