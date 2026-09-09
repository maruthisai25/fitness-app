/**
 * Reminder rules — DESIGN.md §7.3, as pure decisions.
 *
 * "Reminders are local notifications planned by `packages/core/reminders`: a
 * workout reminder is skipped if a workout is already completed today, a
 * meal-log reminder is skipped if a meal was logged in the last 3 hours, a
 * protein reminder fires only if remaining protein > 40 g after 18:00, and the
 * weekly review fires on the user's chosen day."
 *
 * The engine never schedules anything; it answers "given this state, which
 * reminders fire and why". The platform adapter does the scheduling.
 */

import { laterTime, minutesOfDay, timeReached, weekdayName } from './dates';
import { makeRationale } from './rationale';
import type { LocalDate, LocalTime, Rationale, Settings, WeekDay } from './types';

export type ReminderKind = 'workout' | 'meal_log' | 'protein' | 'weekly_review';

export const REMINDER_KINDS: readonly ReminderKind[] = [
  'workout',
  'meal_log',
  'protein',
  'weekly_review',
];

/** A meal logged inside this window silences the meal-log reminder. */
export const MEAL_LOG_QUIET_MINUTES = 180;
/** The protein reminder only fires once this much is still outstanding. */
export const PROTEIN_REMAINING_THRESHOLD_G = 40;
/** The protein reminder never fires before this time of day. */
export const PROTEIN_EARLIEST_TIME: LocalTime = '18:00';

export interface ReminderState {
  /** The user's local calendar day. */
  today: LocalDate;
  /** The user's local wall clock, `HH:mm`. */
  now: LocalTime;
  weekday: WeekDay;
  settings: Settings;
  /** True when any workout dated today reached `completed`. */
  workoutCompletedToday: boolean;
  /** True when a workout is scheduled for today. */
  plannedWorkoutToday: boolean;
  /** Minutes since the most recent `food_logs` row, or null when none today. */
  minutesSinceLastMealLog: number | null;
  /** Signed remaining protein for today, or null when there is no target. */
  remainingProteinG: number | null;
  /** The weekday the user chose for their weekly review. */
  weeklyReviewDay: WeekDay;
  /** True once this week's review row exists. */
  weeklyReviewGenerated: boolean;
}

export interface ReminderDecision {
  kind: ReminderKind;
  fires: boolean;
  /** The local time this reminder is set for, or null when it is disabled. */
  scheduledFor: LocalTime | null;
  rationale: Rationale;
}

function disabled(kind: ReminderKind, code: string, summary: string): ReminderDecision {
  return {
    kind,
    fires: false,
    scheduledFor: null,
    rationale: makeRationale([code], { kind }, summary),
  };
}

/**
 * Decides every reminder for the current moment. Order is stable, so the UI can
 * render the list without sorting.
 */
export function decideReminders(state: ReminderState): ReminderDecision[] {
  const { settings } = state;

  if (!settings.notificationsEnabled) {
    return REMINDER_KINDS.map((kind) =>
      disabled(
        kind,
        'NOTIFICATIONS_DISABLED',
        'Notifications are turned off in settings, so nothing is scheduled.',
      ),
    );
  }

  return [
    decideWorkoutReminder(state),
    decideMealLogReminder(state),
    decideProteinReminder(state),
    decideWeeklyReviewReminder(state),
  ];
}

/** Convenience: just the reminders that should fire right now. */
export function firingReminders(state: ReminderState): ReminderDecision[] {
  return decideReminders(state).filter((decision) => decision.fires);
}

export function decideWorkoutReminder(state: ReminderState): ReminderDecision {
  const at = state.settings.reminderTimes.workout;
  if (at == null) {
    return disabled('workout', 'REMINDER_DISABLED', 'No workout reminder time is set.');
  }

  const facts: Record<string, unknown> = {
    at,
    now: state.now,
    workoutCompletedToday: state.workoutCompletedToday,
    plannedWorkoutToday: state.plannedWorkoutToday,
  };

  if (state.workoutCompletedToday) {
    return {
      kind: 'workout',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['WORKOUT_ALREADY_COMPLETED'],
        facts,
        'You already finished a workout today, so the reminder stays quiet.',
      ),
    };
  }

  if (!timeReached(state.now, at)) {
    return {
      kind: 'workout',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['NOT_YET_DUE'],
        facts,
        `The workout reminder is set for ${at} and it is ${state.now}.`,
      ),
    };
  }

  return {
    kind: 'workout',
    fires: true,
    scheduledFor: at,
    rationale: makeRationale(
      state.plannedWorkoutToday ? ['WORKOUT_DUE', 'WORKOUT_PLANNED'] : ['WORKOUT_DUE'],
      facts,
      state.plannedWorkoutToday
        ? "Today's session is still open."
        : 'Nothing is logged for today yet.',
    ),
  };
}

