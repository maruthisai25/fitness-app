/**
 * Everything the Today tab shows, assembled from the repositories and the core
 * engines in one query — DESIGN.md §7.1, §7.2 (`buildTodayView` lives in
 * `packages/core`; components only render), §5.2 readiness, §5.3 plateau and
 * deload, §5.7 streaks, §6.5 safety.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  addDays,
  assessReadiness,
  buildTodayView,
  computeStreak,
  detectDeload,
  detectPlateau,
  queryKeys,
  type DeloadRecommendation,
  type Exercise,
  type Insight,
  type LocalDate,
  type PlateauResult,
  type Readiness,
  type ReadinessAssessment,
  type StreakDay,
  type StreakResult,
  type TodayView,
  type WorkoutWithExercises,
} from '@vigor/core';
import type { Repositories } from '@vigor/db';

import { useRepos } from '../data/hooks';
import { buildHistoryByExercise } from '../lib/history';

/** Days of history Today reads: enough for the six-week deload comparison. */
export const TODAY_HISTORY_DAYS = 45;
/** At most this many plateau cards, so the screen stays readable. */
export const MAX_PLATEAU_CARDS = 3;

export interface TodayData {
  view: TodayView;
  readiness: ReadinessAssessment;
  readinessRow: Readiness | null;
  workoutsToday: WorkoutWithExercises[];
  recentWorkouts: WorkoutWithExercises[];
  streak: StreakResult;
  deload: DeloadRecommendation;
  plateaus: { plateau: PlateauResult; exercise: Exercise }[];
  insights: Insight[];
}

/** A planned day counts for the streak; a rest day is transparent (§5.7). */
export function streakDaysFrom(workouts: readonly WorkoutWithExercises[]): StreakDay[] {
  const byDate = new Map<LocalDate, StreakDay>();
  for (const workout of workouts) {
    const current = byDate.get(workout.date) ?? {
      date: workout.date,
      planned: false,
      completed: false,
    };
    byDate.set(workout.date, {
      date: workout.date,
      planned: true,
      completed: current.completed || workout.status === 'completed',
    });
  }
  return [...byDate.values()];
}

/** Exported for the boot test; screens use {@link useTodayView}. */
export async function loadToday(repos: Repositories, date: LocalDate): Promise<TodayData> {
  const [
    readinessRow,
    workoutsToday,
    recentWorkouts,
    nutrition,
    safetyEvents,
    insights,
    exercises,
  ] = await Promise.all([
    repos.readiness.getByDate(date),
    repos.workouts.getByDate(date),
    repos.workouts.getRecent({ days: TODAY_HISTORY_DAYS, today: date }),
    repos.nutrition.getDay(date),
    repos.safety.listOpen(),
    repos.insights.listOpen(),
    repos.exercises.list(),
  ]);

  const readiness = assessReadiness(readinessRow, date);
  const streak = computeStreak({ today: date, days: streakDaysFrom(recentWorkouts) });

  const readinessRows = await repos.readiness.listRange({ from: addDays(date, -13), to: date });
  const deload = detectDeload({
    today: date,
    workouts: recentWorkouts,
    readiness: readinessRows.map((row) => ({
      date: row.date,
      modifier: assessReadiness(row).modifier,
    })),
  });

  const byExercise = buildHistoryByExercise(recentWorkouts);
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const plateaus: TodayData['plateaus'] = [];
  for (const [exerciseId, history] of Object.entries(byExercise)) {
    const exercise = exercisesById.get(exerciseId);
    if (!exercise) continue;
    const plateau = detectPlateau({
      exerciseId,
      exerciseName: exercise.name,
      history,
      repRange: exercise.defaultRepRange,
      relations: await repos.exercises.listRelations(exerciseId),
    });
    if (plateau.plateaued) plateaus.push({ plateau, exercise });
  }

  const view = buildTodayView({
    date,
    readiness,
    workoutsToday,
    nutrition,
    openSafetyEvents: safetyEvents,
    insights,
    streak,
  });

  return {
    view,
    readiness,
    readinessRow,
    workoutsToday,
    recentWorkouts,
    streak,
    deload,
    plateaus: plateaus.slice(0, MAX_PLATEAU_CARDS),
    insights,
  };
}

export function useTodayView(date: LocalDate): UseQueryResult<TodayData> {
  const repos = useRepos();
  return useQuery({ queryKey: queryKeys.today(date), queryFn: () => loadToday(repos, date) });
}
