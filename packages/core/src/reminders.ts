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

import { daysBetween, laterTime, minutesOfDay, timeReached, weekdayName } from './dates';
import { makeRationale } from './rationale';
import type { LocalDate, LocalTime, Rationale, Settings, WeekDay } from './types';

/**
 * The six reminder types of `idea.md` §24 — planned workouts, missed workouts,
 * meal logging, protein targets, weekly reviews and progress measurements.
 */
export type ReminderKind =
  'workout' | 'missed_workout' | 'meal_log' | 'protein' | 'weekly_review' | 'measurement';

export const REMINDER_KINDS: readonly ReminderKind[] = [
  'workout',
  'missed_workout',
  'meal_log',
  'protein',
  'weekly_review',
  'measurement',
];

/** A meal logged inside this window silences the meal-log reminder. */
export const MEAL_LOG_QUIET_MINUTES = 180;
/** The protein reminder only fires once this much is still outstanding. */
export const PROTEIN_REMAINING_THRESHOLD_G = 40;
/** The protein reminder never fires before this time of day. */
export const PROTEIN_EARLIEST_TIME: LocalTime = '18:00';
/**
 * How long a body-metrics row keeps the measurement reminder quiet. Two weeks
 * is long enough that day-to-day water weight is not what the user is reading,
 * and short enough that a trend line still has points on it.
 */
export const MEASUREMENT_QUIET_DAYS = 14;
/**
 * How long after a skipped or abandoned session the follow-up still makes
 * sense. One day: it is the morning after, not a running tally of every
 * session ever missed.
 */
export const MISSED_WORKOUT_FOLLOW_UP_DAYS = 1;

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
  /**
   * The date of the most recent planned session that ended `skipped` or
   * `abandoned`, or null when there is none. The follow-up reminder reads it
   * the morning after — see {@link decideMissedWorkoutReminder}.
   */
  lastMissedWorkoutDate: LocalDate | null;
  /**
   * Whole days since the newest `body_metrics` row, or null when the user has
   * never recorded one.
   */
  daysSinceLastMeasurement: number | null;
  /** Minutes since the most recent `food_logs` row, or null when none today. */
  minutesSinceLastMealLog: number | null;
  /** Signed remaining protein for today, or null when there is no target. */
  remainingProteinG: number | null;
  /**
   * The weekday the user chose for their weekly review — resolve it with
   * {@link resolveWeeklyReviewDay} so the `weekStartsOn` default is applied in
   * one place.
   */
  weeklyReviewDay: WeekDay;
  /**
   * True once the due week's review row exists. Reported as a fact; it does not
   * silence the reminder on its own, because the runner writes that row moments
   * before the reminder is decided — {@link ReminderState.reviewWeekViewed} is
   * what the skip turns on.
   */
  weeklyReviewGenerated: boolean;
  /**
   * True when `settings.lastReviewViewedWeek` already covers the review that is
   * due — the user opened it, so there is nothing left to nudge them towards.
   * Omitted means "not viewed".
   */
  reviewWeekViewed?: boolean;
}

/**
 * Which weekday the weekly review lands on: the user's explicit choice, or the
 * first day of their week when they have not made one (DESIGN.md §7.3).
 */
