/**
 * Assembles the inputs the rule-based planner needs and runs it — DESIGN.md
 * §5.4, §9 phase 3 ("rule-based planner fallback ... offline planning").
 *
 * Nothing here decides a number: `planWorkout` owns selection, sets, reps,
 * loads and rest, and every value it returns already carries a rationale
 * (DESIGN.md §2.1). This module only fetches rows and hands them over.
 */
import type { Repositories } from '@vigor/db';
import {
  assessReadiness,
  planWorkout,
  resolveLoadIncrementKg,
  roundLoadKgToAchievable,
  type Exercise,
  type ExerciseSession,
  type Id,
  type LocalDate,
  type PlannerResult,
  type UnitSystem,
} from '@vigor/core';

/** How far back the planner looks for the least-recently-trained rotation. */
const RECENT_WORKOUT_DAYS = 28;
/** How far back we look for exercises that have any history worth carrying. */
const HISTORY_WORKOUT_DAYS = 120;
/** Sessions per exercise the progression engine reads — DESIGN.md §5.1. */
const HISTORY_SESSIONS_PER_EXERCISE = 3;

/** A deload the user accepted: next session at −40 % volume, −10 % load. */
export interface DeloadAdjustment {
  volumeMultiplier: number;
  loadMultiplier: number;
}

export interface PlanTodayOptions {
  date: LocalDate;
  durationMin?: number;
  deload?: DeloadAdjustment | null;
}

/** Raised when the planner is asked to work before onboarding wrote a profile. */
export class NoProfileError extends Error {
  constructor() {
    super('Finish your profile in the You tab before planning a workout.');
    this.name = 'NoProfileError';
  }
}

/**
 * Builds today's plan offline. This is the fallback when the coach is not
 * available and the baseline the coach refines when it is (DESIGN.md §5.4).
 */
export async function planToday(
  repos: Repositories,
  options: PlanTodayOptions,
): Promise<PlannerResult> {
  const { date } = options;

  const [profile, goals, exercises, relations, equipment, recentWorkouts, readiness, safetyActive] =
    await Promise.all([
      repos.profile.get(),
      repos.goals.listActive(),
      repos.exercises.list(),
      repos.exercises.listRelations(),
      repos.equipment.list(),
      repos.workouts.getRecent({ days: RECENT_WORKOUT_DAYS, today: date }),
      repos.readiness.getByDate(date),
      repos.safety.isActive(),
    ]);

  if (!profile) throw new NoProfileError();

  const historyByExercise = await loadHistory(repos, date, exercises);
  const dislikedExerciseIds = await loadDislikedExerciseIds(repos, exercises);

  const plan = planWorkout({
    date,
    profile,
    goals,
    exercises,
    relations,
    equipment,
    recentWorkouts,
    historyByExercise,
    readinessModifier: assessReadiness(readiness, date).modifier,
    safetyActive,
    dislikedExerciseIds,
    durationMin: options.durationMin,
  });

  return options.deload ? applyDeload(plan, exercises, profile.unitSystem, options.deload) : plan;
}

/** Past sessions keyed by exercise id, so progression can carry loads over. */
async function loadHistory(
  repos: Repositories,
  date: LocalDate,
  exercises: readonly Exercise[],
): Promise<Record<Id, ExerciseSession[]>> {
  const known = new Set(exercises.map((exercise) => exercise.id));
  const window = await repos.workouts.getRecent({ days: HISTORY_WORKOUT_DAYS, today: date });
  const trained = new Set<Id>();
  for (const workout of window) {
    for (const slot of workout.exercises) {
      if (known.has(slot.exerciseId)) trained.add(slot.exerciseId);
    }
  }

  const entries = await Promise.all(
    [...trained].map(
      async (exerciseId) =>
        [
          exerciseId,
          await repos.workouts.getExerciseHistory(exerciseId, {
            limit: HISTORY_SESSIONS_PER_EXERCISE,
          }),
        ] as const,
    ),
  );
  return Object.fromEntries(entries.filter(([, sessions]) => sessions.length > 0));
}

/**
 * DESIGN.md §5.4 filters by "equipment, location and dislikes". A dislike is a
 * memory row, so an exercise counts as disliked when an active `dislike`
 * memory names it.
 */
async function loadDislikedExerciseIds(
  repos: Repositories,
  exercises: readonly Exercise[],
): Promise<Id[]> {
  const memories = await repos.memories.listActive({ kind: 'dislike', domain: 'training' });
  if (memories.length === 0) return [];
  const texts = memories.map((memory) => memory.text.toLowerCase());
  return exercises
    .filter((exercise) => texts.some((text) => text.includes(exercise.name.toLowerCase())))
    .map((exercise) => exercise.id);
}

/** The accepted deload prescription — DESIGN.md §5.3 (volume −40 %, loads −10 %). */
export function applyDeload(
  plan: PlannerResult,
  exercises: readonly Exercise[],
  unitSystem: UnitSystem,
  deload: DeloadAdjustment,
): PlannerResult {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return {
    ...plan,
    exercises: plan.exercises.map((slot) => {
      const category =
        byId.get(slot.exerciseId)?.equipment.find((item) => item !== 'bodyweight') ?? null;
      const incrementKg = resolveLoadIncrementKg({
        category,
        unitSystem,
        currentLoadKg: slot.targetLoadKg,
      });
      return {
        ...slot,
        targetSets: Math.max(1, Math.round(slot.targetSets * deload.volumeMultiplier)),
        targetLoadKg:
          slot.targetLoadKg == null
            ? null
            : roundLoadKgToAchievable(
                slot.targetLoadKg * deload.loadMultiplier,
                unitSystem,
                incrementKg,
              ),
      };
    }),
  };
}
