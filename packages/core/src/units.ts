/**
 * Units — DESIGN.md §5.10.
 *
 * Storage is always canonical metric (kg, cm, g, kcal, seconds). This module is
 * the only place that knows about pounds and inches:
 *
 *   - `toDisplay(valueMetric, kind, unitSystem)` — canonical → what the user reads
 *   - `fromInput(value, kind, unitSystem)`       — what the user typed → canonical
 *
 * Rounding rules (DESIGN.md §5.10): display load rounds to the nearest
 * increment the user can actually load; body weight rounds to 0.1.
 *
 * It also owns the load-increment table of DESIGN.md §5.1 (barbell 2.5 kg,
 * dumbbell 2 kg, machine 5 kg, kettlebell next bell, band next band; 5 lb /
 * 5 lb / 10 lb in imperial profiles, converted to kg for storage).
 */

import type { EquipmentCategory, UnitSystem } from './types';

/** What a number measures. `load` is external resistance; `weight` is a body. */
export type UnitKind = 'weight' | 'length' | 'load';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

/** Smallest sensible metric display step for a load, when nothing better is known. */
export const DEFAULT_METRIC_LOAD_STEP_KG = 0.5;
/** Smallest sensible imperial display step for a load, in pounds. */
export const DEFAULT_IMPERIAL_LOAD_STEP_LB = 2.5;

/** DESIGN.md §5.1 — default metric increments per equipment category. */
export const DEFAULT_LOAD_INCREMENT_KG: Record<EquipmentCategory, number | null> = {
  barbell: 2.5,
  dumbbell: 2,
  machine: 5,
  cable: 2.5,
  kettlebell: null, // next bell on the ladder
  band: null, // next band on the ladder
  bodyweight: null,
  cardio: null,
  other: 2.5,
};

/** DESIGN.md §5.1 — imperial profiles use 5 lb / 5 lb / 10 lb, stored in kg. */
export const DEFAULT_LOAD_INCREMENT_LB: Record<EquipmentCategory, number | null> = {
  barbell: 5,
  dumbbell: 5,
  machine: 10,
  cable: 5,
  kettlebell: null,
  band: null,
  bodyweight: null,
  cardio: null,
  other: 5,
};

/** Commonly stocked kettlebell sizes, kg — "next bell" walks this ladder. */
export const KETTLEBELL_LADDER_KG = [4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48] as const;

/** Nominal resistance of a band set, kg-equivalent — "next band" walks this ladder. */
export const BAND_LADDER_KG = [5, 10, 15, 20, 25, 30, 35, 45, 55, 70] as const;

const EPSILON = 1e-9;

/** Rounds away float noise, e.g. `0.1 + 0.2` → `0.3`. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor + (value >= 0 ? EPSILON : -EPSILON)) / factor;
}

/** Rounds `value` to the nearest multiple of `increment` (falls through on 0). */
export function roundToIncrement(value: number, increment: number): number {
  if (!(increment > 0)) return roundTo(value, 3);
  return roundTo(Math.round(value / increment + EPSILON) * increment, 6);
}

/** The next rung strictly above `current`; past the top, keeps the last gap. */
export function nextLadderStep(ladder: readonly number[], current: number): number {
  for (const step of ladder) {
    if (step > current + EPSILON) return step;
  }
  const top = ladder[ladder.length - 1];
  const gap = ladder.length > 1 ? top - ladder[ladder.length - 2] : top;
  return roundTo(Math.max(current, top) + gap, 3);
}

/** The next rung strictly below `current`, never below the first rung. */
export function previousLadderStep(ladder: readonly number[], current: number): number {
  let best = ladder[0];
  for (const step of ladder) {
    if (step < current - EPSILON) best = step;
  }
  return best;
}

export interface LoadIncrementInput {
  /** Category of the equipment actually used for the exercise. */
  category: EquipmentCategory | null;
  unitSystem: UnitSystem;
  /** `equipment.loadIncrementKg` — a per-row override always wins. */
  overrideKg?: number | null;
  /** Needed for the kettlebell and band ladders. */
  currentLoadKg?: number | null;
}

/**
 * The smallest load jump available for one exercise, canonical kg —
 * DESIGN.md §5.1 "Load increments default per category ... overridable per
 * equipment row".
 */
