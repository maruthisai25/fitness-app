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
import { resyncForeground } from '../progress/foreground';
import { finalLogs } from './logs';

/**
 * Mutations that can change the answer a reminder skip rule gives, so the
 * foreground runner has to decide again (DESIGN.md §7.3): a meal logged silences
 * the meal-log reminder, a finished workout silences the workout reminder, and
 * either can move today's remaining protein.
 */
const REMINDER_AFFECTING: ReadonlySet<MutationName> = new Set<MutationName>([
  'logFood',
  'deleteFoodLog',
  'saveNutritionTargets',
  'createWorkout',
  'updateWorkout',
  'finishWorkout',
]);

/** Invalidates exactly the key prefixes DESIGN.md §7.2 assigns to a mutation. */
export function useInvalidate(): (mutation: MutationName) => Promise<void> {
  const client = useQueryClient();
  return useCallback(
    async (mutation: MutationName) => {
      await Promise.all(
        invalidationsFor(mutation).map((key) => client.invalidateQueries({ queryKey: key })),
      );
      if (REMINDER_AFFECTING.has(mutation)) resyncForeground();
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
 *
 * Only settled logs reach the engine: a log still waiting on the coach's
 * estimate carries no final numbers, and the day log says outright that the
 * totals skip it until it lands. It stays in `logs` so the screen can still
 * show it as "estimating…".
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
      const day = buildDayNutrition({ date, logs: finalLogs(logs), targets });
      return { ...day, logs };
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

/**
 * The offline half of food parsing — DESIGN.md §6.4: "Offline → `ai_jobs` row
 * with `estimate_food`, item shows 'estimating…'". The log is written straight
 * away with no items, so nothing the user typed is lost, and the job runner
 * fills the macros in on the next pass that reaches the API.
 */
export function useQueueFoodEstimate() {
  const { repos } = useDb();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      date: LocalDate;
      mealSlot: MealSlot;
      rawText: string;
      region: string;
    }) => {
      const log = await repos.nutrition.createLog({
        date: input.date,
        mealSlot: input.mealSlot,
        rawText: input.rawText,
        source: 'ai',
        estimationStatus: 'pending',
        items: [],
      });
      // Idempotent by id (DESIGN.md §8): one job per log, however often this runs.
      await repos.aiJobs.enqueue({
        id: `estimate_food:${log.id}`,
        kind: 'estimate_food',
        payload: { foodLogId: log.id, text: input.rawText, region: input.region },
        resultRef: log.id,
      });
      return log;
    },
    onSuccess: async () => {
      await invalidate('logFood');
      await invalidate('enqueueAiJob');
    },
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
