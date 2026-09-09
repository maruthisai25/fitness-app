/**
 * The work that happens when the app comes to the foreground.
 *
 *  - insight detectors, "on app open, at most once per day" (DESIGN.md §5.8);
 *  - the weekly review, built and stored deterministically the moment a week
 *    boundary has passed, with the prose left to an `ai_job` (DESIGN.md §5.9);
 *  - reminders, decided by `packages/core/reminders` and handed to the
 *    Notifications adapter (DESIGN.md §7.3, §7.4).
 *
 * The engines make every decision here. This module only fetches rows, calls
 * them, and writes the result back.
 */

import {
  addDays,
  buildDayNutrition,
  buildWeeklyReview,
  decideReminders,
  runInsightDetectors,
  startOfWeek,
  type Exercise,
  type Id,
  type InsightDraft,
  type InsightExerciseHistory,
  type InsightNutritionDay,
  type LocalDate,
  type LocalTime,
  type ReminderDecision,
  type Settings,
  type WeekDay,
} from '@vigor/core';
import type { Repositories } from '@vigor/db';
import { useEffect } from 'react';

import { useDb } from '../db/provider';
import { webClock } from '../platform/clock';
import { webNotifications } from '../platform/notifications';

/** The rolling window the detectors and the review look back over. */
export const DETECTOR_WINDOW_DAYS = 28;

/**
 * Per-browser marker for "the detectors already ran today". It is a device-local
 * convenience, not app data: the `settings` table only accepts the DESIGN.md
 * §4.1 keys, and this must never travel in an export bundle.
 */
const INSIGHT_RUN_KEY = 'vigor.insights.lastRunDate';

function readMarker(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeMarker(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A browser with storage blocked just re-runs the detectors; the dedupe
    // below still stops duplicate rows.
  }
}

