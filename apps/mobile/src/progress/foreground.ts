/**
 * The work Progress does on its own when the app comes to the front: run the
 * insight detectors (DESIGN.md §5.8, "on app open, at most once per day"),
 * close off the week that just ended (DESIGN.md §5.9), and reschedule the
 * reminders (DESIGN.md §7.3).
 *
 * Everything deterministic lives in `@vigor/core`; this module only gathers
 * inputs, reconciles the output against what is already stored, and writes.
 * The coach is never on the critical path — the weekly summary is queued as an
 * `ai_job` and arrives later (DESIGN.md §8).
 *
 * Two invariants hold this together:
 *
 *  - **One runner.** `runForegroundWork` is guarded by a module-level in-flight
 *    promise, and the app mounts it once above the tabs. Three Progress screens
 *    mounting at once, an `AppState` change and a food log landing together all
 *    join the same pass instead of racing each other's read-then-write.
 *  - **One row per insight identity.** See `insightIdentity.ts`: a rerun updates
 *    the open row in place, stays silent while a dismissal is still recent, and
 *    only inserts when neither exists.
 */
import {
  addDays,
  buildWeeklyReview,
  runInsightDetectors,
  startOfWeek,
  daysBetween,
  type Exercise,
  type Insight,
  type InsightDraft,
  type InsightExerciseHistory,
  type InsightNutritionDay,
  type IsoTimestamp,
  type LocalDate,
  type WeekDay,
  type WorkoutWithExercises,
} from '@vigor/core';
import type { Clock, Notifications } from '@vigor/platform';

import type { AppRepos } from '../db/AppDataProvider';
import {
  dismissedOn,
  evidenceWithSubject,
  insightIdentity,
  markDismissedOn,
  withSubjectMarker,
  type SubjectContext,
} from './insightIdentity';
import {
  cancelAllReminders,
  readReminderState,
  syncReminders,
  type ReminderSyncResult,
} from './reminders';

/** The detectors look four weeks back (DESIGN.md §5.8). */
export const INSIGHT_WINDOW_DAYS = 28;

/** How many past sessions of each exercise the trend detector gets. */
export const EXERCISE_HISTORY_LIMIT = 24;

/**
 * Remembers, for this app session, which local calendar day the detectors last
 * ran on — the Clock adapter's `today()`, never a slice of a UTC timestamp,
 * which is a different day for most of the world for part of every day.
 *
 * The marker is device-local and in-memory for now: the `settings` key list is
 * fixed in `packages/core` for this phase, so `insightsLastRunOn` cannot be
 * persisted yet. A cold start therefore repeats the run, which is harmless —
 * the identity reconciliation below makes a repeat write-free.
 */
let lastDetectorRun: LocalDate | null = null;

/** Joined by every overlapping caller so a run never races itself. */
let detectorRunInFlight: Promise<InsightRunOutcome> | null = null;
let foregroundRunInFlight: Promise<ForegroundRunResult> | null = null;

/** Test seam: forgets the once-a-day guard and any in-flight run. */
export function resetDetectorGuard(): void {
  lastDetectorRun = null;
  detectorRunInFlight = null;
  foregroundRunInFlight = null;
}

export interface InsightRunOutcome {
  ran: boolean;
  created: number;
  /** Open rows refreshed in place with today's period, detail and evidence. */
  updated: number;
  /** Drafts held back because the user dismissed that insight recently. */
  suppressed: number;
  /** Drafts that did not become a new row — updated plus suppressed. */
  duplicates: number;
  reason: string;
}

function buildSubjectContext(
  workouts: readonly WorkoutWithExercises[],
  histories: readonly InsightExerciseHistory[],
): SubjectContext {
  const exerciseIdByWorkoutExercise = new Map<string, string>();
  const workoutFacets = new Map<string, { date: LocalDate; plannedDurationMin: number }>();

  for (const workout of workouts) {
    workoutFacets.set(workout.id, {
      date: workout.date,
      plannedDurationMin: workout.plannedDurationMin,
    });
    for (const slot of workout.exercises) {
      exerciseIdByWorkoutExercise.set(slot.id, slot.exerciseId);
    }
  }
  // Histories reach further back than the 28-day window the workouts cover.
  for (const history of histories) {
    for (const session of history.sessions) {
      exerciseIdByWorkoutExercise.set(session.workoutExerciseId, history.exerciseId);
    }
  }

  return { exerciseIdByWorkoutExercise, workoutFacets };
}

/**
 * True while a dismissal should still keep an insight quiet.
 *
 * Rows dismissed before dismissal days were stamped carry no marker; those stay
 * quiet rather than reappearing, which is the behaviour the user asked for when
 * they dismissed them.
 */
