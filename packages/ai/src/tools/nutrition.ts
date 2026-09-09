/**
 * Nutrition and pantry tools — DESIGN.md §6.3, §6.4.
 *
 * Food estimation is the one place the model supplies numbers, because there is
 * no food database in v1 (DESIGN.md §1). Everything downstream of the item list
 * — totals, remaining macros, target comparison — is arithmetic that
 * `@vigor/core` §5.6 owns and this file never repeats.
 */

import { type FoodItemDraft, type MacroTotals } from '@vigor/core';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import type { CoachDeps } from '../deps';
import { fail, idInput, localDateInput, ok } from './shared';

const nonNegative = z.number().min(0);

/** One estimated food item — the same shape the food-parsing task returns. */
export const foodItemInput = z.strictObject({
  name: z.string().min(1).max(80),
  quantity: z.number().min(0).max(10000),
  unit: z.string().min(1).max(24).describe('As the person said it: g, ml, roti, cup, plate'),
  kcal: nonNegative.max(10000),
  proteinG: nonNegative.max(1000),
  carbsG: nonNegative.max(2000),
  fatG: nonNegative.max(1000),
  fiberG: nonNegative.max(300),
  confidence: z.number().min(0).max(1).describe('How sure you are of this estimate'),
});

export type FoodItemInput = z.infer<typeof foodItemInput>;

export function toFoodItemDraft(item: FoodItemInput, savedMealId: string | null = null): FoodItemDraft {
  return { ...item, savedMealId };
}

const macroInput = z.strictObject({
  kcal: nonNegative.max(10000),
  proteinG: nonNegative.max(1000),
  carbsG: nonNegative.max(2000),
  fatG: nonNegative.max(1000),
  fiberG: nonNegative.max(300),
});

export function getNutritionDayTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'get_nutrition_day',
    description:
      'What the person has eaten on one day and what is left against their targets. `remaining` is signed — a ' +
      'negative number means they are over. Do NOT add the macros up yourself and do NOT restate a target the ' +
      'result does not contain; if `targets` is null they have not set any yet, so say that instead of ' +
      'guessing one.',
    inputSchema: z.strictObject({
      date: localDateInput.optional().describe('Defaults to today'),
    }),
    run: async ({ date }) => {
      const day = await deps.repos.nutrition.getDay(date ?? deps.clock.today());
      return ok({
        date: day.date,
        targets: day.targets,
        consumed: day.consumed,
        remaining: day.remaining,
        mealsLogged: day.mealsLogged,
        logs: day.logs.map((log) => ({
          id: log.id,
          mealSlot: log.mealSlot,
          rawText: log.rawText,
          estimationStatus: log.estimationStatus,
          items: log.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            kcal: item.kcal,
            proteinG: item.proteinG,
            carbsG: item.carbsG,
            fatG: item.fatG,
            fiberG: item.fiberG,
            confidence: item.confidence,
          })),
        })),
      });
    },
  });
}

export function logFoodTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'log_food',
    description:
      'Write a meal to the food log with your best estimate of each item. Use the region conventions in the ' +
      "person's profile — an Indian roti is not a tortilla. Set `confidence` honestly: below 0.6 tells the UI " +
      'to ask them to confirm. Do NOT log a meal they only asked about, do NOT split one dish into invented ' +
      'sub-ingredients, and do NOT compute the day total — call get_nutrition_day afterwards if you need it.',
    inputSchema: z.strictObject({
      date: localDateInput.optional().describe('Defaults to today'),
      mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
      rawText: z.string().min(1).max(500).describe('What the person actually said, kept verbatim'),
      items: z.array(foodItemInput).min(1).max(20),
      savedMealId: idInput.nullish().describe('Set when this is a repeat of a saved meal'),
    }),
    run: async (input) => {
      const date = input.date ?? deps.clock.today();
      const log = await deps.repos.nutrition.createLog({
        date,
        mealSlot: input.mealSlot,
        rawText: input.rawText,
        source: 'ai',
        estimationStatus: 'final',
        loggedAt: deps.clock.now(),
        items: input.items.map((item) => toFoodItemDraft(item, input.savedMealId ?? null)),
      });
      if (input.savedMealId != null) {
        await deps.repos.savedMeals.markLogged(input.savedMealId, deps.clock.now()).catch(() => undefined);
      }
      const day = await deps.repos.nutrition.getDay(date);
      return ok({
        foodLogId: log.id,
        date,
        mealSlot: log.mealSlot,
        itemCount: log.items.length,
        dayConsumed: day.consumed,
        dayRemaining: day.remaining,
        hasTargets: day.targets != null,
      });
    },
  });
}