/** `HH:mm` in the user's local wall clock. */
export function localTimeNow(at: Date = new Date()): LocalTime {
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** The ISO instant of `time` on `date`, in the browser's own timezone. */
export function isoAtLocalTime(date: LocalDate, time: LocalTime): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

// ---------------------------------------------------------------------------
// Detector inputs
// ---------------------------------------------------------------------------

async function loadDetectorInput(
  repos: Repositories,
  today: LocalDate,
): Promise<{
  today: LocalDate;
  period: { from: LocalDate; to: LocalDate };
  workouts: Awaited<ReturnType<Repositories['workouts']['getRecent']>>;
  exercises: Exercise[];
  exerciseHistories: InsightExerciseHistory[];
  nutritionDays: InsightNutritionDay[];
}> {
  const from = addDays(today, -(DETECTOR_WINDOW_DAYS - 1));
  const workouts = await repos.workouts.getRecent({ days: DETECTOR_WINDOW_DAYS, today });

  const exerciseIds = new Set<Id>();
  for (const workout of workouts) {
    for (const slot of workout.exercises) exerciseIds.add(slot.exerciseId);
  }
  const exercises = await repos.exercises.getMany([...exerciseIds]);

  const exerciseHistories: InsightExerciseHistory[] = [];
  for (const exercise of exercises) {
    exerciseHistories.push({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      sessions: await repos.workouts.getExerciseHistory(exercise.id, { limit: 20 }),
    });
  }

  const logs = await repos.nutrition.listLogs({ from, to: today });
  const byDate = new Map<LocalDate, typeof logs>();
  for (const log of logs) {
    byDate.set(log.date, [...(byDate.get(log.date) ?? []), log]);
  }
  const nutritionDays: InsightNutritionDay[] = [];
  for (const [date, dayLogs] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const targets = await repos.targets.getActive(date);
    const day = buildDayNutrition({ date, logs: dayLogs, targets });
    nutritionDays.push({
      date,
      consumed: day.consumed,
      targets: day.targets,
      items: dayLogs.flatMap((log) => log.items.map((item) => ({ id: item.id, name: item.name }))),
    });
  }

  return { today, period: { from, to: today }, workouts, exercises, exerciseHistories, nutritionDays };
}

/** Detector + period, the identity DESIGN.md §5.8 dedupes on. */
function insightKey(draft: { detector: string; period: { from: string; to: string } }): string {
  return `${draft.detector}|${draft.period.from}|${draft.period.to}`;
}

/**
 * Runs every detector and writes only the rows that are genuinely new.
 * Returns the drafts that were written.
 */
export async function runDetectorsOnce(
  repos: Repositories,
  today: LocalDate,
  options: { force?: boolean } = {},
): Promise<InsightDraft[]> {
  if (!options.force && readMarker(INSIGHT_RUN_KEY) === today) return [];

  const input = await loadDetectorInput(repos, today);
  const { insights } = runInsightDetectors(input);

  const existing = await repos.insights.list({ includeDismissed: true });
  const seen = new Set(existing.map(insightKey));
  const fresh = insights.filter((draft) => {
    const key = insightKey(draft);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (fresh.length > 0) await repos.insights.createMany(fresh);
  writeMarker(INSIGHT_RUN_KEY, today);
  return fresh;
}

// ---------------------------------------------------------------------------
// Weekly review — DESIGN.md §5.9
// ---------------------------------------------------------------------------

/**
 * The last completed week, i.e. the week before the one `today` sits in. Null
 * when the very first week is still running.
 */
export function lastCompletedWeekStart(today: LocalDate, weekStartsOn: WeekDay): LocalDate {
  return addDays(startOfWeek(today, weekStartsOn), -7);
}

/**
 * Builds and stores the review for the last completed week if a boundary has
 * passed since the newest stored one, and queues the coach summary as an
 * `ai_job` (DESIGN.md §5.9). Returns the week it wrote, or null.
 */
export async function runWeeklyReviewIfDue(
  repos: Repositories,
  today: LocalDate,
  weekStartsOn: WeekDay,
): Promise<LocalDate | null> {
  const weekStart = lastCompletedWeekStart(today, weekStartsOn);
  const existing = await repos.reviews.getByWeek(weekStart);
  if (existing != null) return null;

  const weekEnd = addDays(weekStart, 6);
  const workouts = await repos.workouts.getRecent({ days: 14, today });
  const exerciseIds = new Set<Id>();
  for (const workout of workouts) {
    for (const slot of workout.exercises) exerciseIds.add(slot.exerciseId);
  }
  const exercises = await repos.exercises.getMany([...exerciseIds]);
  const personalRecords = await repos.records.listRange({ from: weekStart, to: weekEnd });

  const logs = await repos.nutrition.listLogs({ from: weekStart, to: weekEnd });
  const byDate = new Map<LocalDate, typeof logs>();
  for (const log of logs) byDate.set(log.date, [...(byDate.get(log.date) ?? []), log]);
  const nutritionDays: InsightNutritionDay[] = [];
  for (const [date, dayLogs] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const day = buildDayNutrition({
      date,
      logs: dayLogs,
      targets: await repos.targets.getActive(date),
    });
    nutritionDays.push({ date, consumed: day.consumed, targets: day.targets });
  }

  const openInsights = await repos.insights.listOpen();

  const stats = buildWeeklyReview({
    weekOf: weekStart,
    weekStartsOn,
    workouts,
    exercises,
    personalRecords,
    nutritionDays,
    insights: openInsights.map(({ id: _id, createdAt: _createdAt, ...draft }) => draft),
  });

  const review = await repos.reviews.upsert({
    weekStart: stats.weekStart,
    training: stats.training,
    nutrition: stats.nutrition,
  });

  // Idempotent by id (DESIGN.md §8): re-running never queues a second summary.
  await repos.aiJobs.enqueue({
    id: `weekly-review-${stats.weekStart}`,
    kind: 'weekly_review',
    payload: {
      weekStart: stats.weekStart,
      reviewId: review.id,
      training: stats.training,
      nutrition: stats.nutrition,
      topInsights: stats.topInsights,
    },
    resultRef: review.id,
  });

  return stats.weekStart;
}

// ---------------------------------------------------------------------------
// Reminders — DESIGN.md §7.3, delivered by the §7.4 tab-only adapter
// ---------------------------------------------------------------------------

const REMINDER_TITLE: Record<ReminderDecision['kind'], string> = {
  workout: 'Your session is still open',
  meal_log: 'Nothing logged for a while',
  protein: 'Protein is still short today',
  weekly_review: 'Your week is ready to review',
};

export function notificationIdFor(kind: ReminderDecision['kind']): string {
  return `vigor.reminder.${kind}`;
}

export interface ReminderRunResult {
  decisions: ReminderDecision[];
  scheduled: string[];
  cancelled: string[];
}

/**
 * Asks the engine which reminders stand, schedules those, and cancels every id
 * that no longer belongs — so a reminder that has become irrelevant (a workout
 * finished, a meal logged) does not fire later from a stale timer.
 */
export async function syncReminders(
  repos: Repositories,
  settings: Settings,
  today: LocalDate,
  now: LocalTime,
): Promise<ReminderRunResult> {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() as WeekDay;

  const workoutsToday = await repos.workouts.getByDate(today);
  const logs = await repos.nutrition.listLogs({ from: today, to: today });
  const targets = await repos.targets.getActive(today);
  const day = buildDayNutrition({ date: today, logs, targets });

  const lastLoggedAt = logs
    .map((log) => Date.parse(log.loggedAt))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];
  const minutesSinceLastMealLog =
    lastLoggedAt == null ? null : Math.max(0, Math.round((Date.now() - lastLoggedAt) / 60_000));

  const weeklyReviewDay = settings.weekStartsOn;
  const weeklyReviewGenerated =
    (await repos.reviews.getByWeek(lastCompletedWeekStart(today, settings.weekStartsOn))) != null;

  const decisions = decideReminders({
    today,
    now,
    weekday,
    settings,
    workoutCompletedToday: workoutsToday.some((workout) => workout.status === 'completed'),
    plannedWorkoutToday: workoutsToday.some(
      (workout) => workout.status === 'planned' || workout.status === 'in_progress',
    ),
    minutesSinceLastMealLog,
    remainingProteinG: targets ? day.remaining.proteinG : null,
    weeklyReviewDay,
    weeklyReviewGenerated,
  });

  const scheduled: string[] = [];
  const cancelled: string[] = [];

  for (const decision of decisions) {
    const id = notificationIdFor(decision.kind);
    if (decision.fires) {
      await webNotifications.schedule({
        id,
        title: REMINDER_TITLE[decision.kind],
        body: decision.rationale.summary,
        fireAt: new Date().toISOString(),
      });
      scheduled.push(id);
    } else if (decision.scheduledFor != null && decision.rationale.codes.includes('NOT_YET_DUE')) {
      await webNotifications.schedule({
        id,
        title: REMINDER_TITLE[decision.kind],
        body: decision.rationale.summary,
        fireAt: isoAtLocalTime(today, decision.scheduledFor),
      });
      scheduled.push(id);
    } else {
      await webNotifications.cancel(id);
      cancelled.push(id);
    }
  }

  return { decisions, scheduled, cancelled };
}

// ---------------------------------------------------------------------------
// The hook the Eat and Progress sections mount
// ---------------------------------------------------------------------------

/**
 * Runs the three foreground jobs once per mount and again whenever the tab
 * becomes visible. Failures are swallowed on purpose: a detector that cannot
 * run must never stop a screen from rendering.
 */
export function useForegroundTasks(): void {
  const { repos, settings } = useDb();

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      const today = webClock.today();
      try {
        await runDetectorsOnce(repos, today);
      } catch {
        // Insights are a nicety; the tab still works without them.
      }
      if (cancelled) return;
      try {
        await runWeeklyReviewIfDue(repos, today, settings.weekStartsOn);
      } catch {
        // The review is rebuilt on the next foreground.
      }
      if (cancelled) return;
      if (settings.notificationsEnabled) {
        try {
          await syncReminders(repos, settings, today, localTimeNow());
        } catch {
          // Notification permission can be revoked at any moment.
        }
      } else {
        await webNotifications.cancelAll();
      }
    };

    void run();

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [repos, settings]);
}
