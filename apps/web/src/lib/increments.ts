/**
 * The load increment for one exercise — DESIGN.md §5.1: defaults per equipment
 * category, overridable by the `equipment` row the user configured. The number
 * itself is computed by `@vigor/core`; this only picks the inputs.
 */

import {
  resolveLoadIncrementKg,
  type Equipment,
  type EquipmentCategory,
  type Exercise,
  type UnitSystem,
} from '@vigor/core';

/** The category that determines how an exercise is loaded, ignoring bodyweight. */
export function loadingCategory(exercise: Exercise): EquipmentCategory | null {
  return exercise.equipment.find((category) => category !== 'bodyweight') ?? null;
}

export function incrementKgFor(input: {
  exercise: Exercise | undefined;
  equipment: readonly Equipment[];
  unitSystem: UnitSystem;
  currentLoadKg?: number | null;
}): number {
  const category = input.exercise ? loadingCategory(input.exercise) : null;
  const row = input.equipment.find(
    (item) => item.available && category != null && item.category === category,
  );
  return resolveLoadIncrementKg({
    category,
    unitSystem: input.unitSystem,
    overrideKg: row?.loadIncrementKg ?? null,
    currentLoadKg: input.currentLoadKg ?? null,
  });
}
