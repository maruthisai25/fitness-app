/**
 * Training tools — DESIGN.md §6.3.
 *
 * `propose_workout` is the load-bearing one. The model supplies exercise
 * selection, order, set counts and rest, and may ask for a `hold` or `lighter`
 * override with a reason. Every load and every rep target comes back from
 * `decideProgression` in `@vigor/core`; the model's numbers for those are not
 * accepted — the input schema has no field for them, and it is strict, so an
 * attempt to smuggle one in is a validation error rather than a silent write.
 */

import {
  exerciseCostSeconds,
  mergeRationales,
  withCodes,
  workoutPlanSchema,
  type Exercise,
  type LocalDate,
  type ProgressionDecision,
  type ReadinessModifier,
  type UnitSystem,
  type WorkoutPlan,
  type WorkoutPlanExercise,
} from '@vigor/core';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import type { CoachDeps } from '../deps';
import {
  availableCategories,
  dislikedExerciseIds,
  exercisedIds,
  fail,
  idInput,
  loadFields,
  loadingCategoryOf,
  localDateInput,
  ok,
  unitSystemOf,
} from './shared';

/** The two overrides the coach is allowed to ask for — DESIGN.md §6.3. */
const overrideInput = z.enum(['hold', 'lighter']);

/** Today's readiness modifier, with the safety state folded in (DESIGN.md §5.1 rule 1). */
async function modifierFor(
  deps: CoachDeps,
  date: LocalDate,
): Promise<{ modifier: ReadinessModifier; safetyActive: boolean; readinessId: string | null }> {
  const [readiness, safetyActive] = await Promise.all([
    deps.repos.readiness.getByDate(date),
    deps.repos.safety.isActive(),
  ]);
  const assessment = deps.engines.assessReadiness(readiness, date);
  return {
    modifier: safetyActive ? 'safety' : assessment.modifier,
    safetyActive,
    readinessId: readiness?.id ?? null,
  };
}

export interface DecideForExerciseOptions {
  exercise: Exercise;
  unitSystem: UnitSystem;
  modifier: ReadinessModifier;
  safetyActive: boolean;
  targetSets?: number;
  restSec?: number;
  override?: 'hold' | 'lighter' | null;
  overrideReason?: string | null;
}

/**
 * Runs the progression engine for one exercise with the user's real history and
 * their real equipment increment. Nothing here decides a number itself.
 */
export async function decideForExercise(
  deps: CoachDeps,
  options: DecideForExerciseOptions,
): Promise<ProgressionDecision> {
  const { exercise, unitSystem, modifier, safetyActive } = options;
  const [history, equipment, progressions] = await Promise.all([
    deps.repos.workouts.getExerciseHistory(exercise.id, { limit: 3 }),
    deps.repos.equipment.list(),
    deps.repos.exercises.getRelated(exercise.id, 'progression'),
  ]);

  const category = loadingCategoryOf(exercise);
  const equipmentRow = equipment.find((row) => row.category === category && row.available) ?? null;
  const lastLoadKg =
    history[0]?.sets.find((set) => !set.isWarmup && set.actualLoadKg != null)?.actualLoadKg ?? null;

  const loadIncrementKg = deps.engines.resolveLoadIncrementKg({
    category,
    unitSystem,
    overrideKg: equipmentRow?.loadIncrementKg ?? null,
    currentLoadKg: lastLoadKg,
  });

  return deps.engines.decideProgression({
    exerciseId: exercise.id,
    loadType: exercise.loadType,
    repRange: exercise.defaultRepRange,
    history,
    loadIncrementKg,
    readinessModifier: modifier,
    safetyActive,
    unitSystem,
    ...(options.targetSets == null ? {} : { targetSets: options.targetSets }),
    ...(options.restSec == null ? {} : { restSec: options.restSec }),
    progressionExerciseId: progressions[0]?.id ?? null,
    startingLoadKg: lastLoadKg,
    coachOverride: options.override ?? null,
    coachOverrideReason: options.overrideReason ?? null,
  });
}

