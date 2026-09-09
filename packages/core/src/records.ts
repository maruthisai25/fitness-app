/**
 * PR & streak engine — DESIGN.md §5.7.
 *
 * After every completed set: estimate 1RM with Epley (`load × (1 + reps/30)`,
 * only for reps ≤ 12) and compare with the stored `personal_records`. Streaks
 * count planned-day completions; a rest day never breaks a streak.
 */

import { addDays } from './dates';
import { makeRationale, pluralize } from './rationale';
import { epleyE1rm } from './setMath';
import type {
  Id,
  LocalDate,
  PersonalRecord,
  PersonalRecordKind,
  Rationale,
  SetRecord,
  UnitSystem,
} from './types';
import { formatLoad, roundTo } from './units';

/** A record row before the repository gives it an id. */
export type PersonalRecordDraft = Omit<PersonalRecord, 'id'>;

export interface PersonalRecordInput {
  exerciseId: Id;
  date: LocalDate;
  /** The sets logged in this session; warmups and incompletes are ignored. */
  sets: readonly SetRecord[];
  /** Existing records for this exercise. */
  existing: readonly PersonalRecord[];
  unitSystem?: UnitSystem;
}

export interface PersonalRecordResult {
  records: PersonalRecordDraft[];
  rationale: Rationale;
}

function bestExisting(
  existing: readonly PersonalRecord[],
  kind: PersonalRecordKind,
  loadKg?: number,
): PersonalRecord | null {
  let best: PersonalRecord | null = null;
  for (const record of existing) {
    if (record.kind !== kind) continue;
    if (loadKg != null && record.loadKg !== loadKg) continue;
    if (best == null || record.value > best.value) best = record;
  }
  return best;
}

/**
 * Finds every new personal record set in one session. Deterministic — the same
 * session and the same history always produce the same rows.
 */
export function detectPersonalRecords(input: PersonalRecordInput): PersonalRecordResult {
  const { exerciseId, date, existing } = input;
  const unitSystem = input.unitSystem ?? 'metric';
  const sets = input.sets.filter(
    (set) => !set.isWarmup && set.completed && (set.actualReps ?? 0) > 0,
  );

  const records: PersonalRecordDraft[] = [];
  const codes: string[] = [];
  const facts: Record<string, unknown> = { exerciseId, date, workingSets: sets.length };

  if (sets.length === 0) {
    return {
      records: [],
      rationale: makeRationale(
        ['NO_COMPLETED_SETS'],
        facts,
        'No completed working sets in this session, so there is nothing to compare against your records.',
      ),
    };
  }

  // e1RM — Epley, reps ≤ 12 only.
  let bestE1rmSet: { set: SetRecord; value: number } | null = null;
  for (const set of sets) {
    const value = epleyE1rm(set.actualLoadKg, set.actualReps);
    if (value != null && (bestE1rmSet == null || value > bestE1rmSet.value)) {
      bestE1rmSet = { set, value };
    }
  }
  const previousE1rm = bestExisting(existing, 'e1rm');
  facts.sessionBestE1rm = bestE1rmSet?.value ?? null;
  facts.previousBestE1rm = previousE1rm?.value ?? null;
  if (bestE1rmSet && (previousE1rm == null || bestE1rmSet.value > previousE1rm.value)) {
    records.push({
      exerciseId,
      kind: 'e1rm',
      value: bestE1rmSet.value,
      loadKg: bestE1rmSet.set.actualLoadKg,
      reps: bestE1rmSet.set.actualReps,
      setId: bestE1rmSet.set.id,
      date,
    });
    codes.push('PR_E1RM');
  }

  // max_load — heaviest load moved for at least one rep.
  let heaviest: SetRecord | null = null;
  for (const set of sets) {
    if (set.actualLoadKg == null) continue;
    if (heaviest == null || set.actualLoadKg > (heaviest.actualLoadKg ?? 0)) heaviest = set;
  }
  const previousLoad = bestExisting(existing, 'max_load');
  facts.sessionMaxLoadKg = heaviest?.actualLoadKg ?? null;
  facts.previousMaxLoadKg = previousLoad?.value ?? null;
  if (
    heaviest?.actualLoadKg != null &&
    (previousLoad == null || heaviest.actualLoadKg > previousLoad.value)
  ) {
    records.push({
      exerciseId,
      kind: 'max_load',
      value: heaviest.actualLoadKg,
      loadKg: heaviest.actualLoadKg,
      reps: heaviest.actualReps,
      setId: heaviest.id,
      date,
    });
    codes.push('PR_MAX_LOAD');
  }

  // max_reps_at_load — most reps ever done at a given load.
  const bestRepsByLoad = new Map<number, SetRecord>();
  for (const set of sets) {
    if (set.actualLoadKg == null) continue;
    const current = bestRepsByLoad.get(set.actualLoadKg);
    if (current == null || (set.actualReps ?? 0) > (current.actualReps ?? 0)) {
      bestRepsByLoad.set(set.actualLoadKg, set);
    }
  }
  for (const [loadKg, set] of [...bestRepsByLoad.entries()].sort((a, b) => a[0] - b[0])) {
    const previous = bestExisting(existing, 'max_reps_at_load', loadKg);
    if (previous != null && (set.actualReps ?? 0) <= previous.value) continue;
    records.push({
      exerciseId,
      kind: 'max_reps_at_load',
      value: set.actualReps ?? 0,
      loadKg,
      reps: set.actualReps,
      setId: set.id,
      date,
    });
    codes.push('PR_MAX_REPS_AT_LOAD');
  }

  // session_volume — Σ reps × load across the session.
  const sessionVolume = roundTo(
    sets.reduce((total, set) => total + (set.actualReps ?? 0) * (set.actualLoadKg ?? 0), 0),
    3,
  );
  const previousVolume = bestExisting(existing, 'session_volume');
  facts.sessionVolumeKg = sessionVolume;
  facts.previousSessionVolumeKg = previousVolume?.value ?? null;
  if (sessionVolume > 0 && (previousVolume == null || sessionVolume > previousVolume.value)) {
    records.push({
      exerciseId,
      kind: 'session_volume',
      value: sessionVolume,
      loadKg: null,
      reps: null,
      setId: null,
      date,
    });
    codes.push('PR_SESSION_VOLUME');
  }

  if (records.length === 0) {
    return {
      records,
      rationale: makeRationale(
        ['NO_NEW_PR'],
        facts,
        'Solid session, but nothing beat your existing records for this exercise.',
      ),
    };
  }

  const headline =
    bestE1rmSet && codes.includes('PR_E1RM')
      ? `New estimated 1RM of ${formatLoad(bestE1rmSet.value, unitSystem)} from ` +
        `${bestE1rmSet.set.actualReps} reps at ` +
        `${formatLoad(bestE1rmSet.set.actualLoadKg ?? 0, unitSystem)}.`
      : `You set ${pluralize(records.length, 'new personal record')} in this session.`;

  return { records, rationale: makeRationale(codes, facts, headline) };
}

