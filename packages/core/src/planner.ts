/**
 * Rule-based planner — DESIGN.md §5.4.
 *
 * Chooses a session from the user's goals and the last seven days of
 * muscle-group volume: picks the least recently trained major pattern group,
 * respects `preferredDurationMin` (each exercise costs
 * `sets × (restSec + 40 s)`), filters by available equipment, training location
 * and dislikes, and runs the progression engine over every slot.
 *
 * This is the offline fallback and the baseline the coach refines when online.
 */

import { daysBetween } from './dates';
import { makeRationale } from './rationale';
import { decideProgression, DEFAULT_REST_SEC, isLoadableLoadType } from './progression';
import { sessionLoadKg } from './setMath';
import type {
  Equipment,
  EquipmentCategory,
  Exercise,
  ExerciseRelation,
  ExerciseSession,
  Goal,
  GoalType,
  Id,
  LocalDate,
  MovementPattern,
  Profile,
  Rationale,
  ReadinessModifier,
  RepRange,
  TrainingLocation,
  WorkoutPlan,
  WorkoutPlanExercise,
  WorkoutWithExercises,
} from './types';
import { resolveLoadIncrementKg } from './units';

/** Seconds of work per set on top of the prescribed rest — DESIGN.md §5.4. */
export const SECONDS_PER_SET_WORK = 40;

/** The pattern buckets the planner rotates through. */
export type PatternGroup =
  'squat' | 'hinge' | 'push' | 'pull' | 'core' | 'accessory' | 'conditioning' | 'mobility';

export const PATTERN_GROUP_OF: Record<MovementPattern, PatternGroup> = {
  squat: 'squat',
  lunge: 'squat',
  hinge: 'hinge',
  horizontal_push: 'push',
  vertical_push: 'push',
  horizontal_pull: 'pull',
  vertical_pull: 'pull',
  carry: 'core',
  core: 'core',
  isolation: 'accessory',
  cardio: 'conditioning',
  mobility: 'mobility',
};

/** The groups a session is built around; accessories only fill leftover time. */
export const MAJOR_PATTERN_GROUPS: readonly PatternGroup[] = ['squat', 'hinge', 'push', 'pull'];

const GROUP_LABEL: Record<PatternGroup, string> = {
  squat: 'Lower body — squat',
  hinge: 'Lower body — hinge',
  push: 'Upper body — push',
  pull: 'Upper body — pull',
  core: 'Core',
  accessory: 'Accessory',
  conditioning: 'Conditioning',
  mobility: 'Mobility',
};

/** Sets, reps and rest per goal — the shape of the session, before progression. */
export interface SessionTemplate {
  repRange: RepRange;
  sets: number;
  restSec: number;
}

export const GOAL_TEMPLATES: Record<GoalType, SessionTemplate> = {
  strength: { repRange: { min: 4, max: 6 }, sets: 4, restSec: 180 },
  hypertrophy: { repRange: { min: 8, max: 12 }, sets: 3, restSec: 90 },
  fat_loss: { repRange: { min: 10, max: 15 }, sets: 3, restSec: 60 },
  general: { repRange: { min: 8, max: 12 }, sets: 3, restSec: 90 },
  endurance: { repRange: { min: 12, max: 20 }, sets: 3, restSec: 60 },
  mobility: { repRange: { min: 8, max: 12 }, sets: 2, restSec: 45 },
  conditioning: { repRange: { min: 10, max: 15 }, sets: 3, restSec: 45 },
  consistency: { repRange: { min: 8, max: 12 }, sets: 3, restSec: 75 },
};

/** Difficulty the planner aims at, by declared level. */
const LEVEL_TARGET_DIFFICULTY = { beginner: 2, intermediate: 3, advanced: 4 } as const;

/**
 * Equipment a location cannot offer unless the user explicitly listed it as
 * available — DESIGN.md §5.4 "filters exercises by available equipment,
 * location and dislikes".
 */
export const LOCATION_UNAVAILABLE_EQUIPMENT: Record<
  TrainingLocation,
  readonly EquipmentCategory[]
> = {
  gym: [],
  home: [],
  hotel: ['barbell', 'machine', 'cable'],
  outdoor: ['machine', 'cable'],
  other: [],
};