function planExerciseFrom(
  decision: ProgressionDecision,
  order: number,
  extras: { tempo?: string | null; notes?: string | null; substitutedFromExerciseId?: string | null },
): WorkoutPlanExercise {
  return {
    exerciseId: decision.exerciseId,
    order,
    targetSets: decision.targetSets,
    targetRepMin: decision.targetRepMin,
    targetRepMax: decision.targetRepMax,
    targetLoadKg: decision.targetLoadKg,
    restSec: decision.restSec,
    tempo: extras.tempo ?? null,
    substitutedFromExerciseId: extras.substitutedFromExerciseId ?? null,
    progressionDecision: decision,
    notes: extras.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tool factories
// ---------------------------------------------------------------------------

export function getExerciseHistoryTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'get_exercise_history',
    description:
      'Every logged set of one exercise, newest session first: reps, load in kilograms, RPE and whether the ' +
      'set was completed. Use it before you talk about how an exercise is going — the context block only ' +
      'carries a summary line per session. Do NOT use the numbers here to invent the next load yourself; ' +
      'propose_workout runs the progression engine for that. Do NOT call it with an exercise name — it takes ' +
      'a library id.',
    inputSchema: z.strictObject({
      exerciseId: idInput.describe('Library id, e.g. ex_barbell_back_squat'),
      limit: z.number().int().min(1).max(20).optional().describe('Sessions to return, default 5'),
    }),
    run: async ({ exerciseId, limit }) => {
      const exercise = await deps.repos.exercises.get(exerciseId);
      if (exercise == null) return fail(`No exercise with id ${exerciseId}.`, 'Call search_exercises first.');
      const unitSystem = await unitSystemOf(deps.repos);
      const sessions = await deps.repos.workouts.getExerciseHistory(exerciseId, {
        limit: limit ?? 5,
      });
      return ok({
        exerciseId,
        name: exercise.name,
        loadType: exercise.loadType,
        defaultRepRange: exercise.defaultRepRange,
        sessions: sessions.map((session) => ({
          date: session.date,
          status: session.status,
          targetRepMin: session.targetRepMin,
          targetRepMax: session.targetRepMax,
          target: loadFields(session.targetLoadKg, unitSystem),
          sets: session.sets.map((set) => ({
            setIndex: set.setIndex,
            isWarmup: set.isWarmup,
            completed: set.completed,
            targetReps: set.targetReps,
            actualReps: set.actualReps,
            ...loadFields(set.actualLoadKg, unitSystem),
            rpe: set.rpe,
          })),
        })),
      });
    },
  });
}

export function searchExercisesTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'search_exercises',
    description:
      'Look up exercises in the library by movement pattern, muscle, required equipment or name. Returns ids ' +
      'you can pass to propose_workout. Do NOT invent an exercise id, and do NOT propose an exercise whose ' +
      'equipment the user does not have — the result marks each row with whether their kit covers it.',
    inputSchema: z.strictObject({
      pattern: z
        .enum([
          'squat',
          'hinge',
          'lunge',
          'horizontal_push',
          'vertical_push',
          'horizontal_pull',
          'vertical_pull',
          'carry',
          'core',
          'isolation',
          'cardio',
          'mobility',
        ])
        .optional(),
      muscle: z.string().min(2).max(40).optional().describe('Matches primary or secondary muscles'),
      equipment: z
        .array(
          z.enum([
            'barbell',
            'dumbbell',
            'kettlebell',
            'band',
            'machine',
            'cable',
            'bodyweight',
            'cardio',
            'other',
          ]),
        )
        .max(4)
        .optional(),
      query: z.string().min(2).max(60).optional().describe('Substring of the exercise name'),
      limit: z.number().int().min(1).max(40).optional(),
    }),
    run: async (input) => {
      const owned = new Set(await availableCategories(deps.repos));
      const results = await deps.repos.exercises.search({
        ...(input.pattern == null ? {} : { pattern: input.pattern }),
        ...(input.muscle == null ? {} : { muscle: input.muscle }),
        ...(input.equipment == null ? {} : { equipment: input.equipment }),
        ...(input.query == null ? {} : { query: input.query }),
        limit: input.limit ?? 20,
      });
      return ok({
        count: results.length,
        exercises: results.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          movementPattern: exercise.movementPattern,
          equipment: exercise.equipment,
          difficulty: exercise.difficulty,
          loadType: exercise.loadType,
          primaryMuscles: exercise.primaryMuscles,
          userHasEquipment: exercise.equipment.every(
            (category) => category === 'bodyweight' || owned.has(category),
          ),
        })),
      });
    },
  });
}

