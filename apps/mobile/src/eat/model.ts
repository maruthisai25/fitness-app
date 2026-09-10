/**
 * Shared Eat-tab plumbing: the day's nutrition state, meal grouping, and the
 * dietary context the recipe and meal-plan prompts need.
 *
 * Every number comes out of a `@vigor/core` engine — `buildDayNutrition`,
 * `sumConsumed`, `clampMacros`. Nothing in `src/eat` adds macros by hand.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import {
  addMacros,
  buildDayNutrition,
  clampMacros,
  MEAL_PLAN_PRESETS,
  queryKeys,
  sumConsumed,
  ZERO_MACROS,
  type DayNutrition,
  type FoodItemDraft,
  type FoodLogWithItems,
  type InventoryItem,
  type LocalDate,
  type MacroTotals,
  type MealPlanPreset,
  type MealSlot,
  type Profile,
} from '@vigor/core';

import type { AppRepos } from '../db/AppDataProvider';

export const MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'other'];

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  other: 'Other',
};

/** "620 kcal · 38 g protein" — the one-line summary used all over the tab. */
export function macroSummary(macros: MacroTotals): string {
  return `${Math.round(macros.kcal)} kcal · ${Math.round(macros.proteinG)} g protein`;
}

/** "38 P · 70 C · 18 F · 6 fib" — the detail line under a meal. */
export function macroBreakdown(macros: MacroTotals): string {
  return (
    `${Math.round(macros.proteinG)} P · ${Math.round(macros.carbsG)} C · ` +
    `${Math.round(macros.fatG)} F · ${Math.round(macros.fiberG)} fib`
  );
}

export function itemQuantityLabel(item: { quantity: number; unit: string }): string {
  const quantity = Number.isInteger(item.quantity)
    ? String(item.quantity)
    : String(Math.round(item.quantity * 100) / 100);
  return `${quantity} ${item.unit}`.trim();
}

/** Today's nutrition state, assembled by the §5.6 engine from stored rows. */
export function useDayNutrition(
  repos: AppRepos,
  date: LocalDate,
): UseQueryResult<DayNutrition, Error> {
  return useQuery({
    queryKey: queryKeys.nutritionDay(date),
    queryFn: async (): Promise<DayNutrition> => {
      const [logs, targets] = await Promise.all([
        repos.nutrition.listLogs({ from: date, to: date }),
        repos.targets.getActive(date),
      ]);
      return buildDayNutrition({ date, logs, targets });
    },
  });
}

export interface MealGroup {
  slot: MealSlot;
  logs: FoodLogWithItems[];
  totals: MacroTotals;
}

/** Groups a day's logs into the five slots, in serving order. Empty slots drop out. */
export function groupByMeal(logs: readonly FoodLogWithItems[]): MealGroup[] {
  return MEAL_SLOTS.map((slot) => {
    const slotLogs = logs.filter((log) => log.mealSlot === slot);
    return { slot, logs: slotLogs, totals: sumConsumed(slotLogs) };
  }).filter((group) => group.logs.length > 0);
}

/** Totals for a list of items that are not attached to a log yet. */
export function sumDrafts(items: readonly FoodItemDraft[]): MacroTotals {
  return items.reduce<MacroTotals>(
    (total, item) =>
      addMacros(total, {
        kcal: item.kcal,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
        fiberG: item.fiberG,
      }),
    { ...ZERO_MACROS },
  );
}

/** The macro headroom left for the rest of the day, never negative. */
export function remainingForDisplay(day: DayNutrition): MacroTotals {
  return clampMacros(day.remaining);
}

/** A saved meal's items, re-pointed at the meal so the origin survives. */
export function itemsFromSavedMeal(
  items: readonly FoodItemDraft[],
  savedMealId: string,
): FoodItemDraft[] {
  return items.map((item) => ({ ...item, savedMealId }));
}

/** What the recipe and meal-plan prompts must respect — DESIGN.md §6.4. */
export interface FoodContext {
  profile: Profile | null;
  /** Hard limits: constraints, dislikes and injuries recorded as memories. */
  constraints: string[];
  /** Softer signals: preferences and facts about how the user likes to eat. */
  preferences: string[];
  inventory: InventoryItem[];
}

/**
 * Reads the dietary context out of `memories` (DESIGN.md §4.1: memories are
 * derived or declared, never the only copy) plus the pantry.
 */
export async function loadFoodContext(repos: AppRepos): Promise<FoodContext> {
  const [profile, memories, inventory] = await Promise.all([
    repos.profile.get(),
    repos.memories.listActive({ domain: 'nutrition' }),
    repos.inventory.list(),
  ]);

  const constraints = memories
    .filter((memory) => memory.kind === 'constraint' || memory.kind === 'dislike')
    .map((memory) => memory.text);
  const preferences = memories
    .filter((memory) => memory.kind === 'preference' || memory.kind === 'fact')
    .map((memory) => memory.text);

  if (profile?.preferredStyles.length) preferences.push(...profile.preferredStyles);

  return { profile, constraints, preferences, inventory };
}

/** The region hint the food parser needs — `profile.foodRegion`, or generic. */
export function foodRegionOf(profile: Profile | null | undefined): string {
  return profile?.foodRegion ?? 'generic';
}

// ---------------------------------------------------------------------------
// Meal plan presets — labels only. The arithmetic (preset-adjusted targets,
// the pantry-first rule and the stored `MealPlanConstraints`) is
// `buildMealPlanRequest` in `@vigor/core`, shared with the web app.
// ---------------------------------------------------------------------------

const MEAL_PLAN_PRESET_LABEL: Record<MealPlanPreset, string> = {
  balanced: 'Balanced',
  high_protein: 'High protein',
  calorie_controlled: 'Calorie-controlled',
  pantry_first: 'Pantry-first',
};

export const MEAL_PLAN_PRESET_OPTIONS: readonly { value: MealPlanPreset; label: string }[] =
  MEAL_PLAN_PRESETS.map((value) => ({ value, label: MEAL_PLAN_PRESET_LABEL[value] }));
