/**
 * Readiness engine — DESIGN.md §5.2.
 *
 * Score = weighted sum of today's check-in, normalised to 0–100:
 * sleep quality 30 %, energy 25 %, fatigue 20 %, soreness 15 %, stress 10 %.
 * Fewer than six hours of sleep subtracts 10 points.
 *
 * Modifier: `normal` (≥ 65), `hold` (45–64), `reduce` (< 45).
 * `painReported` always yields `safety` and asks for a `safety_events` row —
 * the engine is pure, so it returns the row to write instead of writing it.
 */

import { makeRationale } from './rationale';
import type {
  LocalDate,
  Rationale,
  Readiness,
  ReadinessModifier,
  SafetyEvent,
  SafetyEventKind,
  SafetyEventSource,
  Scale1To5,
} from './types';
import { roundTo } from './units';

/** DESIGN.md §5.2 — component weights, summing to 1. */
export const READINESS_WEIGHTS = {
  sleepQuality: 0.3,
  energy: 0.25,
  fatigue: 0.2,
  soreness: 0.15,
  stress: 0.1,
} as const;

/** Below this many hours of sleep the score loses a flat 10 points. */
export const SHORT_SLEEP_HOURS = 6;
export const SHORT_SLEEP_PENALTY = 10;

/** Score at or above this is `normal`. */
export const READINESS_NORMAL_MIN = 65;
/** Score at or above this (and below normal) is `hold`; anything lower is `reduce`. */
export const READINESS_HOLD_MIN = 45;

/** A `safety_events` row the caller should insert — DESIGN.md §5.2, §4.1. */
export interface SafetyEventDraft {
  date: LocalDate;
  kind: SafetyEventKind;
  text: string;
  source: SafetyEventSource;
}

export interface ReadinessAssessment {
  date: LocalDate;
  /** 0–100, or null when the user skipped the check-in. */
  score: number | null;
  modifier: ReadinessModifier;
  /** Non-null only when the check-in reported pain. */
  safetyEvent: SafetyEventDraft | null;
  rationale: Rationale;
}

/** Higher is better: 1 → 0, 5 → 1. */
function positive(value: Scale1To5): number {
  return (value - 1) / 4;
}

/** Higher is worse: 1 → 1, 5 → 0. */
function negative(value: Scale1To5): number {
  return (5 - value) / 4;
}

function modifierFor(score: number): ReadinessModifier {
  if (score >= READINESS_NORMAL_MIN) return 'normal';
  if (score >= READINESS_HOLD_MIN) return 'hold';
  return 'reduce';
}

/**
 * Scores today's check-in. Components the user left blank are dropped and the
 * remaining weights are renormalised, so a partial check-in is not punished.
 * A check-in with no scored component at all scores null and reads `normal`.
 */
export function assessReadiness(
  readiness: Readiness | null,
  fallbackDate?: LocalDate,
): ReadinessAssessment {
  const date = readiness?.date ?? fallbackDate ?? '1970-01-01';

  if (readiness == null) {
    return {
      date,
      score: null,
      modifier: 'normal',
      safetyEvent: null,
      rationale: makeRationale(
        ['NO_CHECKIN'],
        { date },
        'No readiness check-in today, so the plan runs at normal load.',
      ),
    };
  }

  const components: { key: string; weight: number; value: number }[] = [];
  if (readiness.sleepQuality != null) {
    components.push({
      key: 'sleepQuality',
      weight: READINESS_WEIGHTS.sleepQuality,
      value: positive(readiness.sleepQuality),
    });
  }
  if (readiness.energy != null) {
    components.push({
      key: 'energy',
      weight: READINESS_WEIGHTS.energy,
      value: positive(readiness.energy),
    });
  }
  if (readiness.fatigue != null) {
    components.push({
      key: 'fatigue',
      weight: READINESS_WEIGHTS.fatigue,
      value: negative(readiness.fatigue),
    });
  }
  if (readiness.soreness != null) {
    components.push({
      key: 'soreness',
      weight: READINESS_WEIGHTS.soreness,
      value: negative(readiness.soreness),
    });
  }
  if (readiness.stress != null) {
    components.push({
      key: 'stress',
      weight: READINESS_WEIGHTS.stress,
      value: negative(readiness.stress),
    });
  }

  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const shortSleep = readiness.sleepHours != null && readiness.sleepHours < SHORT_SLEEP_HOURS;

  let score: number | null = null;
  if (totalWeight > 0) {
    const weighted = components.reduce(
      (sum, component) => sum + component.weight * component.value,
      0,
    );
    const raw = (weighted / totalWeight) * 100 - (shortSleep ? SHORT_SLEEP_PENALTY : 0);
    score = Math.round(Math.min(100, Math.max(0, raw)));
  }

  const facts: Record<string, unknown> = {
    date: readiness.date,
    sleepHours: readiness.sleepHours,
    sleepQuality: readiness.sleepQuality,
    energy: readiness.energy,
    fatigue: readiness.fatigue,
    soreness: readiness.soreness,
    stress: readiness.stress,
    componentsScored: components.map((component) => component.key),
    weightScored: roundTo(totalWeight, 3),
    shortSleepPenalty: shortSleep ? SHORT_SLEEP_PENALTY : 0,
    score,
  };

  if (readiness.painReported) {
    const text = readiness.painNote ?? 'Pain reported on the readiness check-in.';
    return {
      date: readiness.date,
      score,
      modifier: 'safety',
      safetyEvent: { date: readiness.date, kind: 'pain', text, source: 'readiness' },
      rationale: makeRationale(
        ['PAIN_REPORTED', 'SAFETY_STATE_ACTIVE'],
        facts,
        'You reported pain, so progression is paused and the coach will not add load until the event is resolved.',
      ),
    };
  }

  if (score == null) {
    return {
      date: readiness.date,
      score: null,
      modifier: 'normal',
      safetyEvent: null,
      rationale: makeRationale(
        ['NO_CHECKIN'],
        facts,
        'The check-in had nothing scored, so the plan runs at normal load.',
      ),
    };
  }

  const modifier = modifierFor(score);
  const codes = [`READINESS_${modifier.toUpperCase()}`];
  if (shortSleep) codes.push('SHORT_SLEEP');

  const summary =
    modifier === 'normal'
      ? `Readiness scores ${score}/100, so today runs as planned.`
      : modifier === 'hold'
        ? `Readiness scores ${score}/100, so loads hold where they are today.`
        : `Readiness scores ${score}/100, so loads hold and volume comes down today.`;

  return {
    date: readiness.date,
    score,
    modifier,
    safetyEvent: null,
    rationale: makeRationale(codes, facts, summary),
  };
}

/** Convenience for callers that only need the score, e.g. the check-in form. */
export function readinessScore(readiness: Readiness): number | null {
  return assessReadiness(readiness).score;
}

/**
 * Reading order for the safety history both shells show under You → Safety:
 * anything still open first, because an open event is what holds progression
 * back (DESIGN.md §2.6), then the resolved ones as a record. Newest first
 * inside each group, with the id breaking ties so two events reported on the
 * same day keep a stable order between renders.
 */
export function orderSafetyEvents(events: readonly SafetyEvent[]): SafetyEvent[] {
  return [...events].sort((a, b) => {
    const aOpen = a.resolvedAt == null;
    const bOpen = b.resolvedAt == null;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
  });
}