export function getWorkoutsTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'get_workouts',
    description:
      'Sessions in a date range with their exercises and logged sets. Use it for anything older than the last ' +
      'seven workouts in the context block. Do NOT use it to change anything — it only reads.',
    inputSchema: z.strictObject({
      from: localDateInput,
      to: localDateInput,
    }),
    run: async ({ from, to }) => {
      if (from > to) return fail('`from` is after `to`.');
      const unitSystem = await unitSystemOf(deps.repos);
      const workouts = await deps.repos.workouts.listRange({ from, to });
      const detailed = await Promise.all(
        workouts.map(async (workout) => {
          const exercises = await deps.repos.workouts.listExercises(workout.id);
          return {
            id: workout.id,
            date: workout.date,
            status: workout.status,
            source: workout.source,
            title: workout.title,
            plannedDurationMin: workout.plannedDurationMin,
            exercises: exercises.map((entry) => ({
              workoutExerciseId: entry.id,
              exerciseId: entry.exerciseId,
              order: entry.order,
              targetSets: entry.targetSets,
              targetRepMin: entry.targetRepMin,
              targetRepMax: entry.targetRepMax,
              target: loadFields(entry.targetLoadKg, unitSystem),
              sets: entry.sets.map((set) => ({
                setIndex: set.setIndex,
                actualReps: set.actualReps,
                ...loadFields(set.actualLoadKg, unitSystem),
                rpe: set.rpe,
                completed: set.completed,
                isWarmup: set.isWarmup,
              })),
            })),
          };
        }),
      );
      return ok({ from, to, count: detailed.length, workouts: detailed });
    },
  });
}

