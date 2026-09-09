/**
 * Turning the core reminder rules into scheduled local notifications —
 * DESIGN.md §7.3.
 *
 * `packages/core/reminders` decides *whether* each reminder should fire and
 * why; this module only reads the state it needs out of the repositories, asks
 * for the decisions, and schedules or cancels the matching notification. It
 * never re-implements a rule.
 */
import {
  buildDayNutrition,
  decideReminders,
  startOfWeek,
  weekdayOf,
  type LocalDate,
  type LocalTime,
  type ReminderDecision,
  type ReminderKind,
  type ReminderState,
  type Settings,
  type WeekDay,
} from '@vigor/core';
import type { Notifications } from '@vigor/platform';

import type { AppRepos } from '../db/AppDataProvider';

/** Notification ids are stable per kind, so rescheduling replaces cleanly. */
export function notificationIdFor(kind: ReminderKind): string {
  return `vigor.reminder.${kind}`;
}

const TITLES: Record<ReminderKind, string> = {
  workout: 'Your session is still open',
  meal_log: 'Nothing logged for a while',
  protein: 'Protein is behind',
  weekly_review: 'Your week is ready to read',
};

const BODIES: Record<ReminderKind, string> = {
  workout: 'Open Train when you are ready and the plan is waiting.',
  meal_log: 'A quick line about what you ate keeps the day totals honest.',
  protein: 'There is still a good chunk of protein left for today.',
  weekly_review: 'Open Progress to see what last week actually looked like.',
};

/**
 * Reasons a reminder is quiet that will still be true when today's slot comes
 * round, so today's occurrence is skipped and the next one is scheduled
 * instead. `NOT_YET_DUE` is deliberately absent: that one still fires today.
 */
const SKIP_TODAY_CODES = new Set([
  'WORKOUT_ALREADY_COMPLETED',
  'MEAL_LOGGED_RECENTLY',
  'PROTEIN_ON_TRACK',
  'NO_PROTEIN_TARGET',
  'REVIEW_ALREADY_GENERATED',
]);

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** The device's wall clock as `HH:mm`. */
export function localTimeNow(now: Date = new Date()): LocalTime {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

/**
 * The next moment `time` comes round, as an ISO timestamp.
 *
 * `weekday` restricts it to one day of the week (the weekly review);
 * `skipToday` pushes past today's slot when the rules already said it should
 * stay quiet.
 */
export function nextOccurrence(options: {
  now: Date;
  time: LocalTime;
  skipToday: boolean;
  weekday?: WeekDay;
}): string {
  const [hours, minutes] = options.time.split(':').map(Number);
  const candidate = new Date(options.now);
  candidate.setHours(hours, minutes, 0, 0);

  const stepDays = options.weekday === undefined ? 1 : 7;
  if (options.weekday !== undefined) {
    candidate.setDate(candidate.getDate() + ((options.weekday - candidate.getDay() + 7) % 7));
  }

  // Push forward while the slot has already passed, or while the rules told us
  // to leave today alone. At most two steps, then both conditions are false.
  while (
    candidate.getTime() <= options.now.getTime() ||
    (options.skipToday && sameDay(candidate, options.now))
  ) {
    candidate.setDate(candidate.getDate() + stepDays);
  }
  return candidate.toISOString();
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Everything the §7.3 rules need, read once from the repositories. */
export async function readReminderState(
  repos: AppRepos,
  options: { today: LocalDate; now?: Date },
): Promise<ReminderState> {
  const now = options.now ?? new Date();
  const today = options.today;

  const [settings, workoutsToday, logs, targets, latestReview] = await Promise.all([
    repos.settings.getAll(),
    repos.workouts.getByDate(today),
    repos.nutrition.listLogs({ from: today, to: today }),
    repos.targets.getActive(today),
    repos.reviews.list({ limit: 1 }),
  ]);

  const day = buildDayNutrition({ date: today, logs, targets });
  const weeklyReviewDay: WeekDay = settings.weekStartsOn;
  const currentWeekStart = startOfWeek(today, settings.weekStartsOn);

  const lastLoggedAt = logs.reduce<number | null>((latest, log) => {
    const at = Date.parse(log.loggedAt);
    if (!Number.isFinite(at)) return latest;
    return latest == null || at > latest ? at : latest;
  }, null);

  return {
    today,
    now: localTimeNow(now),
    weekday: weekdayOf(today),
    settings,
    workoutCompletedToday: workoutsToday.some((workout) => workout.status === 'completed'),
    plannedWorkoutToday: workoutsToday.some(
      (workout) => workout.status === 'planned' || workout.status === 'in_progress',
    ),
    minutesSinceLastMealLog:
      lastLoggedAt == null
        ? null
        : Math.max(0, Math.round((now.getTime() - lastLoggedAt) / 60_000)),
    remainingProteinG: targets ? day.remaining.proteinG : null,
    weeklyReviewDay,
    weeklyReviewGenerated: (latestReview[0]?.weekStart ?? '') >= currentWeekStart,
  };
}

export interface ReminderSyncResult {
  decisions: ReminderDecision[];
  /** Kind → the ISO instant it is next set for, or null when nothing is set. */
  scheduled: Record<ReminderKind, string | null>;
}

/**
 * Schedules the next occurrence of every enabled reminder and cancels the rest.
 * Idempotent: the adapter replaces any request with the same id, so running
 * this on every foreground never stacks duplicates.
 */
export async function syncReminders(
  notifications: Notifications,
  state: ReminderState,
  now: Date = new Date(),
): Promise<ReminderSyncResult> {
  const decisions = decideReminders(state);
  const scheduled = {
    workout: null,
    meal_log: null,
    protein: null,
    weekly_review: null,
  } as Record<ReminderKind, string | null>;

  for (const decision of decisions) {
    const id = notificationIdFor(decision.kind);
    if (decision.scheduledFor == null) {
      await notifications.cancel(id);
      continue;
    }

    const skipToday =
      !decision.fires && decision.rationale.codes.some((code) => SKIP_TODAY_CODES.has(code));
    const fireAt = nextOccurrence({
      now,
      time: decision.scheduledFor,
      skipToday,
      weekday: decision.kind === 'weekly_review' ? state.weeklyReviewDay : undefined,
    });

    await notifications.schedule({
      id,
      title: TITLES[decision.kind],
      body: BODIES[decision.kind],
      fireAt,
    });
    scheduled[decision.kind] = fireAt;
  }

  return { decisions, scheduled };
}

/** Cancels every reminder — used when notifications are switched off. */
export async function cancelAllReminders(notifications: Notifications): Promise<void> {
  for (const kind of ['workout', 'meal_log', 'protein', 'weekly_review'] as ReminderKind[]) {
    await notifications.cancel(notificationIdFor(kind));
  }
}

/** The settings shape the reminder screen edits. */
export type ReminderSettings = Pick<
  Settings,
  'notificationsEnabled' | 'reminderTimes' | 'weekStartsOn'
>;