// ---------------------------------------------------------------------------
// Streaks — DESIGN.md §5.7
// ---------------------------------------------------------------------------

/** One calendar day as the streak engine sees it. */
export interface StreakDay {
  date: LocalDate;
  /** True when a workout was scheduled for this day. */
  planned: boolean;
  /** True when a workout on this day reached `completed`. */
  completed: boolean;
}

export interface StreakResult {
  /** Consecutive completed planned days ending at (or just before) `today`. */
  current: number;
  /** The best run anywhere in the supplied history. */
  longest: number;
  /** The day the current streak started, or null when there is no streak. */
  startedOn: LocalDate | null;
  /** The last day a planned workout was missed, or null. */
  lastMissedOn: LocalDate | null;
  rationale: Rationale;
}

export interface StreakInput {
  today: LocalDate;
  /** Any order; days are sorted internally. Rest days may be omitted entirely. */
  days: readonly StreakDay[];
}

/**
 * DESIGN.md §5.7 — "streaks count planned-day completions; a rest day never
 * breaks a streak". A day with no planned workout is transparent: it neither
 * extends nor ends the run.
 */
export function computeStreak(input: StreakInput): StreakResult {
  const days = [...input.days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let longest = 0;
  let running = 0;
  let lastMissedOn: LocalDate | null = null;
  for (const day of days) {
    if (!day.planned) continue;
    if (day.completed) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
      lastMissedOn = day.date;
    }
  }

  let current = 0;
  let startedOn: LocalDate | null = null;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index];
    if (day.date > input.today) continue;
    if (!day.planned) continue;
    if (!day.completed) break;
    current += 1;
    startedOn = day.date;
  }

  const restDays = days.filter((day) => !day.planned).length;
  const rationale = makeRationale(
    current > 0 ? ['STREAK_ACTIVE'] : ['STREAK_BROKEN'],
    {
      today: input.today,
      current,
      longest,
      startedOn,
      lastMissedOn,
      plannedDays: days.filter((day) => day.planned).length,
      restDays,
    },
    current > 0
      ? `You have completed ${pluralize(current, 'planned session')} in a row${
          restDays > 0 ? ' — rest days do not break it' : ''
        }.`
      : 'No active streak: the last planned session was not completed.',
  );

  return { current, longest, startedOn, lastMissedOn, rationale };
}

/** Fills the gaps between logged days so a caller can build `StreakDay[]`. */
export function expandRestDays(
  from: LocalDate,
  to: LocalDate,
  planned: readonly StreakDay[],
): StreakDay[] {
  const byDate = new Map(planned.map((day) => [day.date, day]));
  const out: StreakDay[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    out.push(byDate.get(date) ?? { date, planned: false, completed: false });
  }
  return out;
}