export interface PlannerInput {
  date: LocalDate;
  profile: Profile;
  goals: readonly Goal[];
  /** The exercise library, custom rows included. */
  exercises: readonly Exercise[];
  relations?: readonly ExerciseRelation[];
  equipment: readonly Equipment[];
  /** At least the last seven days, for the least-recently-trained rotation. */
  recentWorkouts: readonly WorkoutWithExercises[];
  /** Past sessions keyed by exercise id, so progression can carry loads over. */
  historyByExercise?: Readonly<Record<Id, readonly ExerciseSession[]>>;
  readinessModifier?: ReadinessModifier;
  safetyActive?: boolean;
  /** Movement patterns to leave out entirely, e.g. an injured pattern. */
  excludedPatterns?: readonly MovementPattern[];
  dislikedExerciseIds?: readonly Id[];
  /** Overrides `profile.preferredDurationMin` — "I only have 30 minutes". */
  durationMin?: number;
  /** Cap on exercises; the duration budget usually bites first. */
  maxExercises?: number;
}

/** The seconds one slot will take: `sets × (restSec + 40 s)`. */
export function exerciseCostSeconds(sets: number, restSec: number): number {
  return sets * (restSec + SECONDS_PER_SET_WORK);
}

/** Equipment categories the user can actually use, given kit and location. */
export function availableEquipmentCategories(
  equipment: readonly Equipment[],
  location: TrainingLocation,
): EquipmentCategory[] {
  const owned = new Set<EquipmentCategory>(['bodyweight']);
  for (const row of equipment) {
    if (row.available) owned.add(row.category);
  }
  for (const category of LOCATION_UNAVAILABLE_EQUIPMENT[location]) {
    const explicit = equipment.some((row) => row.available && row.category === category);
    if (!explicit) owned.delete(category);
  }
  return [...owned];
}

function equipmentSatisfied(
  required: readonly EquipmentCategory[],
  available: readonly EquipmentCategory[],
): boolean {
  return required.every((category) => category === 'bodyweight' || available.includes(category));
}

/** The category that determines the load increment for an exercise. */
function loadingCategory(exercise: Exercise): EquipmentCategory | null {
  return exercise.equipment.find((category) => category !== 'bodyweight') ?? null;
}

/** Days since a pattern group was last trained; null when never. */
export function daysSinceGroupTrained(
  group: PatternGroup,
  today: LocalDate,
  workouts: readonly WorkoutWithExercises[],
  exercisesById: ReadonlyMap<Id, Exercise>,
): number | null {
  let last: LocalDate | null = null;
  for (const workout of workouts) {
    if (workout.status !== 'completed' && workout.status !== 'in_progress') continue;
    if (workout.date > today) continue;
    for (const slot of workout.exercises) {
      const exercise = exercisesById.get(slot.exerciseId);
      if (!exercise) continue;
      if (PATTERN_GROUP_OF[exercise.movementPattern] !== group) continue;
      if (last == null || workout.date > last) last = workout.date;
    }
  }
  return last == null ? null : daysBetween(last, today);
}

interface Candidate {
  exercise: Exercise;
  group: PatternGroup;
  score: number;
}

export interface PlannerResult extends WorkoutPlan {
  /** Groups in rotation order, least recently trained first. */
  groupOrder: PatternGroup[];
  /** Seconds the plan is expected to take. */
  estimatedSeconds: number;
}

/**
 * Builds a workout with no network and no model. Every number in the result
 * comes from the progression engine, so the plan is explainable offline.
 */
