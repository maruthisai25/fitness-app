/**
 * Session mode's data layer, free of React — DESIGN.md §7.1, §7.2.
 *
 * Keeping these functions out of the hook module means they can be tested
 * against a real in-memory database without rendering anything, and it keeps
 * the rule of DESIGN.md §11 obvious: no arithmetic happens here either. The
 * substitution ranking comes from `substitute()` (§5.5) and the finish summary
 * from `detectPersonalRecords()` (§5.7).
 */
import {
  assessReadiness,
  availableEquipmentCategories,
  decideProgression,
  detectPersonalRecords,
  isLoadableLoadType,
  resolveLoadIncrementKg,
  sessionVolumeKg,
  substitute,
  workingSets,
  type Exercise,
  type ExerciseSession,
  type Id,
  type LocalDate,
  type PersonalRecordKind,
  type Rationale,
  type SetRecord,
  type SubstitutionCandidate,
  type SubstitutionReason,
  type UnitSystem,
  type WorkoutExercise,
  type WorkoutExerciseWithSets,
  type WorkoutWithExercises,
} from '@vigor/core';
import type { Repositories } from '@vigor/db';

/** One planned set with what the same set looked like last time. */
export interface SessionSetView {
  set: SetRecord;
  lastReps: number | null;
  lastLoadKg: number | null;
}

/** One exercise slot of the session, resolved for display. */
export interface SessionExerciseView {
  slot: WorkoutExerciseWithSets;
  exercise: Exercise | null;
  lastSession: ExerciseSession | null;
  sets: SessionSetView[];
}

export interface SessionView {
  workout: WorkoutWithExercises;
  exercises: SessionExerciseView[];
  /** DESIGN.md §6.5 — while true the screen shows the hold behaviour. */
  safetyActive: boolean;
}

/** Loads the workout, its exercises and the previous session of each one. */
export async function loadSession(repos: Repositories, workoutId: Id): Promise<SessionView | null> {
  const workout = await repos.workouts.getWithExercises(workoutId);
  if (!workout) return null;

  const [library, safetyActive] = await Promise.all([
    repos.exercises.getMany(workout.exercises.map((slot) => slot.exerciseId)),
    repos.safety.isActive(),
  ]);
  const byId = new Map(library.map((exercise) => [exercise.id, exercise]));

  const histories = await Promise.all(
    workout.exercises.map((slot) =>
      repos.workouts.getExerciseHistory(slot.exerciseId, { limit: 1 }),
    ),
  );

  const exercises: SessionExerciseView[] = workout.exercises.map((slot, index) => {
    const lastSession = histories[index]?.[0] ?? null;
    const lastSets = lastSession ? workingSets(lastSession) : [];
    return {
      slot,
      exercise: byId.get(slot.exerciseId) ?? null,
      lastSession,
      sets: [...slot.sets]
        .sort((a, b) => a.setIndex - b.setIndex)
        .map((set, setIndex) => ({
          set,
          lastReps: lastSets[setIndex]?.actualReps ?? null,
          lastLoadKg: lastSets[setIndex]?.actualLoadKg ?? null,
        })),
    };
  });

  return { workout, exercises, safetyActive };
}

// ---------------------------------------------------------------------------
// "Can't do this" — DESIGN.md §5.5
// ---------------------------------------------------------------------------

export interface SubstitutionOffer {
  candidates: SubstitutionCandidate[];
  rationale: Rationale;
}

/** Ranks replacements for one slot with the core substitution engine. */
export async function rankSubstitutes(
  repos: Repositories,
  input: { exerciseId: Id; reason: SubstitutionReason; excludeExerciseIds: readonly Id[] },
): Promise<SubstitutionOffer> {
  const [exercises, relations, equipment, profile, recent] = await Promise.all([
    repos.exercises.list(),
    repos.exercises.listRelations(),
    repos.equipment.list(),
    repos.profile.get(),
    repos.workouts.getRecent({ days: 120 }),
  ]);

  const exercisedIds = new Set<Id>();
  for (const workout of recent) {
    for (const slot of workout.exercises) {
      if (slot.sets.some((set) => set.completed)) exercisedIds.add(slot.exerciseId);
    }
  }

  const result = substitute(input.exerciseId, input.reason, {
    exercises,
    relations,
    availableEquipment: availableEquipmentCategories(equipment, profile?.trainingLocation ?? 'gym'),
    exercisedIds: [...exercisedIds],
    excludeExerciseIds: input.excludeExerciseIds,
  });

  return { candidates: result.candidates, rationale: result.rationale };
}

/**
 * Applies the pick — DESIGN.md §6.3 (`substitute_exercise`) and §11 ("never
 * compute progression in a component").
 *
 * Pointing the slot at a new exercise is not enough: the old exercise's
 * `targetLoadKg`, rep targets and stored `ProgressionDecision` describe a
 * different movement, and session mode falls back to `targetLoadKg` when the
 * load box is left empty — a back squat's 100 kg would be logged as a goblet
 * squat. So the load is re-derived by `decideProgression` from the replacement's
 * own history, its own increment, today's readiness modifier and the safety
 * state, and every set that is not yet logged inherits the new rep target.
 */
