/**
 * The manual workout builder's data layer.
 *
 * DESIGN.md §11: "Never compute progression in a component". When the user
 * drops an exercise into a session by hand, its sets, reps, load and rest
 * still come from `decideProgression` (DESIGN.md §5.1) with that exercise's
 * own history, the readiness modifier and the safety state — the user then
 * edits those numbers if they want to.
 */
import {
  assessReadiness,
  decideProgression,
  DEFAULT_REST_SEC,
  isLoadableLoadType,
  resolveLoadIncrementKg,
  type Equipment,
  type Exercise,
  type ExerciseRelation,
  type Id,
  type LocalDate,
  type Profile,
  type ReadinessModifier,
  type WorkoutPlanExercise,
} from '@vigor/core';
import type { Repositories } from '@vigor/db';

import { NoProfileError } from './planner';

export interface BuilderContext {
  date: LocalDate;
  profile: Profile;
  exercises: Exercise[];
  relations: ExerciseRelation[];
  equipment: Equipment[];
  readinessModifier: ReadinessModifier;
  safetyActive: boolean;
}

export async function loadBuilderContext(
  repos: Repositories,
  date: LocalDate,
): Promise<BuilderContext> {
  const [profile, exercises, relations, equipment, readiness, safetyActive] = await Promise.all([
    repos.profile.get(),
    repos.exercises.list(),
    repos.exercises.listRelations(),
    repos.equipment.list(),
    repos.readiness.getByDate(date),
    repos.safety.isActive(),
  ]);
  if (!profile) throw new NoProfileError();
  return {
    date,
    profile,
    exercises,
    relations,
    equipment,
    readinessModifier: assessReadiness(readiness, date).modifier,
    safetyActive,
  };
}

/** One planned slot, with every number decided by the progression engine. */
export async function buildSlot(
  repos: Repositories,
  ctx: BuilderContext,
  exerciseId: Id,
  order: number,
): Promise<WorkoutPlanExercise> {
  const exercise = ctx.exercises.find((entry) => entry.id === exerciseId);
  if (!exercise) throw new Error('That exercise is not in your library.');

  const history = await repos.workouts.getExerciseHistory(exerciseId, { limit: 3 });
  const category = exercise.equipment.find((item) => item !== 'bodyweight') ?? null;
  const equipmentRow = ctx.equipment.find(
    (row) => row.available && category != null && row.category === category,
  );
  const lastLoad = history[0]?.targetLoadKg ?? null;

  const decision = decideProgression({
    exerciseId,
    loadType: exercise.loadType,
    repRange: exercise.defaultRepRange,
    history,
    loadIncrementKg: resolveLoadIncrementKg({
      category,
      unitSystem: ctx.profile.unitSystem,
      overrideKg: equipmentRow?.loadIncrementKg ?? null,
      currentLoadKg: lastLoad,
    }),
    readinessModifier: ctx.readinessModifier,
    safetyActive: ctx.safetyActive,
    unitSystem: ctx.profile.unitSystem,
    restSec: DEFAULT_REST_SEC[exercise.loadType],
    progressionExerciseId:
      ctx.relations.find(
        (relation) => relation.kind === 'progression' && relation.fromId === exerciseId,
      )?.toId ?? null,
  });

  return {
    exerciseId,
    order,
    targetSets: decision.targetSets,
    targetRepMin: decision.targetRepMin,
    targetRepMax: decision.targetRepMax,
    targetLoadKg: isLoadableLoadType(exercise.loadType) ? decision.targetLoadKg : null,
    restSec: decision.restSec,
    tempo: null,
    substitutedFromExerciseId: null,
    progressionDecision: decision,
    notes: null,
  };
}