export function planWorkout(input: PlannerInput): PlannerResult {
  const {
    date,
    profile,
    exercises,
    equipment,
    recentWorkouts,
    readinessModifier = 'normal',
    safetyActive = false,
  } = input;

  const historyByExercise = input.historyByExercise ?? {};
  const disliked = new Set(input.dislikedExerciseIds ?? []);
  const excludedPatterns = new Set(input.excludedPatterns ?? []);
  const relations = input.relations ?? [];
  const durationMin = input.durationMin ?? profile.preferredDurationMin;
  const budgetSeconds = Math.max(1, durationMin) * 60;
  const maxExercises = input.maxExercises ?? 8;

  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const available = availableEquipmentCategories(equipment, profile.trainingLocation);

  const activeGoals = [...input.goals]
    .filter((goal) => goal.active)
    .sort((a, b) => a.priority - b.priority);
  const primaryGoal = activeGoals[0]?.type ?? 'general';
  const template = GOAL_TEMPLATES[primaryGoal];

  const targetDifficulty = LEVEL_TARGET_DIFFICULTY[profile.fitnessLevel];
  const trainedIds = new Set(Object.keys(historyByExercise));

  let droppedForEquipment = 0;
  let droppedForDislike = 0;
  let droppedForPattern = 0;

  const candidates: Candidate[] = [];
  for (const exercise of exercises) {
    if (exercise.archived) continue;
    if (excludedPatterns.has(exercise.movementPattern)) {
      droppedForPattern += 1;
      continue;
    }
    if (disliked.has(exercise.id)) {
      droppedForDislike += 1;
      continue;
    }
    if (!equipmentSatisfied(exercise.equipment, available)) {
      droppedForEquipment += 1;
      continue;
    }
    const group = PATTERN_GROUP_OF[exercise.movementPattern];
    const historyBonus = trainedIds.has(exercise.id) ? 2 : 0;
    const difficultyFit = Math.max(0, 2 - Math.abs(exercise.difficulty - targetDifficulty));
    const compoundBonus = exercise.movementPattern === 'isolation' ? 0 : 1;
    candidates.push({
      exercise,
      group,
      score: historyBonus + difficultyFit + compoundBonus,
    });
  }

  const groupsWithCandidates = new Set(candidates.map((candidate) => candidate.group));
  const groupOrder = [...MAJOR_PATTERN_GROUPS]
    .filter((group) => groupsWithCandidates.has(group))
    .map((group) => ({
      group,
      days: daysSinceGroupTrained(group, date, recentWorkouts, exercisesById),
    }))
    .sort((a, b) => {
      const left = a.days ?? Number.POSITIVE_INFINITY;
      const right = b.days ?? Number.POSITIVE_INFINITY;
      if (left !== right) return right - left; // most days ago first
      return MAJOR_PATTERN_GROUPS.indexOf(a.group) - MAJOR_PATTERN_GROUPS.indexOf(b.group);
    })
    .map((entry) => entry.group);

  const primaryGroup = groupOrder[0] ?? null;
  const secondaryGroup = groupOrder[1] ?? null;

  // Slot plan: two from the freshest group, two from the next, then filler.
  const slots: PatternGroup[] = [];
  if (primaryGroup) slots.push(primaryGroup, primaryGroup);
  if (secondaryGroup) slots.push(secondaryGroup, secondaryGroup);
  if (groupsWithCandidates.has('core')) slots.push('core');
  slots.push('accessory');
  if (primaryGroup) slots.push(primaryGroup);

  const chosen: Exercise[] = [];
  const usedIds = new Set<Id>();
  const usedMuscles = new Set<string>();

  for (const slot of slots) {
    if (chosen.length >= maxExercises) break;
    const pick = candidates
      .filter((candidate) => candidate.group === slot && !usedIds.has(candidate.exercise.id))
      .map((candidate) => ({
        candidate,
        adjusted:
          candidate.score -
          (candidate.exercise.primaryMuscles.some((muscle) => usedMuscles.has(muscle.toLowerCase()))
            ? 1
            : 0),
      }))
      .sort(
        (a, b) =>
          b.adjusted - a.adjusted ||
          a.candidate.exercise.name.localeCompare(b.candidate.exercise.name),
      )[0];
    if (!pick) continue;
    chosen.push(pick.candidate.exercise);
    usedIds.add(pick.candidate.exercise.id);
    for (const muscle of pick.candidate.exercise.primaryMuscles) {
      usedMuscles.add(muscle.toLowerCase());
    }
  }

  const planExercises: WorkoutPlanExercise[] = [];
  let estimatedSeconds = 0;
  let droppedForTime = 0;

  for (const exercise of chosen) {
    const history = [...(historyByExercise[exercise.id] ?? [])].sort((a, b) =>
      a.date > b.date ? -1 : a.date < b.date ? 1 : 0,
    );
    const repRange = isLoadableLoadType(exercise.loadType)
      ? template.repRange
      : exercise.defaultRepRange;
    const category = loadingCategory(exercise);
    const equipmentRow = equipment.find(
      (row) => row.available && category != null && row.category === category,
    );
    const lastLoad = history.length > 0 ? sessionLoadKg(history[0]) : null;
    const incrementKg = resolveLoadIncrementKg({
      category,
      unitSystem: profile.unitSystem,
      overrideKg: equipmentRow?.loadIncrementKg ?? null,
      currentLoadKg: lastLoad,
    });
    const progressionRelation = relations.find(
      (relation) => relation.kind === 'progression' && relation.fromId === exercise.id,
    );

    const restSec = template.restSec || DEFAULT_REST_SEC[exercise.loadType];
    const decision = decideProgression({
      exerciseId: exercise.id,
      loadType: exercise.loadType,
      repRange,
      history,
      loadIncrementKg: incrementKg,
      readinessModifier,
      safetyActive,
      unitSystem: profile.unitSystem,
      targetSets: template.sets,
      restSec,
      progressionExerciseId: progressionRelation?.toId ?? null,
    });

    const cost = exerciseCostSeconds(decision.targetSets, decision.restSec);
    if (planExercises.length > 0 && estimatedSeconds + cost > budgetSeconds) {
      droppedForTime += 1;
      continue;
    }
    estimatedSeconds += cost;
    planExercises.push({
      exerciseId: exercise.id,
      order: planExercises.length,
      targetSets: decision.targetSets,
      targetRepMin: decision.targetRepMin,
      targetRepMax: decision.targetRepMax,
      targetLoadKg: decision.targetLoadKg,
      restSec: decision.restSec,
      tempo: null,
      substitutedFromExerciseId: null,
      progressionDecision: decision,
      notes: null,
    });
  }

  const focus = [
    ...new Set(
      planExercises.flatMap((slot) => exercisesById.get(slot.exerciseId)?.primaryMuscles ?? []),
    ),
  ].slice(0, 5);

  const daysSincePrimary = primaryGroup
    ? daysSinceGroupTrained(primaryGroup, date, recentWorkouts, exercisesById)
    : null;

  const codes: string[] = ['RULE_BASED_PLAN'];
  if (primaryGroup) codes.push('LEAST_RECENTLY_TRAINED');
  codes.push('DURATION_BUDGET');
  if (droppedForEquipment > 0) codes.push('EQUIPMENT_FILTERED');
  if (droppedForDislike > 0) codes.push('DISLIKES_EXCLUDED');
  if (droppedForPattern > 0) codes.push('PATTERN_EXCLUDED');
  if (safetyActive) codes.push('SAFETY_HOLD');
  if (readinessModifier === 'reduce') codes.push('READINESS_REDUCE');
  if (readinessModifier === 'hold') codes.push('READINESS_HOLD');

  const title = primaryGroup ? `${GROUP_LABEL[primaryGroup]} focus` : 'Full body';

  const rationale: Rationale = makeRationale(
    codes,
    {
      date,
      primaryGoal,
      template,
      groupOrder,
      primaryGroup,
      secondaryGroup,
      daysSincePrimaryGroup: daysSincePrimary,
      durationMin,
      budgetSeconds,
      estimatedSeconds,
      availableEquipment: available,
      candidatesConsidered: candidates.length,
      droppedForEquipment,
      droppedForDislike,
      droppedForPattern,
      droppedForTime,
      readinessModifier,
      safetyActive,
      exerciseIds: planExercises.map((slot) => slot.exerciseId),
    },
    buildPlanSummary({
      primaryGroup,
      daysSincePrimary,
      count: planExercises.length,
      durationMin,
      readinessModifier,
      safetyActive,
    }),
  );

  return {
    date,
    title,
    focus,
    plannedDurationMin: Math.ceil(estimatedSeconds / 60),
    source: 'rule',
    exercises: planExercises,
    readinessId: null,
    notes: null,
    rationale,
    groupOrder,
    estimatedSeconds,
  };
}

function buildPlanSummary(input: {
  primaryGroup: PatternGroup | null;
  daysSincePrimary: number | null;
  count: number;
  durationMin: number;
  readinessModifier: ReadinessModifier;
  safetyActive: boolean;
}): string {
  const parts: string[] = [];
  if (input.primaryGroup) {
    parts.push(
      input.daysSincePrimary == null
        ? `${GROUP_LABEL[input.primaryGroup]} has no logged sessions yet, so it leads today`
        : `${GROUP_LABEL[input.primaryGroup]} was last trained ${input.daysSincePrimary} ${
            input.daysSincePrimary === 1 ? 'day' : 'days'
          } ago, the longest of your major patterns, so it leads today`,
    );
  }
  parts.push(
    `${input.count} ${input.count === 1 ? 'exercise fits' : 'exercises fit'} inside your ${
      input.durationMin
    }-minute window`,
  );
  if (input.safetyActive) parts.push('and a safety event keeps every load where it was');
  else if (input.readinessModifier === 'reduce') parts.push('with volume cut for low readiness');
  else if (input.readinessModifier === 'hold') parts.push('with loads held for middling readiness');
  return `${parts.join(', ')}.`;
}