export async function applySubstitution(
  repos: Repositories,
  input: { workoutExerciseId: Id; toExerciseId: Id; today: LocalDate },
): Promise<WorkoutExercise> {
  const slot = await repos.workouts.getExercise(input.workoutExerciseId);
  if (!slot) throw new Error('That exercise is no longer part of this session.');

  const [profile, replacement, equipment, relations, readinessRow, safetyActive, history] =
    await Promise.all([
      repos.profile.get(),
      repos.exercises.get(input.toExerciseId),
      repos.equipment.list(),
      repos.exercises.listRelations(input.toExerciseId, 'progression'),
      repos.readiness.getByDate(input.today),
      repos.safety.isActive(),
      repos.workouts.getExerciseHistory(input.toExerciseId, { limit: 3 }),
    ]);
  if (!replacement) throw new Error('That replacement is not in your library any more.');

  const unitSystem = profile?.unitSystem ?? 'metric';
  const category = replacement.equipment.find((item) => item !== 'bodyweight') ?? null;
  const equipmentRow = equipment.find(
    (row) => row.available && category != null && row.category === category,
  );

  const decision = decideProgression({
    exerciseId: replacement.id,
    loadType: replacement.loadType,
    repRange: { min: slot.targetRepMin, max: slot.targetRepMax },
    history,
    loadIncrementKg: resolveLoadIncrementKg({
      category,
      unitSystem,
      overrideKg: equipmentRow?.loadIncrementKg ?? null,
      currentLoadKg: history[0]?.targetLoadKg ?? null,
    }),
    readinessModifier: assessReadiness(readinessRow, input.today).modifier,
    safetyActive,
    unitSystem,
    // The slot keeps the set rows it already has.
    targetSets: slot.targetSets,
    restSec: slot.restSec,
    progressionExerciseId: relations[0]?.toId ?? null,
  });

  const updated = await repos.workouts.updateExercise(input.workoutExerciseId, {
    exerciseId: replacement.id,
    substitutedFromExerciseId: slot.substitutedFromExerciseId ?? slot.exerciseId,
    targetLoadKg: isLoadableLoadType(replacement.loadType) ? decision.targetLoadKg : null,
    targetRepMin: decision.targetRepMin,
    targetRepMax: decision.targetRepMax,
    progressionDecision: decision,
  });

  const sets = await repos.sets.listForWorkoutExercise(input.workoutExerciseId);
  for (const set of sets) {
    if (set.completed) continue;
    await repos.sets.update(set.id, { targetReps: decision.targetRepMin });
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Finish — DESIGN.md §5.7
// ---------------------------------------------------------------------------

/** One new record, ready to render. */
export interface FinishRecord {
  exerciseId: Id;
  exerciseName: string;
  kind: PersonalRecordKind;
  value: number;
  loadKg: number | null;
  reps: number | null;
}

export interface FinishSummary {
  workoutId: Id;
  startedAt: string | null;
  finishedAt: string | null;
  totalSets: number;
  totalVolumeKg: number;
  /** e1RM and max load — celebrated loudly (DESIGN.md §5.7). */
  celebrated: FinishRecord[];
  /** Everything else — listed quietly. */
  quiet: FinishRecord[];
  rationales: Rationale[];
}

const LOUD_KINDS: readonly PersonalRecordKind[] = ['e1rm', 'max_load'];

/**
 * Closes the session and writes any new personal records. The engine decides
 * what counts as a record; this only persists what it returned.
 */
export async function finishSession(
  repos: Repositories,
  input: { workoutId: Id; status: 'completed' | 'abandoned'; unitSystem: UnitSystem },
): Promise<FinishSummary> {
  const workout = await repos.workouts.finish(input.workoutId, input.status);
  const withExercises = await repos.workouts.getWithExercises(input.workoutId);
  const slots = withExercises?.exercises ?? [];

  const celebrated: FinishRecord[] = [];
  const quiet: FinishRecord[] = [];
  const rationales: Rationale[] = [];
  let totalSets = 0;
  let totalVolumeKg = 0;

  for (const slot of slots) {
    const completed = slot.sets.filter((set) => set.completed && !set.isWarmup);
    totalSets += completed.length;
    totalVolumeKg += sessionVolumeKg({
      workoutId: workout.id,
      workoutExerciseId: slot.id,
      exerciseId: slot.exerciseId,
      date: workout.date,
      status: workout.status,
      targetRepMin: slot.targetRepMin,
      targetRepMax: slot.targetRepMax,
      targetLoadKg: slot.targetLoadKg,
      sets: slot.sets,
    });

    if (completed.length === 0) continue;

    const [exercise, existing] = await Promise.all([
      repos.exercises.get(slot.exerciseId),
      repos.records.listForExercise(slot.exerciseId),
    ]);

    const detection = detectPersonalRecords({
      exerciseId: slot.exerciseId,
      date: workout.date,
      sets: slot.sets,
      existing,
      unitSystem: input.unitSystem,
    });
    rationales.push(detection.rationale);

    for (const draft of detection.records) {
      await repos.records.create(draft);
      const record: FinishRecord = {
        exerciseId: draft.exerciseId,
        exerciseName: exercise?.name ?? 'Exercise',
        kind: draft.kind,
        value: draft.value,
        loadKg: draft.loadKg,
        reps: draft.reps,
      };
      if (LOUD_KINDS.includes(draft.kind)) celebrated.push(record);
      else quiet.push(record);
    }
  }

  return {
    workoutId: workout.id,
    startedAt: workout.startedAt,
    finishedAt: workout.finishedAt,
    totalSets,
    totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    celebrated,
    quiet,
    rationales,
  };
}