function dismissalStillHolds(row: Insight, today: LocalDate): boolean {
  const dismissedDay = dismissedOn(row);
  if (dismissedDay == null) return true;
  return daysBetween(dismissedDay, today) <= INSIGHT_WINDOW_DAYS;
}

/**
 * Runs every detector once per local calendar day and reconciles the output.
 *
 * Overlapping callers share one execution: the first call owns the pass and
 * every other awaits the same promise, so the read of the stored rows and the
 * writes derived from it can never interleave with a second run's.
 */
export function runDailyInsights(repos: AppRepos, today: LocalDate): Promise<InsightRunOutcome> {
  if (detectorRunInFlight) return detectorRunInFlight;
  const guarded = executeDailyInsights(repos, today).finally(() => {
    if (detectorRunInFlight === guarded) detectorRunInFlight = null;
  });
  detectorRunInFlight = guarded;
  return guarded;
}

async function executeDailyInsights(repos: AppRepos, today: LocalDate): Promise<InsightRunOutcome> {
  if (lastDetectorRun === today) {
    return {
      ran: false,
      created: 0,
      updated: 0,
      suppressed: 0,
      duplicates: 0,
      reason: 'Already run today.',
    };
  }

  const from = addDays(today, -(INSIGHT_WINDOW_DAYS - 1));
  const [workouts, exercises, nutritionDays] = await Promise.all([
    repos.workouts.getRecent({ days: INSIGHT_WINDOW_DAYS, today }),
    repos.exercises.list(),
    repos.nutrition.getDays({ from, to: today }),
  ]);

  const exercisesById = new Map<string, Exercise>(
    exercises.map((exercise) => [exercise.id, exercise]),
  );
  const trainedIds = new Set(
    workouts.flatMap((workout) => workout.exercises.map((slot) => slot.exerciseId)),
  );

  const exerciseHistories: InsightExerciseHistory[] = [];
  for (const exerciseId of trainedIds) {
    const sessions = await repos.workouts.getExerciseHistory(exerciseId, {
      limit: EXERCISE_HISTORY_LIMIT,
    });
    exerciseHistories.push({
      exerciseId,
      exerciseName: exercisesById.get(exerciseId)?.name ?? 'Unknown exercise',
      sessions,
    });
  }

  const insightNutritionDays: InsightNutritionDay[] = nutritionDays.map((day) => ({
    date: day.date,
    consumed: day.consumed,
    targets: day.targets,
    items: day.logs.flatMap((log) => log.items.map((item) => ({ id: item.id, name: item.name }))),
  }));

  const result = runInsightDetectors({
    today,
    period: { from, to: today },
    workouts,
    exercises,
    exerciseHistories,
    nutritionDays: insightNutritionDays,
  });

  const context = buildSubjectContext(workouts, exerciseHistories);
  const existing = await repos.insights.list({ includeDismissed: true });

  // `list` returns newest first, so the first row seen for an identity is the
  // one that matters.
  const openRows = new Map<string, Insight>();
  const dismissedRows = new Map<string, Insight>();
  for (const row of existing) {
    const identity = insightIdentity(row, context);
    const bucket = row.dismissed ? dismissedRows : openRows;
    if (!bucket.has(identity)) bucket.set(identity, row);
  }

  const inserts: InsightDraft[] = [];
  const handled = new Set<string>();
  let updated = 0;
  let suppressed = 0;

  for (const draft of result.insights) {
    const identity = insightIdentity(draft, context);
    if (handled.has(identity)) continue;
    handled.add(identity);

    const open = openRows.get(identity);
    if (open) {
      await repos.insights.update(open.id, {
        period: draft.period,
        detail: draft.detail,
        evidence: evidenceWithSubject(draft, context),
      });
      updated += 1;
      continue;
    }

    const dismissed = dismissedRows.get(identity);
    if (dismissed && dismissalStillHolds(dismissed, today)) {
      suppressed += 1;
      continue;
    }

    inserts.push(withSubjectMarker(draft, context));
  }

  if (inserts.length > 0) await repos.insights.createMany(inserts);

  lastDetectorRun = today;
  return {
    ran: true,
    created: inserts.length,
    updated,
    suppressed,
    duplicates: updated + suppressed,
    reason: result.rationale.summary,
  };
}

/**
 * Dismisses an insight and stamps the local day it happened on, so a later
 * detector run knows how long the row has been dismissed for.
 */
export async function dismissInsight(
  repos: AppRepos,
  insight: Insight,
  today: LocalDate,
): Promise<Insight> {
  // `insights.dismiss` would drop the day; this keeps the audit in evidence.
  return repos.insights.update(insight.id, {
    dismissed: true,
    evidence: markDismissedOn(insight, today),
  });
}

