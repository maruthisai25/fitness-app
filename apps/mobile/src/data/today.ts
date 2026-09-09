/**
 * Everything the Today tab shows, assembled once — DESIGN.md §7.1.
 *
 * The screen renders; the arithmetic belongs to the engines:
 * `assessReadiness` (§5.2), `computeStreak` (§5.7), `detectDeload` and
 * `detectPlateau` (§5.3) and `buildTodayView` (§7.2). Nothing below decides a
 * number on its own.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  addDays,
  assessReadiness,
  buildTodayView,
  computeStreak,
  detectDeload,
  detectPlateau,
  expandRestDays,
  queryKeys,
  type DeloadRecommendation,
  type Id,
  type LocalDate,
  type PlateauResult,
  type Readiness,
  type ReadinessAssessment,
  type Scale1To5,
  type StreakDay,
  type TodayView,
} from '@vigor/core';
import type { Repositories } from '@vigor/db';

import { useRepos } from '../db/AppDataProvider';
import { useReminderResync } from '../progress/useProgressForeground';
import { useInvalidate, useToday } from './queries';
import { planToday, type DeloadAdjustment } from './planner';

/** Days of history the streak looks back over. */
const STREAK_DAYS = 90;
/** Days of history the deload detector needs (six weeks). */
const DELOAD_DAYS = 42;
/** Exercises checked for a plateau on one Today load. */
const PLATEAU_EXERCISE_LIMIT = 6;

/** The detector code an accepted or dismissed deload is filed under. */
export const DELOAD_DETECTOR = 'DELOAD_RECOMMENDED';
/** The detector code a plateau acceptance is filed under. */
export const PLATEAU_DETECTOR = 'PLATEAU';

export interface PlateauCard extends PlateauResult {
  exerciseName: string;
}

export interface TodayBundle {
  date: LocalDate;
  view: TodayView;
  readinessRow: Readiness | null;
  assessment: ReadinessAssessment;
  deload: DeloadRecommendation;
  /** True once the user accepted today's deload; the planner then applies it. */
  deloadAccepted: boolean;
  /** True once the user dismissed it; the card stays down for the day. */
  deloadHandled: boolean;
  plateaus: PlateauCard[];
  handledPlateauExerciseIds: Id[];
}

export async function loadToday(repos: Repositories, date: LocalDate): Promise<TodayBundle> {
  const [readinessRow, workoutsToday, nutrition, openSafetyEvents, openInsights] =
    await Promise.all([
      repos.readiness.getByDate(date),
      repos.workouts.getByDate(date),
      repos.nutrition.getDay(date),
      repos.safety.listOpen(),
      repos.insights.listOpen(),
    ]);

  const assessment = assessReadiness(readinessRow, date);

  const [streakWorkouts, deloadWorkouts, readinessHistory, deloadInsights, plateauInsights] =
    await Promise.all([
      repos.workouts.listRange({ from: addDays(date, -STREAK_DAYS), to: date }),
      repos.workouts.getRecent({ days: DELOAD_DAYS, today: date }),
      repos.readiness.listRange({ from: addDays(date, -DELOAD_DAYS), to: date }),
      repos.insights.list({ detector: DELOAD_DETECTOR, includeDismissed: true }),
      repos.insights.list({ detector: PLATEAU_DETECTOR, includeDismissed: true }),
    ]);

  const plannedDays = new Map<LocalDate, StreakDay>();
  for (const workout of streakWorkouts) {
    if (workout.status === 'planned') continue;
    const existing = plannedDays.get(workout.date);
    plannedDays.set(workout.date, {
      date: workout.date,
      planned: true,
      completed: (existing?.completed ?? false) || workout.status === 'completed',
    });
  }
  const streak = computeStreak({
    today: date,
    days: expandRestDays(addDays(date, -STREAK_DAYS), date, [...plannedDays.values()]),
  });

  const deload = detectDeload({
    today: date,
    workouts: deloadWorkouts,
    readiness: readinessHistory.map((row) => ({
      date: row.date,
      modifier: assessReadiness(row, row.date).modifier,
    })),
  });

  const plateaus = await detectPlateaus(repos, date);

  const todayDeload = deloadInsights.filter((insight) => insight.period.to === date);
  const view = buildTodayView({
    date,
    readiness: assessment,
    workoutsToday,
    nutrition,
    openSafetyEvents,
    insights: openInsights,
    streak,
  });

  return {
    date,
    view,
    readinessRow,
    assessment,
    deload,
    deloadAccepted: todayDeload.some((insight) => !insight.dismissed),
    deloadHandled: todayDeload.length > 0,
    plateaus,
    handledPlateauExerciseIds: plateauInsights
      .map((insight) => insight.evidence[0]?.id)
      .filter((id): id is Id => typeof id === 'string'),
  };
}

