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
 *
 * Exactly one runner is mounted, at app level above the tabs and routes
 * (`useForegroundRunner`), and every entry point into it is guarded by a
 * module-level in-flight promise so two overlapping calls do the work once.
 * Mutations that can change a reminder's answer call {@link resyncForeground}
 * after they succeed.
 */

import {
  addDays,
  buildDayNutrition,
  buildWeeklyReview,
  daysBetween,
  decideReminders,
  durationBucketOf,
  runInsightDetectors,
  startOfWeek,
  weekdayOf,
  type EvidenceRef,
  type Exercise,
  type Id,
  type Insight,
  type InsightDraft,
  type InsightExerciseHistory,
  type InsightNutritionDay,
  type LocalDate,
  type LocalTime,
  type ReminderDecision,
  type ReminderState,
  type Settings,
  type WeekDay,
  type WorkoutWithExercises,
} from '@vigor/core';
import type { Repositories } from '@vigor/db';
import { useEffect } from 'react';

import { useDb } from '../db/provider';
import { finalLogs } from '../eat/logs';
import { webClock } from '../platform/clock';
import { webNotifications } from '../platform/notifications';

/** The rolling window the detectors and the review look back over. */
export const DETECTOR_WINDOW_DAYS = 28;

/**
 * Per-browser markers. They are device-local conveniences, not app data: the
 * `settings` table only accepts the DESIGN.md §4.1 keys, and neither of these
 * must ever travel in an export bundle. Both hold a local calendar day taken
 * from the Clock adapter — never a UTC slice of an instant.
 */
const INSIGHT_RUN_KEY = 'vigor.insights.lastRunDate';
const REVIEW_SEEN_KEY = 'vigor.weeklyReview.seenWeek';

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
    // A browser with storage blocked just re-runs the detectors; the identity
    // dedupe below still stops duplicate rows.
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