export function proposeWorkoutTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'propose_workout',
    description:
      "Save a planned session for one day. You choose the exercises, their order, how many sets and how long " +
      'the rest is. You do NOT choose loads or rep targets: there is no field for them, and the progression ' +
      'engine fills them in from this person\'s own history, their equipment increment, today\'s readiness and ' +
      'the safety state. If you want a lighter day, set `override` to "hold" or "lighter" on the exercises it ' +
      'applies to and give a reason — never ask for more load. Describing a session in prose saves nothing; ' +
      'this call is what makes a plan real. Call it once per session, and use adjust_workout to change one ' +
      'that already exists.',
    inputSchema: z.strictObject({
      date: localDateInput.optional().describe("Defaults to today"),
      title: z.string().min(1).max(80).describe('Short session name, e.g. "Lower body strength"'),
      focus: z.array(z.string().min(2).max(30)).max(6).optional().describe('Muscle groups trained'),
      plannedDurationMin: z.number().int().min(5).max(240),
      summary: z
        .string()
        .min(10)
        .max(300)
        .describe('One sentence on why this session, for the "Why?" panel'),
      notes: z.string().max(500).nullish(),
      exercises: z
        .array(
          z.strictObject({
            exerciseId: idInput,
            order: z.number().int().min(0).max(30),
            targetSets: z.number().int().min(1).max(10),
            restSec: z.number().int().min(15).max(600),
            tempo: z.string().max(20).nullish(),
            notes: z.string().max(300).nullish(),
            override: overrideInput.nullish().describe('Ask the engine to hold or lighten this lift'),
            overrideReason: z.string().min(3).max(200).nullish(),
          }),
        )
        .min(1)
        .max(12),
    }),
    run: async (input) => {
      const date = input.date ?? deps.clock.today();
      const unitSystem = await unitSystemOf(deps.repos);
      const { modifier, safetyActive, readinessId } = await modifierFor(deps, date);

      const ordered = [...input.exercises].sort((a, b) => a.order - b.order);
      const seen = new Set<string>();
      const planExercises: WorkoutPlanExercise[] = [];
      const decisions: ProgressionDecision[] = [];

      for (const [index, entry] of ordered.entries()) {
        if (seen.has(entry.exerciseId)) {
          return fail(
            `${entry.exerciseId} appears twice.`,
            'List each exercise once and use targetSets for the volume.',
          );
        }
        seen.add(entry.exerciseId);

        const exercise = await deps.repos.exercises.get(entry.exerciseId);
        if (exercise == null) {
          return fail(`No exercise with id ${entry.exerciseId}.`, 'Call search_exercises for valid ids.');
        }
        if (entry.override != null && (entry.overrideReason ?? '').trim().length === 0) {
          return fail(
            `The ${entry.override} override on ${exercise.name} needs a reason.`,
            'Say what you saw that makes today lighter.',
          );
        }

        const decision = await decideForExercise(deps, {
          exercise,
          unitSystem,
          modifier,
          safetyActive,
          targetSets: entry.targetSets,
          restSec: entry.restSec,
          override: entry.override ?? null,
          overrideReason: entry.overrideReason ?? null,
        });
        decisions.push(decision);
        planExercises.push(
          planExerciseFrom(decision, index, { tempo: entry.tempo, notes: entry.notes }),
        );
      }

      const rationale = withCodes(
        mergeRationales(input.summary, ...decisions.map((decision) => decision.rationale)),
        'COACH_PROPOSED',
        ...(safetyActive ? ['SAFETY_ACTIVE'] : []),
      );

      const plan: WorkoutPlan = {
        date,
        title: input.title,
        focus: input.focus ?? [],
        plannedDurationMin: input.plannedDurationMin,
        source: 'ai',
        exercises: planExercises,
        readinessId,
        notes: input.notes ?? null,
        rationale,
      };

      const parsed = workoutPlanSchema.safeParse(plan);
      if (!parsed.success) {
        return fail(
          'The assembled plan failed validation.',
          parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
        );
      }

      const workout = await deps.repos.workouts.createPlanned(plan);
      const names = new Map(
        (await deps.repos.exercises.getMany(planExercises.map((entry) => entry.exerciseId))).map(
          (exercise) => [exercise.id, exercise.name] as const,
        ),
      );

      return ok({
        workoutId: workout.id,
        date: workout.date,
        status: workout.status,
        title: workout.title,
        plannedDurationMin: workout.plannedDurationMin,
        readinessModifier: modifier,
        safetyActive,
        exercises: planExercises.map((entry) => ({
          order: entry.order,
          exerciseId: entry.exerciseId,
          name: names.get(entry.exerciseId) ?? entry.exerciseId,
          targetSets: entry.targetSets,
          targetRepMin: entry.targetRepMin,
          targetRepMax: entry.targetRepMax,
          ...loadFields(entry.targetLoadKg, unitSystem),
          restSec: entry.restSec,
          action: entry.progressionDecision?.action ?? null,
          why: entry.progressionDecision?.rationale.summary ?? null,
        })),
        rationale,
      });
    },
  });
}