export function getInventoryTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'get_inventory',
    description:
      'The pantry: what is in the house, how much, and what is close to its use-by date. Call it before ' +
      'suggesting anything to cook. Do NOT assume staples the list does not mention, and do NOT silently ' +
      'consume items — cooking something is update_inventory.',
    inputSchema: z.strictObject({
      category: z.string().min(2).max(40).optional(),
      expiringByDays: z
        .number()
        .int()
        .min(0)
        .max(30)
        .optional()
        .describe('Also return the subset expiring within this many days'),
    }),
    run: async (input) => {
      const items = await deps.repos.inventory.list(
        input.category == null ? undefined : { category: input.category },
      );
      let expiring: typeof items = [];
      if (input.expiringByDays != null) {
        const today = deps.clock.today();
        const limit = new Date(`${today}T00:00:00.000Z`);
        limit.setUTCDate(limit.getUTCDate() + input.expiringByDays);
        expiring = await deps.repos.inventory.listExpiringBy(limit.toISOString().slice(0, 10));
      }
      return ok({
        count: items.length,
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          useBy: item.useBy,
        })),
        expiringSoon: expiring.map((item) => ({ id: item.id, name: item.name, useBy: item.useBy })),
      });
    },
  });
}

export function updateInventoryTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'update_inventory',
    description:
      'Add items to the pantry or remove them once they are used up. Removal takes the inventory row id from ' +
      'get_inventory, not a name. Do NOT clear the pantry, do NOT remove something because a recipe used part ' +
      'of it — reduce the quantity by adding the item again with the new amount — and do NOT add items the ' +
      'person has not said they have.',
    inputSchema: z.strictObject({
      add: z
        .array(
          z.strictObject({
            name: z.string().min(1).max(60),
            quantity: z.number().min(0).max(100000),
            unit: z.string().min(1).max(24),
            category: z.string().max(40).nullish(),
            useBy: localDateInput.nullish(),
            notes: z.string().max(200).nullish(),
          }),
        )
        .max(30)
        .optional(),
      remove: z.array(idInput).max(30).optional().describe('inventory_items row ids'),
    }),
    run: async (input) => {
      const added = input.add?.length
        ? await deps.repos.inventory.addMany(
            input.add.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              category: item.category ?? null,
              useBy: item.useBy ?? null,
              notes: item.notes ?? null,
              addedAt: deps.clock.now(),
            })),
          )
        : [];
      if (input.remove?.length) await deps.repos.inventory.removeMany(input.remove);
      const items = await deps.repos.inventory.list();
      return ok({
        added: added.map((item) => ({ id: item.id, name: item.name })),
        removed: input.remove ?? [],
        pantrySize: items.length,
      });
    },
  });
}

export function saveRecipeTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'save_recipe',
    description:
      'Store a recipe so the person can cook it again. Per-serving macros must add up to something you are ' +
      'willing to stand behind — they go straight into the food log when the recipe is eaten. Do NOT save a ' +
      'recipe they have not agreed to, and do NOT save one that needs ingredients the pantry does not have ' +
      'unless you say so in the notes.',
    inputSchema: z.strictObject({
      title: z.string().min(3).max(80),
      ingredients: z
        .array(
          z.strictObject({
            name: z.string().min(1).max(60),
            quantity: z.number().min(0).max(10000),
            unit: z.string().min(1).max(24),
            note: z.string().max(120).nullish(),
          }),
        )
        .min(1)
        .max(30),
      steps: z.array(z.string().min(3).max(400)).min(1).max(20),
      timeMinutes: z.number().int().min(1).max(600),
      servings: z.number().int().min(1).max(20),
      perServing: macroInput,
      tags: z.array(z.string().min(2).max(24)).max(8).optional(),
    }),
    run: async (input) => {
      const recipe = await deps.repos.recipes.create({
        title: input.title,
        ingredients: input.ingredients.map((ingredient) => ({
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          note: ingredient.note ?? null,
        })),
        steps: input.steps,
        timeMinutes: input.timeMinutes,
        servings: input.servings,
        perServing: input.perServing as MacroTotals,
        tags: input.tags ?? [],
        source: 'ai',
        saved: true,
      });
      return ok({ recipeId: recipe.id, title: recipe.title, perServing: recipe.perServing });
    },
  });
}

export function saveMealTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'save_meal',
    description:
      'Store a meal the person eats often so logging it later is one tap and needs no estimation. The macro ' +
      'columns are recomputed from the items, so send the items right. Do NOT save a one-off meal, and do NOT ' +
      'save a meal under a name that already exists — check first and update instead.',
    inputSchema: z.strictObject({
      name: z.string().min(2).max(60),
      items: z.array(foodItemInput).min(1).max(20),
    }),
    run: async (input) => {
      const existing = await deps.repos.savedMeals.getByName(input.name);
      const items = input.items.map((item) => toFoodItemDraft(item));
      if (existing != null) {
        const updated = await deps.repos.savedMeals.update(existing.id, { name: input.name, items });
        return ok({ savedMealId: updated.id, name: updated.name, replaced: true, kcal: updated.kcal });
      }
      const meal = await deps.repos.savedMeals.create({ name: input.name, items });
      return ok({ savedMealId: meal.id, name: meal.name, replaced: false, kcal: meal.kcal });
    },
  });
}

/** Guards a macro object that arrived from the model. Exported for the tasks. */
export function assertMacros(value: unknown): MacroTotals {
  const parsed = macroInput.safeParse(value);
  if (!parsed.success) throw new Error(fail('Macro totals were not valid numbers.'));
  return parsed.data;
}