/** Per-exercise plateau checks over the exercises actually trained lately. */
async function detectPlateaus(repos: Repositories, date: LocalDate): Promise<PlateauCard[]> {
  const recent = await repos.workouts.getRecent({ days: 60, today: date });
  const counts = new Map<Id, number>();
  for (const workout of recent) {
    if (workout.status !== 'completed') continue;
    for (const slot of workout.exercises) {
      counts.set(slot.exerciseId, (counts.get(slot.exerciseId) ?? 0) + 1);
    }
  }

  const candidates = [...counts.entries()]
    .filter(([, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, PLATEAU_EXERCISE_LIMIT)
    .map(([exerciseId]) => exerciseId);

  const cards: PlateauCard[] = [];
  for (const exerciseId of candidates) {
    const [exercise, history, relations] = await Promise.all([
      repos.exercises.get(exerciseId),
      repos.workouts.getExerciseHistory(exerciseId, { limit: 10 }),
      repos.exercises.listRelations(exerciseId),
    ]);
    if (!exercise) continue;
    const result = detectPlateau({
      exerciseId,
      exerciseName: exercise.name,
      history,
      repRange: exercise.defaultRepRange,
      relations,
    });
    if (result.plateaued) cards.push({ ...result, exerciseName: exercise.name });
  }
  return cards;
}

export function useTodayQuery(): UseQueryResult<TodayBundle> {
  const repos = useRepos();
  const date = useToday();
  return useQuery({ queryKey: queryKeys.today(date), queryFn: () => loadToday(repos, date) });
}

/** What the check-in card writes — DESIGN.md §5.2. */
export interface ReadinessInput {
  sleepHours: number | null;
  sleepQuality: Scale1To5 | null;
  energy: Scale1To5 | null;
  soreness: Scale1To5 | null;
  fatigue: Scale1To5 | null;
  stress: Scale1To5 | null;
  painReported: boolean;
  painNote: string | null;
}

/**
 * Saves the check-in, stores the engine's score, and — when pain was reported
 * — writes the `safety_events` row the engine asked for (DESIGN.md §5.2).
 */
export function useSaveReadiness() {
  const repos = useRepos();
  const date = useToday();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (input: ReadinessInput) => {
      const row = await repos.readiness.upsertForDate(date, input);
      const assessment = assessReadiness(row, date);
      if (assessment.score != null) await repos.readiness.setScore(row.id, assessment.score);
      if (assessment.safetyEvent) {
        await repos.safety.create({
          date: assessment.safetyEvent.date,
          kind: assessment.safetyEvent.kind,
          text: assessment.safetyEvent.text,
          source: assessment.safetyEvent.source,
        });
      }
      return assessment;
    },
    onSuccess: (assessment) =>
      assessment.safetyEvent ? invalidate('saveReadiness', 'reportSafety') : invalidate('saveReadiness'),
  });
}

/** Runs the offline planner and stores the result as a planned workout. */
export function usePlanToday() {
  const repos = useRepos();
  const date = useToday();
  const invalidate = useInvalidate();
  const resyncReminders = useReminderResync();

  return useMutation({
    mutationFn: async (options: { deload?: DeloadAdjustment | null } = {}) => {
      const plan = await planToday(repos, { date, deload: options.deload ?? null });
      return repos.workouts.createPlanned(plan);
    },
    onSuccess: async () => {
      await invalidate('createWorkout');
      // A new plan changes what the workout reminder would say (DESIGN.md §7.3).
      resyncReminders();
    },
  });
}

export function useDismissInsight() {
  const { insights } = useRepos();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: Id) => insights.dismiss(id),
    onSuccess: () => invalidate('dismissInsight'),
  });
}

/**
 * Records the user's answer to a deload suggestion. Accepting stores an open
 * insight (and the planner then applies −40 % volume / −10 % load); dismissing
 * stores the same row already dismissed, so the card stays down for the day.
 */
export function useAnswerDeload() {
  const { insights } = useRepos();
  const date = useToday();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (input: { accepted: boolean; recommendation: DeloadRecommendation }) =>
      insights.create({
        detector: DELOAD_DETECTOR,
        period: { from: addDays(date, -13), to: date },
        headline: input.accepted ? 'Deload week accepted' : 'Deload suggestion dismissed',
        detail: input.recommendation.rationale.summary,
        severity: 'notice',
        dismissed: !input.accepted,
        evidence: [],
      }),
    onSuccess: () => invalidate('dismissInsight'),
  });
}

/** The same accept/dismiss pair for one plateaued exercise. */
export function useAnswerPlateau() {
  const { insights } = useRepos();
  const date = useToday();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (input: { accepted: boolean; plateau: PlateauCard }) =>
      insights.create({
        detector: PLATEAU_DETECTOR,
        period: { from: addDays(date, -60), to: date },
        headline: input.accepted
          ? `${input.plateau.exerciseName} needs a change`
          : `${input.plateau.exerciseName} plateau dismissed`,
        detail: input.plateau.rationale.summary,
        severity: 'notice',
        dismissed: !input.accepted,
        evidence: [{ table: 'exercises', id: input.plateau.exerciseId, note: null }],
      }),
    onSuccess: () => invalidate('dismissInsight'),
  });
}

/**
 * The refresh the coach UI should call after it writes a plan, a memory or a
 * safety event, so the Today tab reflects it immediately.
 */
export function useRefreshToday(): () => Promise<void> {
  const invalidate = useInvalidate();
  return () => invalidate('createWorkout', 'saveReadiness', 'dismissInsight', 'resolveSafety');
}