export function decideMealLogReminder(state: ReminderState): ReminderDecision {
  const at = state.settings.reminderTimes.mealLog;
  if (at == null) {
    return disabled('meal_log', 'REMINDER_DISABLED', 'No meal-log reminder time is set.');
  }

  const facts: Record<string, unknown> = {
    at,
    now: state.now,
    minutesSinceLastMealLog: state.minutesSinceLastMealLog,
    quietMinutes: MEAL_LOG_QUIET_MINUTES,
  };

  if (
    state.minutesSinceLastMealLog != null &&
    state.minutesSinceLastMealLog < MEAL_LOG_QUIET_MINUTES
  ) {
    return {
      kind: 'meal_log',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['MEAL_LOGGED_RECENTLY'],
        facts,
        `You logged a meal ${state.minutesSinceLastMealLog} minutes ago, so this reminder stays quiet.`,
      ),
    };
  }

  if (!timeReached(state.now, at)) {
    return {
      kind: 'meal_log',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['NOT_YET_DUE'],
        facts,
        `The meal-log reminder is set for ${at} and it is ${state.now}.`,
      ),
    };
  }

  return {
    kind: 'meal_log',
    fires: true,
    scheduledFor: at,
    rationale: makeRationale(
      ['MEAL_LOG_DUE'],
      facts,
      state.minutesSinceLastMealLog == null
        ? 'Nothing has been logged today yet.'
        : `Your last meal was logged ${state.minutesSinceLastMealLog} minutes ago.`,
    ),
  };
}

export function decideProteinReminder(state: ReminderState): ReminderDecision {
  const configured = state.settings.reminderTimes.protein;
  if (configured == null) {
    return disabled('protein', 'REMINDER_DISABLED', 'No protein reminder time is set.');
  }

  // DESIGN.md §7.3: never before 18:00, whatever the user picked.
  const at = laterTime(configured, PROTEIN_EARLIEST_TIME);
  const facts: Record<string, unknown> = {
    configuredAt: configured,
    at,
    now: state.now,
    remainingProteinG: state.remainingProteinG,
    threshold: PROTEIN_REMAINING_THRESHOLD_G,
    earliest: PROTEIN_EARLIEST_TIME,
  };

  if (state.remainingProteinG == null) {
    return {
      kind: 'protein',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['NO_PROTEIN_TARGET'],
        facts,
        'There is no protein target set, so there is nothing to chase.',
      ),
    };
  }

  if (minutesOfDay(state.now) < minutesOfDay(at)) {
    return {
      kind: 'protein',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['NOT_YET_DUE'],
        facts,
        `The protein reminder waits until ${at}; it is ${state.now}.`,
      ),
    };
  }

  if (state.remainingProteinG <= PROTEIN_REMAINING_THRESHOLD_G) {
    return {
      kind: 'protein',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['PROTEIN_ON_TRACK'],
        facts,
        `Only ${Math.max(0, Math.round(state.remainingProteinG))} g of protein is left, which is inside the ${
          PROTEIN_REMAINING_THRESHOLD_G
        } g threshold.`,
      ),
    };
  }

  return {
    kind: 'protein',
    fires: true,
    scheduledFor: at,
    rationale: makeRationale(
      ['PROTEIN_GAP'],
      facts,
      `${Math.round(state.remainingProteinG)} g of protein is still outstanding after ${at}.`,
    ),
  };
}

export function decideWeeklyReviewReminder(state: ReminderState): ReminderDecision {
  const at = state.settings.reminderTimes.weeklyReview;
  if (at == null) {
    return disabled('weekly_review', 'REMINDER_DISABLED', 'No weekly review reminder time is set.');
  }

  const facts: Record<string, unknown> = {
    at,
    now: state.now,
    weekday: state.weekday,
    weeklyReviewDay: state.weeklyReviewDay,
    weeklyReviewGenerated: state.weeklyReviewGenerated,
  };

  if (state.weekday !== state.weeklyReviewDay) {
    return {
      kind: 'weekly_review',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['WRONG_DAY'],
        facts,
        `Your weekly review lands on ${weekdayName(state.weeklyReviewDay)}s.`,
      ),
    };
  }

  if (state.weeklyReviewGenerated) {
    return {
      kind: 'weekly_review',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['REVIEW_ALREADY_GENERATED'],
        facts,
        'This week’s review has already been generated.',
      ),
    };
  }

  if (!timeReached(state.now, at)) {
    return {
      kind: 'weekly_review',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['NOT_YET_DUE'],
        facts,
        `The weekly review reminder is set for ${at} and it is ${state.now}.`,
      ),
    };
  }

  return {
    kind: 'weekly_review',
    fires: true,
    scheduledFor: at,
    rationale: makeRationale(
      ['WEEKLY_REVIEW_DUE'],
      facts,
      `It is ${weekdayName(state.weeklyReviewDay)} and this week's review is ready to build.`,
    ),
  };
}