/** The local calendar day an ISO instant falls on, in this browser's timezone. */
export function localDayOf(instant: string): LocalDate {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return '1970-01-01';
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Insight identity — detector + subject
// ---------------------------------------------------------------------------

/**
 * An insight's identity is its detector plus the subject its evidence is about:
 * the exercise for `EXERCISE_TREND`, the weekday for `PROTEIN_GAP_BY_DAY`, the
 * macro for `MISSED_TARGET_STREAK`, and so on. The subject rides along on the
 * row as one extra evidence ref, which needs no schema change in `packages/db`.
 */
export const SUBJECT_EVIDENCE_TABLE = 'insight_subject';

/** The day a row was dismissed on, recorded the same way. */
export const DISMISSED_EVIDENCE_TABLE = 'insight_dismissed_at';

/** A dismissed insight stays dismissed for this long before it may return. */
export const DISMISSAL_QUIET_DAYS = 28;

function subjectRef(subject: string): EvidenceRef {
  return { table: SUBJECT_EVIDENCE_TABLE, id: subject, note: 'identity' };
}

/** The stored subject of an insight row, or null for a row written without one. */
export function subjectOf(insight: { evidence: readonly EvidenceRef[] }): string | null {
  return insight.evidence.find((ref) => ref.table === SUBJECT_EVIDENCE_TABLE)?.id ?? null;
}

export function identityOf(detector: string, subject: string): string {
  return `${detector}|${subject}`;
}

/** Evidence a person should see: the real rows, not the identity bookkeeping. */
export function visibleEvidence(insight: {
  evidence: readonly EvidenceRef[];
}): readonly EvidenceRef[] {
  return insight.evidence.filter(
    (ref) => ref.table !== SUBJECT_EVIDENCE_TABLE && ref.table !== DISMISSED_EVIDENCE_TABLE,
  );
}

interface SubjectContext {
  exerciseIdByWorkoutExercise: Map<Id, Id>;
  workoutsById: Map<Id, WorkoutWithExercises>;
}

function subjectContext(input: {
  workouts: readonly WorkoutWithExercises[];
  exerciseHistories: readonly InsightExerciseHistory[];
}): SubjectContext {
  const exerciseIdByWorkoutExercise = new Map<Id, Id>();
  for (const history of input.exerciseHistories) {
    for (const session of history.sessions) {
      exerciseIdByWorkoutExercise.set(session.workoutExerciseId, history.exerciseId);
    }
  }
  return {
    exerciseIdByWorkoutExercise,
    workoutsById: new Map(input.workouts.map((workout) => [workout.id, workout])),
  };
}

/**
 * The subject a fresh draft is about, read back out of the evidence the
 * detector attached. Two insights from one detector in one run always differ
 * here; the same finding on a later run always matches.
 */
export function deriveSubject(draft: InsightDraft, ctx: SubjectContext): string {
  const refs = draft.evidence;
  const durationOf = (workoutId: Id | undefined): string => {
    const workout = workoutId == null ? undefined : ctx.workoutsById.get(workoutId);
    return workout ? durationBucketOf(workout.plannedDurationMin).key : 'unknown';
  };

  switch (draft.detector) {
    case 'EXERCISE_TREND': {
      const ref = refs.find((entry) => entry.table === 'workout_exercises');
      const exerciseId = ref == null ? undefined : ctx.exerciseIdByWorkoutExercise.get(ref.id);
      return `exercise:${exerciseId ?? ref?.id ?? 'unknown'}`;
    }
    case 'PUSH_PULL_BALANCE':
      // One ratio for the whole body, so one identity for the whole detector.
      return 'push_pull';
    case 'SKIPPED_PATTERN': {
      const first = refs.find((entry) => entry.table === 'workouts');
      // The detector buckets by weekday and by planned duration; only a
      // duration bucket's headline names the sessions rather than the day.
      if (draft.headline.startsWith('sessions ')) return `duration:${durationOf(first?.id)}`;
      const workout = first == null ? undefined : ctx.workoutsById.get(first.id);
      return `weekday:${workout ? weekdayOf(workout.date) : 'unknown'}`;
    }
    case 'COMPLETION_BY_DURATION': {
      const first = refs.find((entry) => entry.table === 'workouts');
      return `duration:${durationOf(first?.id)}`;
    }
    case 'PROTEIN_GAP_BY_DAY': {
      const ref = refs.find((entry) => entry.table === 'nutrition_day');
      return `weekday:${ref ? weekdayOf(ref.id) : 'unknown'}`;
    }
    case 'FREQUENT_FOODS': {
      const ref = refs.find((entry) => entry.table === 'food_items');
      return `food:${(ref?.note ?? '').trim().toLowerCase()}`;
    }
    case 'MISSED_TARGET_STREAK': {
      const ref = refs.find((entry) => entry.table === 'nutrition_day');
      return `macro:${ref?.note ?? 'unknown'}`;
    }
    default:
      return `headline:${draft.headline}`;
  }
}

/** The day an insight was dismissed on, falling back to the day it was written. */
function dismissedOn(insight: Insight): LocalDate {
  const ref = insight.evidence.find((entry) => entry.table === DISMISSED_EVIDENCE_TABLE);
  return ref?.id ?? localDayOf(insight.createdAt);
}

/**
 * Dismisses an insight and records the day, so the detectors know to stay quiet
 * about that subject for {@link DISMISSAL_QUIET_DAYS}.
 */
export async function dismissInsight(
  repos: Repositories,
  insight: Insight,
  today: LocalDate,
): Promise<void> {
  await repos.insights.update(insight.id, {
    dismissed: true,
    evidence: [
      ...insight.evidence.filter((ref) => ref.table !== DISMISSED_EVIDENCE_TABLE),
      { table: DISMISSED_EVIDENCE_TABLE, id: today, note: 'dismissed on' },
    ],
  });
}

/** One row per identity: an open row wins, otherwise the most recent dismissal. */
function indexByIdentity(rows: readonly Insight[]): Map<string, Insight> {
  const byIdentity = new Map<string, Insight>();
  for (const row of rows) {
    const subject = subjectOf(row);
    if (subject == null) continue;
    const identity = identityOf(row.detector, subject);
    const current = byIdentity.get(identity);
    if (current == null) {
      byIdentity.set(identity, row);
      continue;
    }
    if (current.dismissed && !row.dismissed) {
      byIdentity.set(identity, row);
      continue;
    }
    if (current.dismissed === row.dismissed && dismissedOn(row) > dismissedOn(current)) {
      byIdentity.set(identity, row);
    }
  }
  return byIdentity;
}

// ---------------------------------------------------------------------------
// Detector inputs
// ---------------------------------------------------------------------------

interface DetectorInput {
  today: LocalDate;
  period: { from: LocalDate; to: LocalDate };
  workouts: Awaited<ReturnType<Repositories['workouts']['getRecent']>>;
  exercises: Exercise[];
  exerciseHistories: InsightExerciseHistory[];
  nutritionDays: InsightNutritionDay[];
}

async function loadDetectorInput(repos: Repositories, today: LocalDate): Promise<DetectorInput> {
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

  const logs = finalLogs(await repos.nutrition.listLogs({ from, to: today }));
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

// ---------------------------------------------------------------------------
// Detector run — DESIGN.md §5.8
// ---------------------------------------------------------------------------

/**
 * Guards the whole check-then-act: two screens (or a mount racing a
 * visibility change) that ask for a run while one is under way share it, so the
 * "already ran today" marker can never be read before the first run writes it.
 */
let detectorsInFlight: Promise<InsightDraft[]> | null = null;

/**
 * Runs every detector and reconciles the result against the rows already in the
 * database. For each identity: an open row is updated in place, a row dismissed
 * inside the quiet period is left alone, anything else is inserted.
 *
 * Returns the drafts that were inserted.
 */
export function runDetectorsOnce(
  repos: Repositories,
  today: LocalDate,
  options: { force?: boolean } = {},
): Promise<InsightDraft[]> {
  if (detectorsInFlight != null) return detectorsInFlight;
  const run = executeDetectors(repos, today, options).finally(() => {
    detectorsInFlight = null;
  });
  detectorsInFlight = run;
  return run;
}

async function executeDetectors(
  repos: Repositories,
  today: LocalDate,
  options: { force?: boolean },
): Promise<InsightDraft[]> {
  if (!options.force && readMarker(INSIGHT_RUN_KEY) === today) return [];

  const input = await loadDetectorInput(repos, today);
  const { insights } = runInsightDetectors(input);
  const ctx = subjectContext(input);

  const existing = await repos.insights.list({ includeDismissed: true });
  const byIdentity = indexByIdentity(existing);

  const inserts: InsightDraft[] = [];
  const claimed = new Set<string>();

  for (const insight of insights) {
    const subject = deriveSubject(insight, ctx);
    const identity = identityOf(insight.detector, subject);
    if (claimed.has(identity)) continue;
    claimed.add(identity);

    const stamped: InsightDraft = {
      ...insight,
      evidence: [subjectRef(subject), ...insight.evidence],
    };

    const current = byIdentity.get(identity);
    if (current != null && !current.dismissed) {
      // Same finding, fresh numbers: keep the row the user is looking at.
      await repos.insights.update(current.id, {
        period: stamped.period,
        headline: stamped.headline,
        detail: stamped.detail,
        evidence: stamped.evidence,
        severity: stamped.severity,
      });
      continue;
    }
    if (
      current != null &&
      current.dismissed &&
      daysBetween(dismissedOn(current), today) < DISMISSAL_QUIET_DAYS
    ) {
      continue;
    }
    inserts.push(stamped);
  }

  if (inserts.length > 0) await repos.insights.createMany(inserts);
  writeMarker(INSIGHT_RUN_KEY, today);
  return inserts;
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
 * True once the user has actually opened the review for that week on this
 * device. The reminder is about reading the review, not about the row existing
 * — the row is written by this very runner, moments before the reminder is
 * evaluated, so "the row exists" would silence the reminder for ever.
 */
export function hasSeenWeeklyReview(weekStart: LocalDate): boolean {
  return readMarker(REVIEW_SEEN_KEY) === weekStart;
}

/** Called by the Weekly review screen when it shows that week. */
export function markWeeklyReviewSeen(weekStart: LocalDate): void {
  writeMarker(REVIEW_SEEN_KEY, weekStart);
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

  const logs = finalLogs(await repos.nutrition.listLogs({ from: weekStart, to: weekEnd }));
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
 * Everything `decideReminders` needs, read from the database. The Reminders
 * screen previews with exactly this, so what it shows and what gets scheduled
 * can never be answers to two different questions.
 */
export async function loadReminderState(
  repos: Repositories,
  settings: Settings,
  today: LocalDate,
  now: LocalTime,
): Promise<ReminderState> {
  const workoutsToday = await repos.workouts.getByDate(today);
  const logs = finalLogs(await repos.nutrition.listLogs({ from: today, to: today }));
  const targets = await repos.targets.getActive(today);
  const day = buildDayNutrition({ date: today, logs, targets });

  const lastLoggedAt = logs
    .map((log) => Date.parse(log.loggedAt))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];
  const minutesSinceLastMealLog =
    lastLoggedAt == null ? null : Math.max(0, Math.round((Date.now() - lastLoggedAt) / 60_000));

  return {
    today,
    now,
    weekday: weekdayOf(today),
    settings,
    workoutCompletedToday: workoutsToday.some((workout) => workout.status === 'completed'),
    plannedWorkoutToday: workoutsToday.some(
      (workout) => workout.status === 'planned' || workout.status === 'in_progress',
    ),
    minutesSinceLastMealLog,
    remainingProteinG: targets ? day.remaining.proteinG : null,
    weeklyReviewDay: settings.weekStartsOn,
    weeklyReviewGenerated: hasSeenWeeklyReview(lastCompletedWeekStart(today, settings.weekStartsOn)),
  };
}

/**
 * A reminder whose slot is still ahead of us. The browser can evaluate the skip
 * rule at the slot itself (DESIGN.md §7.4: the tab has to be open anyway), so
 * nothing is handed to the Notification API until then — the timer re-runs the
 * whole decision and only shows what still stands.
 */
const slotTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** The last repositories and settings a sync ran with, for the slot re-checks. */
let foregroundContext: { repos: Repositories; settings: Settings } | null = null;

function clearSlotTimer(id: string): void {
  const timer = slotTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    slotTimers.delete(id);
  }
}

function clearAllSlotTimers(): void {
  for (const id of [...slotTimers.keys()]) clearSlotTimer(id);
}

function scheduleSlotRecheck(id: string, today: LocalDate, at: LocalTime): void {
  const delayMs = Date.parse(isoAtLocalTime(today, at)) - Date.now();
  if (!Number.isFinite(delayMs) || delayMs <= 0) return;
  slotTimers.set(
    id,
    setTimeout(() => {
      slotTimers.delete(id);
      // Re-decide with fresh rows: a meal logged since, or a workout finished,
      // means this reminder must stay quiet rather than fire from a stale plan.
      resyncForeground();
    }, delayMs),
  );
}

/**
 * Re-runs the reminder sync against current data. Mutations that can change a
 * skip rule's answer — logging or deleting food, finishing a workout — call
 * this after they succeed, and every pending slot timer calls it at its slot.
 */
export function resyncForeground(): void {
  const context = foregroundContext;
  if (context == null) return;
  const today = webClock.today();
  void (async () => {
    try {
      if (context.settings.notificationsEnabled) {
        await syncReminders(context.repos, context.settings, today, localTimeNow());
      } else {
        clearAllSlotTimers();
        await webNotifications.cancelAll();
      }
    } catch {
      // Notification permission can be revoked at any moment.
    }
  })();
}

/**
 * Asks the engine which reminders stand, shows the ones that are due, arms a
 * re-check for the ones whose slot is still ahead, and cancels every id that no
 * longer belongs — so a reminder that has become irrelevant (a workout
 * finished, a meal logged) does not fire later from a stale timer.
 */
export async function syncReminders(
  repos: Repositories,
  settings: Settings,
  today: LocalDate,
  now: LocalTime,
): Promise<ReminderRunResult> {
  foregroundContext = { repos, settings };
  const decisions = decideReminders(await loadReminderState(repos, settings, today, now));

  const scheduled: string[] = [];
  const cancelled: string[] = [];

  for (const decision of decisions) {
    const id = notificationIdFor(decision.kind);
    clearSlotTimer(id);
    if (decision.fires) {
      await webNotifications.schedule({
        id,
        title: REMINDER_TITLE[decision.kind],
        body: decision.rationale.summary,
        fireAt: new Date().toISOString(),
      });
      scheduled.push(id);
    } else if (decision.scheduledFor != null && decision.rationale.codes.includes('NOT_YET_DUE')) {
      await webNotifications.cancel(id);
      scheduleSlotRecheck(id, today, decision.scheduledFor);
      scheduled.push(id);
    } else {
      await webNotifications.cancel(id);
      cancelled.push(id);
    }
  }

  return { decisions, scheduled, cancelled };
}

// ---------------------------------------------------------------------------
// The single runner, mounted above the routes
// ---------------------------------------------------------------------------

let foregroundInFlight: Promise<void> | null = null;

/** Detectors, then the weekly review, then reminders. Never twice at once. */
export function runForegroundTasks(repos: Repositories, settings: Settings): Promise<void> {
  if (foregroundInFlight != null) return foregroundInFlight;
  const run = executeForegroundTasks(repos, settings).finally(() => {
    foregroundInFlight = null;
  });
  foregroundInFlight = run;
  return run;
}

async function executeForegroundTasks(repos: Repositories, settings: Settings): Promise<void> {
  const today = webClock.today();
  try {
    await runDetectorsOnce(repos, today);
  } catch {
    // Insights are a nicety; the tab still works without them.
  }
  try {
    await runWeeklyReviewIfDue(repos, today, settings.weekStartsOn);
  } catch {
    // The review is rebuilt on the next foreground.
  }
  if (settings.notificationsEnabled) {
    try {
      await syncReminders(repos, settings, today, localTimeNow());
    } catch {
      // Notification permission can be revoked at any moment.
    }
  } else {
    clearAllSlotTimers();
    await webNotifications.cancelAll();
  }
}

/**
 * Mounted exactly once, at app level above the tabs and routes. Runs the
 * foreground jobs on mount and again whenever the tab becomes visible.
 * Failures are swallowed on purpose: a detector that cannot run must never
 * stop a screen from rendering.
 */
export function useForegroundRunner(): void {
  const { repos, settings } = useDb();

  useEffect(() => {
    foregroundContext = { repos, settings };
    void runForegroundTasks(repos, settings);

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void runForegroundTasks(repos, settings);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [repos, settings]);
}
