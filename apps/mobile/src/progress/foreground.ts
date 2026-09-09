/**
 * The two things Progress does on its own when the app comes to the front:
 * run the insight detectors (DESIGN.md §5.8, "on app open, at most once per
 * day") and close off the week that just ended (DESIGN.md §5.9).
 *
 * Both are deterministic: the detectors and the review builder live in
 * `@vigor/core`, and this module only gathers their inputs, de-duplicates the
 * output against what is already stored, and writes the rows. The coach is
 * never on the critical path — the weekly summary is queued as an `ai_job` and
 * arrives later (DESIGN.md §8).
 */
import {
  addDays,
  buildWeeklyReview,
  runInsightDetectors,
  startOfWeek,
  type Exercise,
  type Insight,
  type InsightDraft,
  type InsightExerciseHistory,
  type InsightNutritionDay,
  type LocalDate,
  type WeekDay,
} from '@vigor/core';

import type { AppRepos } from '../db/AppDataProvider';

/** The detectors look four weeks back (DESIGN.md §5.8). */
export const INSIGHT_WINDOW_DAYS = 28;

/** How many past sessions of each exercise the trend detector gets. */
export const EXERCISE_HISTORY_LIMIT = 24;

/**
 * One insight row is the same as another when it comes from the same detector,
 * for the same period, about the same thing. `EXERCISE_TREND` and
 * `FREQUENT_FOODS` legitimately emit several rows per period, so the headline
 * is part of the key.
 */
export function insightKey(insight: Insight | InsightDraft): string {
  return `${insight.detector}|${insight.period.from}|${insight.period.to}|${insight.headline}`;
}

/** Remembers, for this app session, which day the detectors last ran. */
let lastDetectorRun: LocalDate | null = null;

/** Test seam: forgets the once-a-day guard. */
export function resetDetectorGuard(): void {
  lastDetectorRun = null;
}

export interface InsightRunOutcome {
  ran: boolean;
  created: number;
  /** Drafts that were dropped because an identical row already existed. */
  duplicates: number;
  reason: string;
}

/**
 * Runs every detector once per calendar day and stores the new rows.
 *
 * The guard is the in-session date plus the newest stored insight: if
 * something was already written today, the detectors do not run again. A day
 * that produces nothing leaves no marker, so a cold start can repeat the work
 * — the detectors are pure and cheap, and the dedupe below makes a repeat
 * write-free.
 */
export async function runDailyInsights(
  repos: AppRepos,
  today: LocalDate,
): Promise<InsightRunOutcome> {
  if (lastDetectorRun === today) {
    return { ran: false, created: 0, duplicates: 0, reason: 'Already run in this session today.' };
  }

  const existing = await repos.insights.list({ includeDismissed: true });
  if (existing.some((insight) => insight.createdAt.slice(0, 10) === today)) {
    lastDetectorRun = today;
    return { ran: false, created: 0, duplicates: 0, reason: 'Already run today.' };
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

  const known = new Set(existing.map(insightKey));
  const fresh = result.insights.filter((draft) => !known.has(insightKey(draft)));
  if (fresh.length > 0) await repos.insights.createMany(fresh);

  lastDetectorRun = today;
  return {
    ran: true,
    created: fresh.length,
    duplicates: result.insights.length - fresh.length,
    reason: result.rationale.summary,
  };
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