export function resolveWeeklyReviewDay(settings: Settings): WeekDay {
  return settings.weeklyReviewDay ?? settings.weekStartsOn;
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
    decideMissedWorkoutReminder(state),
    decideMealLogReminder(state),
    decideProteinReminder(state),
    decideWeeklyReviewReminder(state),
    decideMeasurementReminder(state),
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

/**
 * The morning-after follow-up on a session that ended `skipped` or
 * `abandoned` — `idea.md` §24 "missed workouts".
 *
 * The same-day workout reminder goes quiet at midnight; this one picks the
 * thread up the next day and then drops it. It is a follow-up, not a scold: it
 * fires once, only for yesterday, and stays quiet if today's session is already
 * done.
 */
export function decideMissedWorkoutReminder(state: ReminderState): ReminderDecision {
  const at = state.settings.reminderTimes.missedWorkout;
  if (at == null) {
    return disabled(
      'missed_workout',
      'REMINDER_DISABLED',
      'No missed-workout reminder time is set.',
    );
  }

  const daysSince =
    state.lastMissedWorkoutDate == null
      ? null
      : daysBetween(state.lastMissedWorkoutDate, state.today);

  const facts: Record<string, unknown> = {
    at,
    now: state.now,
    lastMissedWorkoutDate: state.lastMissedWorkoutDate,
    daysSinceMissedWorkout: daysSince,
    followUpDays: MISSED_WORKOUT_FOLLOW_UP_DAYS,
    workoutCompletedToday: state.workoutCompletedToday,
  };

  if (daysSince == null) {
    return {
      kind: 'missed_workout',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['NO_MISSED_WORKOUT'],
        facts,
        'No session has been left unfinished, so there is nothing to follow up on.',
      ),
    };
  }

  if (daysSince !== MISSED_WORKOUT_FOLLOW_UP_DAYS) {
    return {
      kind: 'missed_workout',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['MISSED_WORKOUT_NOT_YESTERDAY'],
        facts,
        daysSince < MISSED_WORKOUT_FOLLOW_UP_DAYS
          ? 'The session you left unfinished is today’s, so the workout reminder has it.'
          : `The last unfinished session was ${daysSince} days ago — too long ago to chase.`,
      ),
    };
  }

  if (state.workoutCompletedToday) {
    return {
      kind: 'missed_workout',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['WORKOUT_ALREADY_COMPLETED'],
        facts,
        'You have already trained today, so yesterday is water under the bridge.',
      ),
    };
  }

  if (!timeReached(state.now, at)) {
    return {
      kind: 'missed_workout',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['NOT_YET_DUE'],
        facts,
        `The missed-workout follow-up is set for ${at} and it is ${state.now}.`,
      ),
    };
  }

  return {
    kind: 'missed_workout',
    fires: true,
    scheduledFor: at,
    rationale: makeRationale(
      ['MISSED_WORKOUT_FOLLOW_UP'],
      facts,
      `Yesterday's session (${state.lastMissedWorkoutDate}) was left unfinished.`,
    ),
  };
}

/**
 * The progress-measurement nudge — `idea.md` §24 "progress measurements".
 *
 * Driven by the newest `body_metrics` row: quiet while a measurement is recent,
 * due once {@link MEASUREMENT_QUIET_DAYS} have passed, and due straight away for
 * a user who has never recorded one.
 */
export function decideMeasurementReminder(state: ReminderState): ReminderDecision {
  const at = state.settings.reminderTimes.measurement;
  if (at == null) {
    return disabled('measurement', 'REMINDER_DISABLED', 'No measurement reminder time is set.');
  }

  const facts: Record<string, unknown> = {
    at,
    now: state.now,
    daysSinceLastMeasurement: state.daysSinceLastMeasurement,
    quietDays: MEASUREMENT_QUIET_DAYS,
  };

  if (
    state.daysSinceLastMeasurement != null &&
    state.daysSinceLastMeasurement < MEASUREMENT_QUIET_DAYS
  ) {
    return {
      kind: 'measurement',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['MEASUREMENT_RECENT'],
        facts,
        state.daysSinceLastMeasurement === 0
          ? 'You measured yourself today.'
          : `You measured yourself ${state.daysSinceLastMeasurement} ${
              state.daysSinceLastMeasurement === 1 ? 'day' : 'days'
            } ago.`,
      ),
    };
  }

  if (!timeReached(state.now, at)) {
    return {
      kind: 'measurement',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['NOT_YET_DUE'],
        facts,
        `The measurement reminder is set for ${at} and it is ${state.now}.`,
      ),
    };
  }

  return {
    kind: 'measurement',
    fires: true,
    scheduledFor: at,
    rationale: makeRationale(
      state.daysSinceLastMeasurement == null
        ? ['MEASUREMENT_DUE', 'MEASUREMENT_NEVER_RECORDED']
        : ['MEASUREMENT_DUE'],
      facts,
      state.daysSinceLastMeasurement == null
        ? 'No weight or measurement has ever been recorded, so there is no trend to read yet.'
        : `Your last measurement was ${state.daysSinceLastMeasurement} days ago.`,
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
    reviewWeekViewed: state.reviewWeekViewed === true,
    lastReviewViewedWeek: state.settings.lastReviewViewedWeek,
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

  // The nudge is about *reading* the review, not about the row existing: the
  // foreground runner writes that row moments before this runs, so "already
  // generated" would silence the reminder for ever. `reviewWeekViewed` comes
  // from `settings.lastReviewViewedWeek`, set when the user opens one.
  if (state.reviewWeekViewed === true) {
    return {
      kind: 'weekly_review',
      fires: false,
      scheduledFor: at,
      rationale: makeRationale(
        ['REVIEW_ALREADY_VIEWED'],
        facts,
        'You have already read this week’s review.',
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
