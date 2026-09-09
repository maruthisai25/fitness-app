/**
 * Progression engine — DESIGN.md §5.1 (double progression).
 *
 * Input: the last 1–3 sessions of one exercise, the target rep range, the load
 * increment for the equipment used, the readiness modifier and the safety
 * state. Output: a `ProgressionDecision` whose every number the engine owns
 * (DESIGN.md §6.3 — the coach may only ask to hold or lighten).
 *
 * The seven rules are evaluated strictly in order:
 *
 *   1. safety active                        → hold load, one set off      SAFETY_HOLD
 *   2. readiness `reduce`                   → hold load, volume −30 %     READINESS_REDUCE
 *   3. readiness `hold`                     → hold load                   READINESS_HOLD
 *   4. all sets at top of range, RPE ≤ 8.5  → +1 increment, reps reset    PROGRESS_LOAD
 *   5. bodyweight / time / distance         → +reps, +10 % time, harder   PROGRESS_REPS
 *                                             variation                   PROGRESS_TIME
 *                                                                         PROGRESS_VARIATION
 *   6. below range and RPE ≥ 9.5 twice      → −1 increment                REGRESS_LOAD
 *   7. otherwise                            → hold, chase the next rep    HOLD_BUILD_REPS
 *                                             milestone
 */

import { makeRationale, formatReps, pluralize } from './rationale';
import { meanRpe, repsOf, sessionLoadKg, workingSets } from './setMath';
import type {
  ExerciseSession,
  Id,
  LoadType,
  ProgressionDecision,
  Rationale,
  ReadinessModifier,
  RepRange,
  UnitSystem,
} from './types';
import { formatLoad, roundLoadKgToAchievable, roundTo } from './units';

/** Rule 4 — mean RPE at or under this allows a load increase. */
export const RPE_PROGRESS_MAX = 8.5;
/** Rule 6 — mean RPE at or over this on two sessions triggers a regression. */
export const RPE_REGRESS_MIN = 9.5;
/** Rule 2 — readiness `reduce` keeps the load and takes 30 % of the volume off. */
export const READINESS_REDUCE_VOLUME_MULTIPLIER = 0.7;
/** Rule 5 — the time branch adds 10 %. */
export const TIME_PROGRESS_MULTIPLIER = 1.1;
/** Falls back to three working sets when there is nothing to carry over. */
export const DEFAULT_TARGET_SETS = 3;

/** Rest between working sets when the caller does not pin one, seconds. */
export const DEFAULT_REST_SEC: Record<LoadType, number> = {
  external: 120,
  assisted: 120,
  band: 90,
  bodyweight: 90,
  time: 60,
  distance: 60,
};

/** Load types whose progression is a heavier load rather than more reps. */
const LOADABLE: readonly LoadType[] = ['external', 'assisted', 'band'];

export function isLoadableLoadType(loadType: LoadType): boolean {
  return LOADABLE.includes(loadType);
}

/** The coach may request only these two overrides — DESIGN.md §6.3. */
export type CoachLoadOverride = 'hold' | 'lighter';

export interface ProgressionInput {
  exerciseId: Id;
  loadType: LoadType;
  /** The working rep range for this slot, usually `exercises.defaultRepRange`. */
  repRange: RepRange;
  /** Recent sessions of this exercise. Order does not matter; newest is used. */
  history: readonly ExerciseSession[];
  /** Smallest jump available with the equipment used, canonical kg. */
  loadIncrementKg: number;
  readinessModifier: ReadinessModifier;
  /** True while an unresolved `safety_events` row exists — DESIGN.md §6.5. */
  safetyActive: boolean;
  /** Only used to phrase the summary; storage stays metric. */
  unitSystem: UnitSystem;
  /** Overrides the set count carried over from the last session. */
  targetSets?: number;
  restSec?: number;
  /** `exercise_relations` target of kind `progression`, for rule 5. */
  progressionExerciseId?: Id | null;
  /** Load to start from when there is no history at all. */
  startingLoadKg?: number | null;
  /** DESIGN.md §6.3 — the model may ask to hold or lighten, with a reason. */
  coachOverride?: CoachLoadOverride | null;
  coachOverrideReason?: string | null;
}

interface Assembled {
  action: ProgressionDecision['action'];
  targetLoadKg: number | null;
  targetRepMin: number;
  targetRepMax: number;
  targetSets: number;
  suggestedExerciseId?: Id | null;
  codes: string[];
  facts: Record<string, unknown>;
  summary: string;
}

