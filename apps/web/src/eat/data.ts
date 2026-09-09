/**
 * Queries and mutations for the Eat tab.
 *
 * Every key comes from `@vigor/core/queries` and every invalidation from
 * `invalidationsFor`, so a write here and a cache refresh cannot drift apart
 * (DESIGN.md §7.2). No arithmetic lives in this file either: totals come from
 * the nutrition engine (DESIGN.md §5.6).
 */

import {
  buildDayNutrition,
  invalidationsFor,
  queryKeys,
  type DayNutrition,
  type FoodItemDraft,
  type Goal,
  type InventoryItem,
  type LocalDate,
  type MealPlan,
  type MealSlot,
  type Memory,
  type MutationName,
  type NutritionTargets,
  type Profile,
  type Recipe,
  type SavedMeal,
} from '@vigor/core';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useDb } from '../db/provider';

/** Invalidates exactly the key prefixes DESIGN.md §7.2 assigns to a mutation. */
export function useInvalidate(): (mutation: MutationName) => Promise<void> {
  const client = useQueryClient();
  return useCallback(
    async (mutation: MutationName) => {
      await Promise.all(
        invalidationsFor(mutation).map((key) => client.invalidateQueries({ queryKey: key })),
      );
    },
    [client],
  );
}

export function useProfile(): UseQueryResult<Profile | null> {
  const { repos } = useDb();
  return useQuery({ queryKey: queryKeys.profile(), queryFn: () => repos.profile.get() });
}

export function useActiveGoals(): UseQueryResult<Goal[]> {
  const { repos } = useDb();
  return useQuery({ queryKey: queryKeys.activeGoals(), queryFn: () => repos.goals.listActive() });
}

export function useNutritionTargets(): UseQueryResult<NutritionTargets[]> {
  const { repos } = useDb();
  return useQuery({ queryKey: queryKeys.nutritionTargets(), queryFn: () => repos.targets.list() });
}

/**
 * One day of food, assembled by `buildDayNutrition` — the engine owns
 * `consumed` and the signed `remaining`; the screen clamps with `clampMacros`.
 */
export function useDayNutrition(date: LocalDate): UseQueryResult<DayNutrition> {
  const { repos } = useDb();
  return useQuery({
    queryKey: queryKeys.nutritionDay(date),
    queryFn: async () => {
      const [logs, targets] = await Promise.all([
        repos.nutrition.listLogs({ from: date, to: date }),
        repos.targets.getActive(date),
      ]);
      return buildDayNutrition({ date, logs, targets });
    },
  });
}

export function useSavedMeals(): UseQueryResult<SavedMeal[]> {
  const { repos } = useDb();
  return useQuery({ queryKey: queryKeys.savedMeals(), queryFn: () => repos.savedMeals.list() });
}

export function useInventory(): UseQueryResult<InventoryItem[]> {
  const { repos } = useDb();
  return useQuery({ queryKey: queryKeys.inventory(), queryFn: () => repos.inventory.list() });
}

/** Saved recipes, most-made first (`recipes.list` orders by `timesMade`). */
export function useRecipes(): UseQueryResult<Recipe[]> {
  const { repos } = useDb();
  return useQuery({
    queryKey: queryKeys.recipes(),
    queryFn: () => repos.recipes.list({ savedOnly: true }),
  });
}

export function useMealPlans(): UseQueryResult<MealPlan[]> {
  const { repos } = useDb();
  return useQuery({ queryKey: queryKeys.mealPlans(), queryFn: () => repos.mealPlans.list() });
}

/** Active nutrition memories — the dietary constraints the recipe prompt needs. */
export function useNutritionMemories(): UseQueryResult<Memory[]> {
  const { repos } = useDb();
  return useQuery({
    queryKey: queryKeys.activeMemories(),
    queryFn: () => repos.memories.listActive({ domain: 'nutrition' }),
  });
}

export interface LogFoodInput {
  date: LocalDate;
  mealSlot: MealSlot;
  rawText: string;
  source: 'ai' | 'manual' | 'saved_meal';
  items: FoodItemDraft[];
  estimationStatus?: 'final' | 'pending' | 'failed';
  /** Set when the log came from a saved meal, so `timesLogged` can be bumped. */
  savedMealId?: string | null;
}

/** Writes `food_logs` + `food_items`, and bumps a saved meal's usage counter. */
export function useLogFood() {
  const { repos } = useDb();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: LogFoodInput) => {
      const log = await repos.nutrition.createLog({
        date: input.date,
        mealSlot: input.mealSlot,
        rawText: input.rawText,
        source: input.source,
        estimationStatus: input.estimationStatus ?? 'final',
        items: input.items,
      });
      if (input.savedMealId) await repos.savedMeals.markLogged(input.savedMealId);
      return log;
    },
    onSuccess: () => invalidate('logFood'),
  });
}

/** The dietary constraints the coach must respect, from memories and profile notes. */
export function constraintsFrom(memories: readonly Memory[]): string[] {
  return memories
    .filter((memory) => memory.kind === 'constraint' || memory.kind === 'dislike')
    .map((memory) => memory.text);
}

/** Softer than a constraint: stated preferences, used to steer a recipe. */
export function preferencesFrom(memories: readonly Memory[]): string[] {
  return memories.filter((memory) => memory.kind === 'preference').map((memory) => memory.text);
}
