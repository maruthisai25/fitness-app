/**
 * The display layer for numbers — DESIGN.md §5.10, §11 ("never store display
 * units"). Storage stays canonical metric; every number a screen prints goes
 * through `@vigor/core`'s units module with the profile's unit system, and
 * every number the user types comes back through `fromInput`.
 */

import {
  displayLoggedLoad,
  formatNumber,
  fromInput,
  toDisplay,
  unitLabel,
  type LoadType,
  type RepRange,
  type UnitSystem,
} from '@vigor/core';

/** `kg` or `lb`. */
export function loadUnit(unitSystem: UnitSystem): string {
  return unitLabel('load', unitSystem);
}

/**
 * DESIGN.md §5.1 rule 5: for `time` and `distance` load types the rep fields
 * hold seconds or metres, and the UI must never label them "reps".
 */
export function repUnit(loadType: LoadType): string {
  if (loadType === 'time') return 'seconds';
  if (loadType === 'distance') return 'metres';
  return 'reps';
}

/** The short column header form: `reps` / `sec` / `m`. */
export function repUnitShort(loadType: LoadType): string {
  if (loadType === 'time') return 'sec';
  if (loadType === 'distance') return 'm';
  return 'reps';
}

/** Canonical kg → the number the user reads, already snapped to a real plate. */
export function loadValue(
  valueKg: number,
  unitSystem: UnitSystem,
  incrementKg?: number | null,
): number {
  return toDisplay(valueKg, 'load', unitSystem, { incrementKg });
}

/** `"37.5 kg"`, or a dash when the exercise carries no external load. */
export function loadText(
  valueKg: number | null,
  unitSystem: UnitSystem,
  incrementKg?: number | null,
): string {
  if (valueKg == null) return '—';
  return `${formatNumber(loadValue(valueKg, unitSystem, incrementKg))} ${loadUnit(unitSystem)}`;
}

/**
 * A load the user actually logged, shown exactly as they typed it —
 * DESIGN.md §5.10's round trip.
 *
 * `loadValue`/`loadText` snap to the achievable plate increment because that is
 * right for a load the engines *prescribe*. A recorded `actualLoadKg` is a fact,
 * not advice: an imperial user who typed 22.5 must read back 22.5, never the
 * 5 lb progression step rounded to 25.
 */
export function loggedLoadValue(valueKg: number, unitSystem: UnitSystem): number {
  return displayLoggedLoad(valueKg, unitSystem);
}

/** `"22.5 lb"` for a logged load, or a dash when nothing was loaded. */
export function loggedLoadText(valueKg: number | null, unitSystem: UnitSystem): string {
  if (valueKg == null) return '—';
  return `${formatNumber(displayLoggedLoad(valueKg, unitSystem))} ${loadUnit(unitSystem)}`;
}

/** What the user typed → canonical kg, or null when the box is empty/invalid. */
export function loadFromText(text: string, unitSystem: UnitSystem): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return fromInput(value, 'load', unitSystem);
}

/** A whole count of reps / seconds / metres, or null when unusable. */
export function countFromText(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/** `8–12 reps`, `30–33 seconds`. */
export function repRangeText(range: RepRange, loadType: LoadType): string {
  const unit = repUnit(loadType);
  return range.min === range.max ? `${range.min} ${unit}` : `${range.min}–${range.max} ${unit}`;
}

/** `3 × 8–12 reps at 60 kg` — the target line above a set. */
export function targetText(input: {
  sets: number;
  repMin: number;
  repMax: number;
  loadKg: number | null;
  loadType: LoadType;
  unitSystem: UnitSystem;
  incrementKg?: number | null;
}): string {
  const reps = repRangeText({ min: input.repMin, max: input.repMax }, input.loadType);
  const load =
    input.loadKg == null
      ? ''
      : ` at ${loadText(input.loadKg, input.unitSystem, input.incrementKg)}`;
  return `${input.sets} × ${reps}${load}`;
}

/** `12 · 12 · 10` — the reps a past session actually logged. */
export function repsText(reps: readonly number[]): string {
  return reps.length === 0 ? '—' : reps.join(' · ');
}

/** RPE choices session mode offers — DESIGN.md §7.1 "RPE picker". */
export const RPE_CHOICES: readonly number[] = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

/** Human label for a movement pattern, e.g. `horizontal_push` → `Horizontal push`. */
export function humanize(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