function loadPhrase(loadKg: number | null, unitSystem: UnitSystem, incrementKg: number): string {
  return loadKg == null ? 'the same resistance' : formatLoad(loadKg, unitSystem, incrementKg);
}

/**
 * Decides what to do next for one exercise. Pure — every input the rules read
 * is on `input`, including the readiness modifier and the safety state.
 */
export function decideProgression(input: ProgressionInput): ProgressionDecision {
  const {
    exerciseId,
    loadType,
    repRange,
    loadIncrementKg,
    readinessModifier,
    unitSystem,
    progressionExerciseId = null,
    startingLoadKg = null,
    coachOverride = null,
    coachOverrideReason = null,
  } = input;

  const history = [...input.history].sort((a, b) =>
    a.date > b.date ? -1 : a.date < b.date ? 1 : 0,
  );
  const last = history[0] ?? null;
  const lastWorking = last ? workingSets(last) : [];
  const lastReps = repsOf(lastWorking);
  const lastLoadKg = last ? sessionLoadKg(last) : startingLoadKg;
  const lastMeanRpe = meanRpe(lastWorking);
  const baseSets = input.targetSets ?? (lastWorking.length || DEFAULT_TARGET_SETS);
  const restSec = input.restSec ?? DEFAULT_REST_SEC[loadType];
  const loadable = isLoadableLoadType(loadType);

  const baseFacts: Record<string, unknown> = {
    loadType,
    repRange: { min: repRange.min, max: repRange.max },
    lastLoadKg,
    lastReps,
    meanRpe: lastMeanRpe,
    loadIncrementKg,
    sessionsConsidered: history.length,
  };

  const result = evaluate();

  const rationale: Rationale = makeRationale(
    result.codes,
    { ...baseFacts, ...result.facts },
    result.summary,
  );

  return {
    exerciseId,
    action: result.action,
    targetLoadKg: result.targetLoadKg,
    targetRepMin: result.targetRepMin,
    targetRepMax: result.targetRepMax,
    targetSets: result.targetSets,
    restSec,
    suggestedExerciseId: result.suggestedExerciseId ?? null,
    loadDeltaKg:
      result.targetLoadKg != null && lastLoadKg != null
        ? roundTo(result.targetLoadKg - lastLoadKg, 6)
        : 0,
    rationale,
  };

  function evaluate(): Assembled {
    // Rule 1 — safety interrupts progression (DESIGN.md §2.6, §5.1.1).
    if (input.safetyActive || readinessModifier === 'safety') {
      const sets = Math.max(1, baseSets - 1);
      return {
        action: 'reduce_volume',
        targetLoadKg: lastLoadKg,
        targetRepMin: repRange.min,
        targetRepMax: repRange.max,
        targetSets: sets,
        codes: ['SAFETY_HOLD'],
        facts: { targetSets: sets, setsRemoved: baseSets - sets },
        summary:
          `A safety event is open, so the load stays at ${loadPhrase(lastLoadKg, unitSystem, loadIncrementKg)} ` +
          `and one set comes off — ${pluralize(sets, 'set')} today.`,
      };
    }

    // Rule 2 — readiness says reduce: hold the load, drop 30 % of the volume.
    if (readinessModifier === 'reduce') {
      const sets = Math.max(1, Math.round(baseSets * READINESS_REDUCE_VOLUME_MULTIPLIER));
      return {
        action: 'reduce_volume',
        targetLoadKg: lastLoadKg,
        targetRepMin: repRange.min,
        targetRepMax: repRange.max,
        targetSets: sets,
        codes: ['READINESS_REDUCE'],
        facts: { targetSets: sets, volumeMultiplier: READINESS_REDUCE_VOLUME_MULTIPLIER },
        summary:
          `Your readiness came back low, so the load stays at ` +
          `${loadPhrase(lastLoadKg, unitSystem, loadIncrementKg)} and volume drops about 30 % to ` +
          `${pluralize(sets, 'set')}.`,
      };
    }

    // Rule 3 — readiness says hold.
    if (readinessModifier === 'hold') {
      return {
        action: 'hold_load',
        targetLoadKg: lastLoadKg,
        targetRepMin: repRange.min,
        targetRepMax: repRange.max,
        targetSets: baseSets,
        codes: ['READINESS_HOLD'],
        facts: { targetSets: baseSets },
        summary:
          `Readiness is middling, so today holds at ` +
          `${loadPhrase(lastLoadKg, unitSystem, loadIncrementKg)} rather than adding load.`,
      };
    }

    // DESIGN.md §6.3 — the coach may ask to hold or lighten, never to add load.
    if (coachOverride === 'hold') {
      return {
        action: 'hold_load',
        targetLoadKg: lastLoadKg,
        targetRepMin: repRange.min,
        targetRepMax: repRange.max,
        targetSets: baseSets,
        codes: ['COACH_OVERRIDE_HOLD'],
        facts: { targetSets: baseSets, coachOverrideReason },
        summary:
          `Holding at ${loadPhrase(lastLoadKg, unitSystem, loadIncrementKg)} as the coach asked` +
          `${coachOverrideReason ? `: ${coachOverrideReason}` : '.'}`,
      };
    }
    if (coachOverride === 'lighter' && lastLoadKg != null) {
      const target = roundLoadKgToAchievable(
        Math.max(0, lastLoadKg - loadIncrementKg),
        unitSystem,
        loadIncrementKg,
      );
      return {
        action: 'decrease_load',
        targetLoadKg: target,
        targetRepMin: repRange.min,
        targetRepMax: repRange.max,
        targetSets: baseSets,
        codes: ['COACH_OVERRIDE_LIGHTER'],
        facts: { targetSets: baseSets, coachOverrideReason },
        summary:
          `Taking one increment off, down to ${formatLoad(target, unitSystem, loadIncrementKg)}, ` +
          `as the coach asked${coachOverrideReason ? `: ${coachOverrideReason}` : '.'}`,
      };
    }

    const hasWork = lastWorking.length > 0;
    const allTopOfRange = hasWork && lastReps.every((reps) => reps >= repRange.max);
    // An unrated session cannot fail an RPE ceiling; it is recorded as unknown.
    const rpeUnderCeiling = lastMeanRpe == null || lastMeanRpe <= RPE_PROGRESS_MAX;
    const rpeCode = lastMeanRpe == null ? 'RPE_NOT_RATED' : 'RPE_UNDER_THRESHOLD';

    // Rule 4 — double progression: earn the top of the range, then add load.
    if (loadable && allTopOfRange && rpeUnderCeiling && lastLoadKg != null) {
      const target = roundLoadKgToAchievable(
        lastLoadKg + loadIncrementKg,
        unitSystem,
        loadIncrementKg,
      );
      return {
        action: 'increase_load',
        targetLoadKg: target,
        targetRepMin: repRange.min,
        targetRepMax: repRange.max,
        targetSets: baseSets,
        codes: ['PROGRESS_LOAD', 'ALL_SETS_TOP_OF_RANGE', rpeCode],
        facts: {
          targetSets: baseSets,
          targetRepsPerSet: repRange.min,
          previousLoadKg: lastLoadKg,
          newLoadKg: target,
        },
        summary:
          `You hit ${repRange.max} reps on ${pluralize(lastReps.length, 'set')} at ` +
          `${formatLoad(lastLoadKg, unitSystem, loadIncrementKg)}, so the load goes up to ` +
          `${formatLoad(target, unitSystem, loadIncrementKg)} and the target resets to ` +
          `${repRange.min} reps.`,
      };
    }

    // Rule 5 — nothing to load: progress reps, time, or the variation itself.
    if (!loadable && allTopOfRange && rpeUnderCeiling) {
      if (loadType === 'time' || loadType === 'distance') {
        const min = Math.round(repRange.min * TIME_PROGRESS_MULTIPLIER);
        const max = Math.round(repRange.max * TIME_PROGRESS_MULTIPLIER);
        return {
          action: 'increase_time',
          targetLoadKg: null,
          targetRepMin: min,
          targetRepMax: max,
          targetSets: baseSets,
          codes: ['PROGRESS_TIME'],
          facts: {
            targetSets: baseSets,
            previousTarget: repRange,
            multiplier: TIME_PROGRESS_MULTIPLIER,
          },
          summary:
            `You held the top of the range, so the target goes up 10 % to ${min}–${max} ` +
            `${loadType === 'time' ? 'seconds' : 'metres'}.`,
        };
      }

      const topOfRangeStreak = countLeadingSessionsAtTopOfRange(history, repRange);
      if (progressionExerciseId != null && topOfRangeStreak >= 2) {
        return {
          action: 'progress_variation',
          targetLoadKg: null,
          targetRepMin: repRange.min,
          targetRepMax: repRange.max,
          targetSets: baseSets,
          suggestedExerciseId: progressionExerciseId,
          codes: ['PROGRESS_VARIATION'],
          facts: { targetSets: baseSets, topOfRangeStreak },
          summary:
            `You have topped the rep range ${countLeadingLabel(topOfRangeStreak)} in a row, ` +
            `so the next step is the harder variation at ${repRange.min}–${repRange.max} reps.`,
        };
      }

      const bump = lastMeanRpe != null && lastMeanRpe <= 7 ? 2 : 1;
      return {
        action: 'increase_reps',
        targetLoadKg: lastLoadKg,
        targetRepMin: repRange.min + bump,
        targetRepMax: repRange.max + bump,
        targetSets: baseSets,
        codes: ['PROGRESS_REPS', rpeCode],
        facts: { targetSets: baseSets, repBump: bump },
        summary:
          `You finished every set at ${repRange.max} reps, so the range moves up to ` +
          `${repRange.min + bump}–${repRange.max + bump}.`,
      };
    }

    // Rule 6 — two hard sessions under the range: back the load off one step.
    if (loadable && lastLoadKg != null && history.length >= 2) {
      const failedNow = sessionUnderRangeAndHard(history[0], repRange);
      const failedBefore = sessionUnderRangeAndHard(history[1], repRange);
      if (failedNow && failedBefore) {
        const target = roundLoadKgToAchievable(
          Math.max(0, lastLoadKg - loadIncrementKg),
          unitSystem,
          loadIncrementKg,
        );
        return {
          action: 'decrease_load',
          targetLoadKg: target,
          targetRepMin: repRange.min,
          targetRepMax: repRange.max,
          targetSets: baseSets,
          codes: ['REGRESS_LOAD', 'BELOW_RANGE_TWO_SESSIONS', 'RPE_OVER_THRESHOLD'],
          facts: {
            targetSets: baseSets,
            previousLoadKg: lastLoadKg,
            newLoadKg: target,
            previousMeanRpe: meanRpe(workingSets(history[1])),
          },
          summary:
            `Two sessions in a row fell under ${repRange.min} reps at RPE ` +
            `${RPE_REGRESS_MIN} or above, so the load comes down to ` +
            `${formatLoad(target, unitSystem, loadIncrementKg)}.`,
        };
      }
    }

    // Rule 7 — hold and chase the next rep milestone.
    if (!hasWork) {
      return {
        action: 'hold_load',
        targetLoadKg: lastLoadKg,
        targetRepMin: repRange.min,
        targetRepMax: repRange.max,
        targetSets: baseSets,
        codes: ['NO_HISTORY', 'HOLD_BUILD_REPS'],
        facts: { targetSets: baseSets, nextMilestoneReps: repRange.min },
        summary:
          `No logged sets for this exercise yet, so start at ` +
          `${loadPhrase(lastLoadKg, unitSystem, loadIncrementKg)} and aim for ${repRange.min}–` +
          `${repRange.max} reps.`,
      };
    }

    const worstReps = Math.min(...lastReps);
    const milestone =
      worstReps < repRange.min ? repRange.min : Math.min(worstReps + 1, repRange.max);
    return {
      action: 'hold_load',
      targetLoadKg: lastLoadKg,
      targetRepMin: repRange.min,
      targetRepMax: repRange.max,
      targetSets: baseSets,
      codes: ['HOLD_BUILD_REPS'],
      facts: { targetSets: baseSets, nextMilestoneReps: milestone, worstSetReps: worstReps },
      summary:
        `You logged ${formatReps(lastReps)} at ` +
        `${loadPhrase(lastLoadKg, unitSystem, loadIncrementKg)}; keep the load and build toward ` +
        `${milestone} reps on every set.`,
    };
  }
}

/** True when any working set fell under the range and the session felt maximal. */
function sessionUnderRangeAndHard(session: ExerciseSession, repRange: RepRange): boolean {
  const sets = workingSets(session);
  if (sets.length === 0) return false;
  const anyBelow = sets.some((set) => (set.actualReps ?? 0) < repRange.min);
  const rpe = meanRpe(sets);
  return anyBelow && rpe != null && rpe >= RPE_REGRESS_MIN;
}

/** How many of the most recent sessions ended with every set at the top of range. */
function countLeadingSessionsAtTopOfRange(
  history: readonly ExerciseSession[],
  repRange: RepRange,
): number {
  let streak = 0;
  for (const session of history) {
    const sets = workingSets(session);
    if (sets.length === 0) break;
    if (!repsOf(sets).every((reps) => reps >= repRange.max)) break;
    streak += 1;
  }
  return streak;
}

function countLeadingLabel(streak: number): string {
  return streak === 2 ? 'twice' : `${streak} sessions`;
}
