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
  MEAL_LOG_QUIET_MINUTES,
  REMINDER_KINDS,
  addDays,
  buildDayNutrition,
  daysBetween,
  decideReminders,
  minutesOfDay,
  resolveWeeklyReviewDay,
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
  missed_workout: 'Yesterday got away from you',
  meal_log: 'Nothing logged for a while',
  protein: 'Protein is behind',
  weekly_review: 'Your week is ready to read',
  measurement: 'Time to measure again',
};

const BODIES: Record<ReminderKind, string> = {
  workout: 'Open Train when you are ready and the plan is waiting.',
  missed_workout: 'One missed session is nothing. Want to pick it back up today?',
  meal_log: 'A quick line about what you ate keeps the day totals honest.',
  protein: 'There is still a good chunk of protein left for today.',
  weekly_review: 'Open Progress to see what last week actually looked like.',
  measurement: 'A weight and a tape measure in Progress keeps the trend lines honest.',
};

/**
 * Quiet reasons that cannot stop being true before today's slot arrives.
 *
 * A local notification is scheduled once and fires whether or not the rule
 * still holds, so a skip decided at sync time is only safe when the condition
 * provably still holds at the slot:
 *
 *  - `WORKOUT_ALREADY_COMPLETED` — a finished session cannot un-finish today.
 *  - `PROTEIN_ON_TRACK` — remaining protein only falls as the day goes on, so
 *    a gap already inside the threshold stays inside it.
 *  - `NO_PROTEIN_TARGET` — nothing to chase; a target created later today is
 *    picked up by the next sync, which reschedules. Scheduling anyway would
 *    deliver "protein is behind" against a target that does not exist.
 *  - `REVIEW_ALREADY_VIEWED` — a week the user has read stays read.
 *  - `MEASUREMENT_RECENT` — a measurement inside the quiet window only gets
 *    more recent as the day goes on, never less.
 *  - `NO_MISSED_WORKOUT` / `MISSED_WORKOUT_NOT_YESTERDAY` — which day
 *    yesterday was does not change between now and this evening.
 *
 * `MEAL_LOGGED_RECENTLY` is deliberately absent: it expires with the clock, so
 * it is checked against the slot time in {@link skipsTodaysSlot}. `NOT_YET_DUE`
 * is absent too — that one still fires today.
 */
const STABLE_SKIP_CODES = new Set([
  'WORKOUT_ALREADY_COMPLETED',
  'PROTEIN_ON_TRACK',
  'NO_PROTEIN_TARGET',
  'REVIEW_ALREADY_VIEWED',
  'MEASUREMENT_RECENT',
  'NO_MISSED_WORKOUT',
  'MISSED_WORKOUT_NOT_YESTERDAY',
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

/**
 * Whether today's slot should be skipped for a reminder the rules silenced.
 *
 * The rule was evaluated now; the notification fires at the slot. Today is only
 * given up when the reason will still hold then — otherwise the notification is
 * scheduled and the next sync cancels it if the rule has since gone quiet.
 */
export function skipsTodaysSlot(
  decision: ReminderDecision,
  state: ReminderState,
  now: Date,
): boolean {
  if (decision.fires || decision.scheduledFor == null) return false;
  const { codes } = decision.rationale;
  if (codes.some((code) => STABLE_SKIP_CODES.has(code))) return true;

  if (codes.includes('MEAL_LOGGED_RECENTLY')) {
    const sinceLastLog = state.minutesSinceLastMealLog;
    if (sinceLastLog == null) return false;
    const minutesToSlot = minutesOfDay(decision.scheduledFor) - minutesOfDay(localTimeNow(now));
    // Today's slot has already gone; `nextOccurrence` rolls it forward anyway.
    if (minutesToSlot <= 0) return false;
    return sinceLastLog + minutesToSlot < MEAL_LOG_QUIET_MINUTES;
  }

  return false;
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

  const yesterday = addDays(today, -1);
  const [settings, workoutsToday, workoutsYesterday, logs, targets, latestReview, latestMetric] =
    await Promise.all([
      repos.settings.getAll(),
      repos.workouts.getByDate(today),
      repos.workouts.getByDate(yesterday),
      repos.nutrition.listLogs({ from: today, to: today }),
      repos.targets.getActive(today),
      repos.reviews.list({ limit: 1 }),
      repos.body.latestMetric(),
    ]);

  const day = buildDayNutrition({ date: today, logs, targets });
  // The user's chosen day, defaulting to the first day of their week.
  const weeklyReviewDay: WeekDay = resolveWeeklyReviewDay(settings);
  // The review that is due is for the week that just *ended* (DESIGN.md §5.9),
  // which is the week starting seven days back — the current week has not
  // happened yet, so a row for it would never exist and the reminder would
  // nag forever.
  const dueWeekStart = startOfWeek(addDays(today, -7), settings.weekStartsOn);

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
    // A session that ended `skipped` or `abandoned` yesterday is what the
    // morning-after follow-up is for (idea.md §24 "missed workouts").
    lastMissedWorkoutDate: workoutsYesterday.some(
      (workout) => workout.status === 'skipped' || workout.status === 'abandoned',
    )
      ? yesterday
      : null,
    daysSinceLastMeasurement:
      latestMetric == null ? null : Math.max(0, daysBetween(latestMetric.date, today)),
    minutesSinceLastMealLog:
      lastLoggedAt == null
        ? null
        : Math.max(0, Math.round((now.getTime() - lastLoggedAt) / 60_000)),
    remainingProteinG: targets ? day.remaining.proteinG : null,
    weeklyReviewDay,
    weeklyReviewGenerated: (latestReview[0]?.weekStart ?? '') >= dueWeekStart,
    // Set when the user opens a review (`ReviewsScreen`): once they have read
    // the week that is due, the nudge has nothing left to say.
    reviewWeekViewed: (settings.lastReviewViewedWeek ?? '') >= dueWeekStart,
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
  // Built from the engine's own list, so a new reminder kind can never be
  // decided here and then quietly dropped on the way to the adapter.
  const scheduled = Object.fromEntries(REMINDER_KINDS.map((kind) => [kind, null])) as Record<
    ReminderKind,
    string | null
  >;

  for (const decision of decisions) {
    const id = notificationIdFor(decision.kind);
    if (decision.scheduledFor == null) {
      await notifications.cancel(id);
      continue;
    }

    const skipToday = skipsTodaysSlot(decision, state, now);
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
  for (const kind of REMINDER_KINDS) {
    await notifications.cancel(notificationIdFor(kind));
  }
}

/** The settings shape the reminder screen edits. */
export type ReminderSettings = Pick<
  Settings,
  'notificationsEnabled' | 'reminderTimes' | 'weekStartsOn' | 'weeklyReviewDay'
>;
