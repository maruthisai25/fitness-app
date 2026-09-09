/**
 * Offline planning — DESIGN.md §5.4, §9 phase 3 ("rule-based planner
 * fallback"). This module gathers the rows the planner needs and hands them to
 * `planWorkout`; it never invents a number of its own. The deload helper only
 * applies the multipliers the deload detector published (§5.3).
 */

import {
  assessReadiness,
  planWorkout,
  roundLoadKgToAchievable,
  type DeloadRecommendation,
  type Equipment,
  type Exercise,
  type Id,
  type LocalDate,
  type PlannerResult,
  type Profile,
  type UnitSystem,
  type Workout,
  type WorkoutPlan,
} from '@vigor/core';
import type { Repositories } from '@vigor/db';

import { buildHistoryByExercise } from '../lib/history';
import { incrementKgFor } from '../lib/increments';

/** Days of history the planner reads for load carry-over and group rotation. */
export const PLANNER_HISTORY_DAYS = 90;

export interface PlanDraftOptions {
  date: LocalDate;
  /** "I only have 30 minutes" — overrides `profile.preferredDurationMin`. */
  durationMin?: number;
  /** Accepted deload prescription for this week, if any. */
  deload?: DeloadRecommendation | null;
}

export interface PlanDraft {
  plan: PlannerResult;
  profile: Profile;
  exercises: Exercise[];
  equipment: Equipment[];
  safetyActive: boolean;
}

/**
 * Builds today's draft with the rule-based planner. Works with no network and
 * no model, and is the baseline the coach refines when it is online.
 */
export async function buildPlanDraft(
  repos: Repositories,
  options: PlanDraftOptions,
): Promise<PlanDraft> {
  const { date } = options;
  const [
    profile,
    goals,
    exercises,
    relations,
    equipment,
    recentWorkouts,
    readinessRow,
    safetyActive,
  ] = await Promise.all([
    repos.profile.get(),
    repos.goals.list(),
    repos.exercises.list(),
    repos.exercises.listRelations(),
    repos.equipment.list(),
    repos.workouts.getRecent({ days: PLANNER_HISTORY_DAYS, today: date }),
    repos.readiness.getByDate(date),
    repos.safety.isActive(),
  ]);

  if (!profile) {
    throw new Error('VigorEngine: a profile is required before a workout can be planned');
  }

  const readiness = assessReadiness(readinessRow, date);
  const plan = planWorkout({
    date,
    profile,
    goals,
    exercises,
    relations,
    equipment,
    recentWorkouts,
    historyByExercise: buildHistoryByExercise(recentWorkouts),
    readinessModifier: readiness.modifier,
    safetyActive,
    durationMin: options.durationMin,
  });

  const withReadiness: PlannerResult = { ...plan, readinessId: readinessRow?.id ?? null };
  const prescribed: PlannerResult = options.deload?.recommended
    ? {
        ...withReadiness,
        ...applyDeloadPrescription(withReadiness, options.deload, {
          unitSystem: profile.unitSystem,
          exercises,
          equipment,
        }),
      }
    : withReadiness;

  return { plan: prescribed, profile, exercises, equipment, safetyActive };
}

/** Plans today's session and stores it as `planned` — DESIGN.md §4.2. */
export async function planAndSaveWorkout(
  repos: Repositories,
  options: PlanDraftOptions,
): Promise<Workout> {
  const { plan } = await buildPlanDraft(repos, options);
  return repos.workouts.createPlanned(plan);
}

/**
 * Applies an accepted deload — DESIGN.md §5.3: next week's volume −40 % and
 * loads −10 %. Both multipliers come from the detector's own recommendation;
 * loads are re-snapped to something the user can actually load (§5.10).
 */
export function applyDeloadPrescription(
  plan: WorkoutPlan,
  recommendation: DeloadRecommendation,
  context: {
    unitSystem: UnitSystem;
    exercises: readonly Exercise[];
    equipment: readonly Equipment[];
  },
): WorkoutPlan {
  const byId = new Map<Id, Exercise>(context.exercises.map((exercise) => [exercise.id, exercise]));
  return {
    ...plan,
    title: `${plan.title} (deload)`,
    exercises: plan.exercises.map((slot) => {
      const exercise = byId.get(slot.exerciseId);
      const incrementKg = incrementKgFor({
        exercise,
        equipment: context.equipment,
        unitSystem: context.unitSystem,
        currentLoadKg: slot.targetLoadKg,
      });
      return {
        ...slot,
        targetSets: Math.max(1, Math.round(slot.targetSets * recommendation.volumeMultiplier)),
        targetLoadKg:
          slot.targetLoadKg == null
            ? null
            : roundLoadKgToAchievable(
                slot.targetLoadKg * recommendation.loadMultiplier,
                context.unitSystem,
                incrementKg,
              ),
      };
    }),
    rationale: {
      codes: [...plan.rationale.codes, ...recommendation.rationale.codes],
      facts: { ...plan.rationale.facts, deload: recommendation.rationale.facts },
      summary: `${plan.rationale.summary} You accepted a deload, so volume drops to ${Math.round(
        recommendation.volumeMultiplier * 100,
      )} % and loads to ${Math.round(recommendation.loadMultiplier * 100)} % of normal.`,
    },
  };
}