export function substituteExerciseTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'substitute_exercise',
    description:
      'Swap one exercise in a saved session for the closest alternative the user can actually do. The ' +
      'substitution engine ranks candidates on movement pattern, muscle overlap, equipment and difficulty, ' +
      'and the top pick is applied for you. Do NOT pick the replacement yourself and do NOT re-plan the whole ' +
      'session for one swap — the engine also re-runs progression for the new lift.',
    inputSchema: z.strictObject({
      workoutExerciseId: idInput.describe('Row id from get_workouts, not a library id'),
      reason: z
        .enum(['equipment_unavailable', 'pain', 'disliked', 'too_hard', 'too_easy', 'variety', 'other'])
        .describe('Why the swap is needed. "pain" also belongs in report_safety.'),
    }),
    run: async ({ workoutExerciseId, reason }) => {
      const entry = await deps.repos.workouts.getExercise(workoutExerciseId);
      if (entry == null) return fail(`No workout exercise with id ${workoutExerciseId}.`);
      const workout = await deps.repos.workouts.get(entry.workoutId);
      const date = workout?.date ?? deps.clock.today();

      const [exercises, relations, available, disliked, exercised, unitSystem] = await Promise.all([
        deps.repos.exercises.list(),
        deps.repos.exercises.listRelations(),
        availableCategories(deps.repos),
        dislikedExerciseIds(deps.repos),
        exercisedIds(deps.repos, date),
        unitSystemOf(deps.repos),
      ]);

      const siblings = await deps.repos.workouts.listExercises(entry.workoutId);
      const result = deps.engines.substitute(entry.exerciseId, reason, {
        exercises,
        relations,
        availableEquipment: available,
        exercisedIds: exercised,
        dislikedExerciseIds: disliked,
        excludeExerciseIds: siblings
          .filter((row) => row.id !== workoutExerciseId)
          .map((row) => row.exerciseId),
      });

      if (result.candidates.length === 0) {
        return fail('No substitute matches that movement pattern with the equipment available.', result.rationale.summary);
      }

      const pick = result.candidates[0];
      const replacement = exercises.find((exercise) => exercise.id === pick.exerciseId);
      if (replacement == null) return fail(`Ranked exercise ${pick.exerciseId} is missing from the library.`);

      const { modifier, safetyActive } = await modifierFor(deps, date);
      const decision = await decideForExercise(deps, {
        exercise: replacement,
        unitSystem,
        modifier,
        safetyActive,
        targetSets: entry.targetSets,
        restSec: entry.restSec,
      });

      const updated = await deps.repos.workouts.updateExercise(workoutExerciseId, {
        exerciseId: replacement.id,
        substitutedFromExerciseId: entry.exerciseId,
        targetSets: decision.targetSets,
        targetRepMin: decision.targetRepMin,
        targetRepMax: decision.targetRepMax,
        targetLoadKg: decision.targetLoadKg,
        restSec: decision.restSec,
        progressionDecision: decision,
      });

      return ok({
        workoutExerciseId,
        replacedExerciseId: entry.exerciseId,
        applied: {
          exerciseId: replacement.id,
          name: replacement.name,
          targetSets: updated.targetSets,
          targetRepMin: updated.targetRepMin,
          targetRepMax: updated.targetRepMax,
          ...loadFields(updated.targetLoadKg, unitSystem),
          restSec: updated.restSec,
          why: decision.rationale.summary,
        },
        alternatives: result.candidates.slice(1).map((candidate) => ({
          exerciseId: candidate.exerciseId,
          name: candidate.name,
          score: candidate.score,
          why: candidate.rationale.summary,
        })),
        rationale: result.rationale,
      });
    },
  });
}

