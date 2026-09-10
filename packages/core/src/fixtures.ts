/**
 * Deterministic fixture builders for the engine tests — DESIGN.md §10.
 *
 * Ids are readable strings rather than UUID v7 so a failing assertion names the
 * row it is about. Nothing here reads the clock; every date is passed in.
 */

import type {
  Equipment,
  Exercise,
  ExerciseSession,
  FoodItem,
  FoodLogWithItems,
  Goal,
  Id,
  LocalDate,
  MovementPattern,
  NutritionTargets,
  Profile,
  Readiness,
  SetRecord,
  Settings,
  Workout,
  WorkoutExerciseWithSets,
  WorkoutWithExercises,
} from './types';

let counter = 0;

/** Monotonic, readable, and reset per test with {@link resetFixtureIds}. */
export function nextId(prefix: string): Id {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function resetFixtureIds(): void {
  counter = 0;
}

export function makeSet(partial: Partial<SetRecord> = {}): SetRecord {
  // `undefined` means "use the default"; an explicit `null` is kept as null.
  return {
    id: partial.id ?? nextId('set'),
    workoutExerciseId: partial.workoutExerciseId ?? 'we-1',
    setIndex: partial.setIndex ?? 0,
    targetReps: partial.targetReps ?? 10,
    actualReps: partial.actualReps === undefined ? 10 : partial.actualReps,
    actualLoadKg: partial.actualLoadKg === undefined ? 20 : partial.actualLoadKg,
    rpe: partial.rpe === undefined ? null : partial.rpe,
    completed: partial.completed ?? true,
    isWarmup: partial.isWarmup ?? false,
    notes: partial.notes ?? null,
    completedAt: partial.completedAt ?? null,
  };
}

export interface SessionSpec {
  date: LocalDate;
  exerciseId?: Id;
  workoutId?: Id;
  workoutExerciseId?: Id;
  /** One entry per working set. */
  reps: number[];
  /** Canonical kg, or null for bodyweight work. */
  loadKg?: number | null;
  /** One RPE per set, or a single value applied to every set. */
  rpe?: number | number[] | null;
  targetRepMin?: number;
  targetRepMax?: number;
  status?: Workout['status'];
}

/** One past session of one exercise, as `workouts.getExerciseHistory` returns it. */
export function makeSession(spec: SessionSpec): ExerciseSession {
  const workoutExerciseId = spec.workoutExerciseId ?? nextId('we');
  const rpe = spec.rpe ?? null;
  return {
    workoutId: spec.workoutId ?? nextId('workout'),
    workoutExerciseId,
    exerciseId: spec.exerciseId ?? 'ex-bench',
    date: spec.date,
    status: spec.status ?? 'completed',
    targetRepMin: spec.targetRepMin ?? 8,
    targetRepMax: spec.targetRepMax ?? 12,
    targetLoadKg: spec.loadKg === undefined ? null : spec.loadKg,
    sets: spec.reps.map((reps, index) =>
      makeSet({
        workoutExerciseId,
        setIndex: index,
        targetReps: spec.targetRepMax ?? 12,
        actualReps: reps,
        actualLoadKg: spec.loadKg === undefined ? null : spec.loadKg,
        rpe: Array.isArray(rpe) ? (rpe[index] ?? null) : rpe,
      }),
    ),
  };
}

export function makeExercise(partial: Partial<Exercise> = {}): Exercise {
  const name = partial.name ?? 'Barbell bench press';
  return {
    id: partial.id ?? nextId('ex'),
    name,
    slug: partial.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    movementPattern: partial.movementPattern ?? 'horizontal_push',
    primaryMuscles: partial.primaryMuscles ?? ['chest'],
    secondaryMuscles: partial.secondaryMuscles ?? ['triceps'],
    equipment: partial.equipment ?? ['barbell'],
    difficulty: partial.difficulty ?? 3,
    instructions: partial.instructions ?? 'Set up, brace, press.',
    cues: partial.cues ?? ['Elbows tucked'],
    isCustom: partial.isCustom ?? false,
    loadType: partial.loadType ?? 'external',
    defaultRepRange: partial.defaultRepRange ?? { min: 8, max: 12 },
    archived: partial.archived ?? false,
  };
}

export function makeEquipment(partial: Partial<Equipment> = {}): Equipment {
  return {
    id: partial.id ?? nextId('eq'),
    name: partial.name ?? 'Barbell',
    category: partial.category ?? 'barbell',
    available: partial.available ?? true,
    loadIncrementKg: partial.loadIncrementKg ?? null,
    notes: partial.notes ?? null,
  };
}

export function makeProfile(partial: Partial<Profile> = {}): Profile {
  return {
    id: partial.id ?? 'profile-1',
    displayName: partial.displayName ?? 'Athlete',
    // `undefined` means "use the default"; an explicit `null` is kept as null.
    birthDate: partial.birthDate === undefined ? '1994-05-02' : partial.birthDate,
    sex: partial.sex === undefined ? 'male' : partial.sex,
    heightCm: partial.heightCm === undefined ? 178 : partial.heightCm,
    weightKg: partial.weightKg === undefined ? 80 : partial.weightKg,
    fitnessLevel: partial.fitnessLevel ?? 'intermediate',
    trainingExperienceMonths: partial.trainingExperienceMonths ?? 24,
    preferredDurationMin: partial.preferredDurationMin ?? 45,
    preferredStyles: partial.preferredStyles ?? ['strength'],
    trainingLocation: partial.trainingLocation ?? 'gym',
    unitSystem: partial.unitSystem ?? 'metric',
    foodRegion: partial.foodRegion ?? 'generic',
    activityLevel: partial.activityLevel ?? 'moderate',
    notes: partial.notes ?? null,
    updatedAt: partial.updatedAt ?? '2026-09-01T00:00:00.000Z',
  };
}

export function makeGoal(partial: Partial<Goal> = {}): Goal {
  return {
    id: partial.id ?? nextId('goal'),
    type: partial.type ?? 'hypertrophy',
    priority: partial.priority ?? 1,
    targetNote: partial.targetNote ?? null,
    active: partial.active ?? true,
    createdAt: partial.createdAt ?? '2026-09-01T00:00:00.000Z',
  };
}

export function makeReadiness(partial: Partial<Readiness> = {}): Readiness {
  return {
    id: partial.id ?? nextId('readiness'),
    date: partial.date ?? '2026-09-10',
    // `undefined` means "use the default"; an explicit `null` is kept as null.
    sleepHours: partial.sleepHours === undefined ? 8 : partial.sleepHours,
    sleepQuality: partial.sleepQuality === undefined ? 4 : partial.sleepQuality,
    energy: partial.energy === undefined ? 4 : partial.energy,
    soreness: partial.soreness === undefined ? 2 : partial.soreness,
    fatigue: partial.fatigue === undefined ? 2 : partial.fatigue,
    stress: partial.stress === undefined ? 2 : partial.stress,
    painReported: partial.painReported ?? false,
    painNote: partial.painNote === undefined ? null : partial.painNote,
    score: partial.score === undefined ? null : partial.score,
    notes: partial.notes ?? null,
  };
}

export function makeSettings(partial: Partial<Settings> = {}): Settings {
  return {
    apiKeyRef: partial.apiKeyRef ?? null,
    coachModel: partial.coachModel ?? 'claude-opus-5',
    fastModel: partial.fastModel ?? 'claude-haiku-4-5',
    notificationsEnabled: partial.notificationsEnabled ?? true,
    reminderTimes: partial.reminderTimes ?? {
      workout: '17:30',
      missedWorkout: '08:00',
      mealLog: '13:00',
      protein: '18:00',
      weeklyReview: '19:00',
      measurement: '07:30',
    },
    weekStartsOn: partial.weekStartsOn ?? 1,
    onboardingComplete: partial.onboardingComplete ?? true,
    disclaimerAcceptedAt: partial.disclaimerAcceptedAt ?? '2026-09-01T00:00:00.000Z',
    insightsLastRunOn: partial.insightsLastRunOn ?? null,
    weeklyReviewDay: partial.weeklyReviewDay ?? null,
    lastReviewViewedWeek: partial.lastReviewViewedWeek ?? null,
    serverSideFallback: partial.serverSideFallback ?? true,
  };
}

export interface WorkoutSpec {
  date: LocalDate;
  status?: Workout['status'];
  id?: Id;
  title?: string;
  plannedDurationMin?: number;
  exercises?: {
    exerciseId: Id;
    reps: number[];
    loadKg?: number | null;
    rpe?: number | number[] | null;
    completed?: boolean;
  }[];
}

export function makeWorkout(spec: WorkoutSpec): WorkoutWithExercises {
  const workoutId = spec.id ?? nextId('workout');
  const exercises: WorkoutExerciseWithSets[] = (spec.exercises ?? []).map((slot, index) => {
    const workoutExerciseId = nextId('we');
    return {
      id: workoutExerciseId,
      workoutId,
      order: index,
      exerciseId: slot.exerciseId,
      targetSets: slot.reps.length,
      targetRepMin: 8,
      targetRepMax: 12,
      targetLoadKg: slot.loadKg === undefined ? null : slot.loadKg,
      restSec: 90,
      tempo: null,
      substitutedFromExerciseId: null,
      progressionDecision: null,
      notes: null,
      sets: slot.reps.map((reps, setIndex) =>
        makeSet({
          workoutExerciseId,
          setIndex,
          actualReps: reps,
          actualLoadKg: slot.loadKg === undefined ? null : slot.loadKg,
          rpe: Array.isArray(slot.rpe) ? (slot.rpe[setIndex] ?? null) : (slot.rpe ?? null),
          completed: slot.completed ?? true,
        }),
      ),
    };
  });

  return {
    id: workoutId,
    date: spec.date,
    status: spec.status ?? 'completed',
    source: 'rule',
    title: spec.title ?? 'Session',
    focus: [],
    plannedDurationMin: spec.plannedDurationMin ?? 45,
    startedAt: null,
    finishedAt: null,
    readinessId: null,
    rationale: null,
    coachMessageId: null,
    notes: null,
    exercises,
  };
}

export function makeTargets(partial: Partial<NutritionTargets> = {}): NutritionTargets {
  return {
    id: partial.id ?? nextId('target'),
    effectiveFrom: partial.effectiveFrom ?? '2026-01-01',
    kcal: partial.kcal ?? 2600,
    proteinG: partial.proteinG ?? 150,
    carbsG: partial.carbsG ?? 280,
    fatG: partial.fatG ?? 72,
    fiberG: partial.fiberG ?? 36,
    source: partial.source ?? 'computed',
  };
}

export function makeFoodItem(partial: Partial<FoodItem> = {}): FoodItem {
  return {
    id: partial.id ?? nextId('item'),
    foodLogId: partial.foodLogId ?? 'log-1',
    name: partial.name ?? 'Chicken breast',
    quantity: partial.quantity ?? 200,
    unit: partial.unit ?? 'g',
    kcal: partial.kcal ?? 330,
    proteinG: partial.proteinG ?? 62,
    carbsG: partial.carbsG ?? 0,
    fatG: partial.fatG ?? 7,
    fiberG: partial.fiberG ?? 0,
    confidence: partial.confidence ?? 0.9,
    savedMealId: partial.savedMealId ?? null,
  };
}

export function makeFoodLog(partial: Partial<FoodLogWithItems> = {}): FoodLogWithItems {
  const id = partial.id ?? nextId('log');
  return {
    id,
    date: partial.date ?? '2026-09-10',
    mealSlot: partial.mealSlot ?? 'lunch',
    rawText: partial.rawText ?? '200 g chicken breast',
    loggedAt: partial.loggedAt ?? '2026-09-10T12:30:00.000Z',
    source: partial.source ?? 'ai',
    estimationStatus: partial.estimationStatus ?? 'final',
    items: partial.items ?? [makeFoodItem({ foodLogId: id })],
  };
}

/** A tiny library covering every major pattern, for planner and substitution tests. */
export function makeLibrary(): Exercise[] {
  const spec: [string, string, MovementPattern, Exercise['equipment'], number, string[]][] = [
    ['ex-squat', 'Back squat', 'squat', ['barbell'], 3, ['quads', 'glutes']],
    ['ex-goblet', 'Goblet squat', 'squat', ['dumbbell'], 2, ['quads', 'glutes']],
    ['ex-airsquat', 'Bodyweight squat', 'squat', ['bodyweight'], 1, ['quads']],
    ['ex-rdl', 'Romanian deadlift', 'hinge', ['barbell'], 3, ['hamstrings', 'glutes']],
    ['ex-hipthrust', 'Hip thrust', 'hinge', ['barbell'], 2, ['glutes']],
    ['ex-bench', 'Barbell bench press', 'horizontal_push', ['barbell'], 3, ['chest', 'triceps']],
    [
      'ex-dbbench',
      'Dumbbell bench press',
      'horizontal_push',
      ['dumbbell'],
      3,
      ['chest', 'triceps'],
    ],
    ['ex-pushup', 'Push-up', 'horizontal_push', ['bodyweight'], 2, ['chest', 'triceps']],
    ['ex-ohp', 'Overhead press', 'vertical_push', ['barbell'], 4, ['shoulders']],
    ['ex-row', 'Barbell row', 'horizontal_pull', ['barbell'], 3, ['back', 'biceps']],
    ['ex-dbrow', 'Dumbbell row', 'horizontal_pull', ['dumbbell'], 2, ['back', 'biceps']],
    ['ex-machinerow', 'Machine row', 'horizontal_pull', ['machine'], 2, ['back']],
    ['ex-pullup', 'Pull-up', 'vertical_pull', ['bodyweight'], 4, ['back', 'biceps']],
    ['ex-plank', 'Plank', 'core', ['bodyweight'], 1, ['core']],
    ['ex-curl', 'Dumbbell curl', 'isolation', ['dumbbell'], 1, ['biceps']],
  ];

  return spec.map(([id, name, pattern, equipment, difficulty, muscles]) =>
    makeExercise({
      id,
      name,
      movementPattern: pattern,
      equipment,
      difficulty: difficulty as Exercise['difficulty'],
      primaryMuscles: muscles,
      loadType:
        name === 'Plank' ? 'time' : equipment.includes('bodyweight') ? 'bodyweight' : 'external',
      defaultRepRange: name === 'Plank' ? { min: 30, max: 60 } : { min: 8, max: 12 },
    }),
  );
}