export function resolveLoadIncrementKg(input: LoadIncrementInput): number {
  const { category, unitSystem, overrideKg, currentLoadKg } = input;
  if (overrideKg != null && overrideKg > 0) return overrideKg;

  if (category === 'kettlebell') {
    const current = currentLoadKg ?? 0;
    return roundTo(nextLadderStep(KETTLEBELL_LADDER_KG, current) - current, 3);
  }
  if (category === 'band') {
    const current = currentLoadKg ?? 0;
    return roundTo(nextLadderStep(BAND_LADDER_KG, current) - current, 3);
  }

  if (unitSystem === 'imperial') {
    const lb = (category && DEFAULT_LOAD_INCREMENT_LB[category]) ?? 5;
    return roundTo(lb * KG_PER_LB, 6);
  }
  const kg = (category && DEFAULT_LOAD_INCREMENT_KG[category]) ?? 2.5;
  return kg;
}

/**
 * Snaps a load to something the user can actually put on the bar.
 *
 * Metric profiles snap to a multiple of the increment in kilograms; imperial
 * profiles snap in pounds first (so 25 lb stays exactly 25 lb) and convert back.
 */
export function roundLoadKgToAchievable(
  valueKg: number,
  unitSystem: UnitSystem,
  incrementKg: number,
): number {
  const safeIncrement =
    incrementKg > 0
      ? incrementKg
      : unitSystem === 'imperial'
        ? DEFAULT_IMPERIAL_LOAD_STEP_LB * KG_PER_LB
        : DEFAULT_METRIC_LOAD_STEP_KG;

  if (unitSystem === 'imperial') {
    const lb = valueKg / KG_PER_LB;
    const stepLb = safeIncrement / KG_PER_LB;
    return roundTo(roundToIncrement(lb, stepLb) * KG_PER_LB, 6);
  }
  return roundToIncrement(valueKg, safeIncrement);
}

/** Options for {@link toDisplay}; only `load` uses them. */
export interface DisplayOptions {
  /** The increment the user can actually load, canonical kg. */
  incrementKg?: number | null;
}

/**
 * Canonical metric → the number the user should see, already rounded per
 * DESIGN.md §5.10.
 */
export function toDisplay(
  valueMetric: number,
  kind: UnitKind,
  unitSystem: UnitSystem,
  options: DisplayOptions = {},
): number {
  switch (kind) {
    case 'weight':
      return unitSystem === 'imperial'
        ? roundTo(valueMetric / KG_PER_LB, 1)
        : roundTo(valueMetric, 1);
    case 'length':
      return unitSystem === 'imperial'
        ? roundTo(valueMetric / CM_PER_IN, 1)
        : roundTo(valueMetric, 1);
    case 'load': {
      const increment = options.incrementKg ?? null;
      if (unitSystem === 'imperial') {
        const stepLb =
          increment && increment > 0 ? increment / KG_PER_LB : DEFAULT_IMPERIAL_LOAD_STEP_LB;
        return roundTo(roundToIncrement(valueMetric / KG_PER_LB, stepLb), 2);
      }
      const stepKg = increment && increment > 0 ? increment : DEFAULT_METRIC_LOAD_STEP_KG;
      return roundTo(roundToIncrement(valueMetric, stepKg), 2);
    }
  }
}

/** What the user typed → canonical metric storage. */
export function fromInput(value: number, kind: UnitKind, unitSystem: UnitSystem): number {
  if (unitSystem === 'metric') return roundTo(value, 6);
  switch (kind) {
    case 'weight':
    case 'load':
      return roundTo(value * KG_PER_LB, 6);
    case 'length':
      return roundTo(value * CM_PER_IN, 6);
  }
}

/** `kg` / `lb` / `cm` / `in`. */
export function unitLabel(kind: UnitKind, unitSystem: UnitSystem): string {
  if (kind === 'length') return unitSystem === 'imperial' ? 'in' : 'cm';
  return unitSystem === 'imperial' ? 'lb' : 'kg';
}

/** Drops trailing zeros: `25` not `25.0`, `2.5` stays `2.5`. */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(roundTo(value, 2));
}

/** `"25 lb"` — the phrase engines drop into a rationale summary. */
export function formatLoad(
  valueKg: number,
  unitSystem: UnitSystem,
  incrementKg?: number | null,
): string {
  return `${formatNumber(toDisplay(valueKg, 'load', unitSystem, { incrementKg }))} ${unitLabel(
    'load',
    unitSystem,
  )}`;
}

/** `"72.4 kg"` — body weight, always one decimal of precision. */
export function formatBodyWeight(valueKg: number, unitSystem: UnitSystem): string {
  return `${formatNumber(toDisplay(valueKg, 'weight', unitSystem))} ${unitLabel(
    'weight',
    unitSystem,
  )}`;
}