export function adjustWorkoutTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'adjust_workout',
    description:
      "Shorten or lighten a session that is already saved. `durationMin` trims exercises off the end until the " +
      'session fits the time available; `intensity` re-runs the progression engine with a hold or lighter ' +
      'override; `dropExercises` removes specific rows. Do NOT use this to add load, add exercises, or build a ' +
      'new session — use propose_workout for a new plan.',
    inputSchema: z.strictObject({
      workoutId: idInput,
      durationMin: z.number().int().min(5).max(240).optional().describe('New time budget'),
      intensity: overrideInput.optional().describe('"hold" keeps the load, "lighter" takes one increment off'),
      intensityReason: z.string().min(3).max(200).optional(),
      dropExercises: z.array(idInput).max(12).optional().describe('workoutExerciseId rows to remove'),
    }),
    run: async (input) => {
      const workout = await deps.repos.workouts.getWithExercises(input.workoutId);
      if (workout == null) return fail(`No workout with id ${input.workoutId}.`);
      if (workout.status === 'completed') {
        return fail('That session is already completed.', 'Plan the next one with propose_workout instead.');
      }
      if (input.intensity != null && (input.intensityReason ?? '').trim().length === 0) {
        return fail('An intensity change needs a reason.', 'Say what makes today lighter.');
      }

      const unitSystem = await unitSystemOf(deps.repos);
      const { modifier, safetyActive } = await modifierFor(deps, workout.date);
      const dropped = new Set(input.dropExercises ?? []);

      let remaining = workout.exercises
        .filter((entry) => !dropped.has(entry.id))
        .sort((a, b) => a.order - b.order);

      for (const entry of workout.exercises) {
        if (dropped.has(entry.id)) await deps.repos.workouts.removeExercise(entry.id);
      }

      if (input.durationMin != null) {
        const budgetSeconds = input.durationMin * 60;
        const kept: typeof remaining = [];
        let spent = 0;
        for (const entry of remaining) {
          const cost = exerciseCostSeconds(entry.targetSets, entry.restSec);
          if (kept.length > 0 && spent + cost > budgetSeconds) break;
          kept.push(entry);
          spent += cost;
        }
        for (const entry of remaining) {
          if (!kept.includes(entry)) await deps.repos.workouts.removeExercise(entry.id);
        }
        remaining = kept;
      }

      const applied: Record<string, unknown>[] = [];
      for (const entry of remaining) {
        if (input.intensity == null) {
          applied.push({
            workoutExerciseId: entry.id,
            exerciseId: entry.exerciseId,
            targetSets: entry.targetSets,
            targetRepMin: entry.targetRepMin,
            targetRepMax: entry.targetRepMax,
            ...loadFields(entry.targetLoadKg, unitSystem),
            restSec: entry.restSec,
          });
          continue;
        }
        const exercise = await deps.repos.exercises.get(entry.exerciseId);
        if (exercise == null) continue;
        const decision = await decideForExercise(deps, {
          exercise,
          unitSystem,
          modifier,
          safetyActive,
          targetSets: entry.targetSets,
          restSec: entry.restSec,
          override: input.intensity,
          overrideReason: input.intensityReason ?? null,
        });
        const updated = await deps.repos.workouts.updateExercise(entry.id, {
          targetSets: decision.targetSets,
          targetRepMin: decision.targetRepMin,
          targetRepMax: decision.targetRepMax,
          targetLoadKg: decision.targetLoadKg,
          restSec: decision.restSec,
          progressionDecision: decision,
        });
        applied.push({
          workoutExerciseId: entry.id,
          exerciseId: entry.exerciseId,
          name: exercise.name,
          targetSets: updated.targetSets,
          targetRepMin: updated.targetRepMin,
          targetRepMax: updated.targetRepMax,
          ...loadFields(updated.targetLoadKg, unitSystem),
          restSec: updated.restSec,
          why: decision.rationale.summary,
        });
      }

      const reordered = await deps.repos.workouts.reorderExercises(
        workout.id,
        remaining.map((entry) => entry.id),
      );
      const seconds = reordered.reduce(
        (total, entry) => total + exerciseCostSeconds(entry.targetSets, entry.restSec),
        0,
      );
      const updatedWorkout = await deps.repos.workouts.update(workout.id, {
        plannedDurationMin: input.durationMin ?? Math.max(5, Math.round(seconds / 60)),
      });

      return ok({
        workoutId: workout.id,
        plannedDurationMin: updatedWorkout.plannedDurationMin,
        estimatedMinutes: Math.round(seconds / 60),
        droppedCount: workout.exercises.length - reordered.length,
        exercises: applied,
      });
    },
  });
}