export interface WeeklyReviewOutcome {
  /** The week that was built, or null when nothing was due. */
  weekStart: LocalDate | null;
  /** True when an `ai_jobs` row was queued for the coach summary. */
  queuedSummary: boolean;
  reason: string;
}

/** The `ai_jobs` id for a week's summary — idempotent by design (DESIGN.md §8). */
export function weeklyReviewJobId(weekStart: LocalDate): string {
  return `weekly_review:${weekStart}`;
}

/**
 * Builds and stores the review for the week that just ended, if a week
 * boundary has passed since the last one, and queues the coach summary.
 */
export async function ensureWeeklyReview(
  repos: AppRepos,
  today: LocalDate,
  weekStartsOn: WeekDay,
): Promise<WeeklyReviewOutcome> {
  const dueWeekStart = startOfWeek(addDays(today, -7), weekStartsOn);
  const existing = await repos.reviews.getByWeek(dueWeekStart);
  if (existing) {
    return {
      weekStart: null,
      queuedSummary: false,
      reason: `The week of ${dueWeekStart} is already reviewed.`,
    };
  }

  const weekEnd = addDays(dueWeekStart, 6);
  const [workouts, exercises, personalRecords, nutritionDays, insights] = await Promise.all([
    repos.workouts.getRecent({ days: 14, today }),
    repos.exercises.list(),
    repos.records.listRange({ from: dueWeekStart, to: weekEnd }),
    repos.nutrition.getDays({ from: dueWeekStart, to: weekEnd }),
    repos.insights.list({ includeDismissed: false }),
  ]);

  const stats = buildWeeklyReview({
    weekOf: dueWeekStart,
    weekStartsOn,
    workouts,
    exercises,
    personalRecords,
    nutritionDays: nutritionDays.map((day) => ({
      date: day.date,
      consumed: day.consumed,
      targets: day.targets,
    })),
    insights: insights.map((insight) => ({
      detector: insight.detector,
      period: insight.period,
      headline: insight.headline,
      detail: insight.detail,
      evidence: insight.evidence,
      severity: insight.severity,
      dismissed: insight.dismissed,
    })),
  });

  const review = await repos.reviews.upsert({
    weekStart: stats.weekStart,
    training: stats.training,
    nutrition: stats.nutrition,
  });

  await repos.aiJobs.enqueue({
    id: weeklyReviewJobId(stats.weekStart),
    kind: 'weekly_review',
    payload: {
      weeklyReviewId: review.id,
      weekStart: stats.weekStart,
      training: stats.training,
      nutrition: stats.nutrition,
      topInsights: stats.topInsights,
    },
    resultRef: review.id,
  });

  return {
    weekStart: stats.weekStart,
    queuedSummary: true,
    reason: stats.rationale.summary,
  };
}

export interface ForegroundDeps {
  repos: AppRepos;
  clock: Clock;
  notifications: Notifications;
}

export interface ForegroundRunResult {
  ranAt: IsoTimestamp;
  insights: InsightRunOutcome;
  review: WeeklyReviewOutcome;
  /** Null when notifications are off — everything scheduled is cancelled then. */
  reminders: ReminderSyncResult | null;
}

/**
 * The whole foreground pass. Mounted once at app level (see
 * `ProgressForegroundProvider`) and called again by the food-log and workout
 * mutations once their write lands, so the reminder rules never work from a
 * state the user has already moved past.
 *
 * Overlapping callers share the in-flight pass rather than starting a second.
 */
export function runForegroundWork(deps: ForegroundDeps): Promise<ForegroundRunResult> {
  if (foregroundRunInFlight) return foregroundRunInFlight;
  const guarded = executeForegroundWork(deps).finally(() => {
    if (foregroundRunInFlight === guarded) foregroundRunInFlight = null;
  });
  foregroundRunInFlight = guarded;
  return guarded;
}

async function executeForegroundWork(deps: ForegroundDeps): Promise<ForegroundRunResult> {
  const { repos, clock, notifications } = deps;
  const today = clock.today();
  const settings = await repos.settings.getAll();

  const insights = await runDailyInsights(repos, today);
  const review = await ensureWeeklyReview(repos, today, settings.weekStartsOn);

  let reminders: ReminderSyncResult | null = null;
  if (settings.notificationsEnabled) {
    const state = await readReminderState(repos, { today });
    reminders = await syncReminders(notifications, state);
  } else {
    // Reminders can be switched off anywhere — You → Settings, an import, the
    // coach — not only on the Reminders screen, so anything already scheduled
    // has to be cancelled here rather than left to fire.
    await cancelAllReminders(notifications);
  }

  return { ranAt: clock.now(), insights, review, reminders };
}
