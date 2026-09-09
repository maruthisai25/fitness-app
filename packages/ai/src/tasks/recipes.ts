/**
 * Recipe generation and meal planning — DESIGN.md §6.4.
 *
 * Both run on `coachModel` with structured output. Inputs are the pantry, the
 * macros still left today, dietary constraints, time and preferences, with
 * items whose `useBy` is close listed first so nothing spoils.
 */

import type {
  DayPlan,
  InventoryItem,
  LocalDate,
  MacroTotals,
  MealPlanConstraints,
  RecipeIngredient,
  TokenUsage,
} from '@vigor/core';
import { z } from 'zod';

import type { AiClient } from '../client';
import type { CoachRefusal } from '../errors';
import { describeList, runStructuredTask } from './run';

// ---------------------------------------------------------------------------
// Shared schema pieces
// ---------------------------------------------------------------------------

const macrosSchema = z.object({
  kcal: z.number().min(0).max(10000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(2000),
  fatG: z.number().min(0).max(1000),
  fiberG: z.number().min(0).max(300),
});

const ingredientSchema = z.object({
  name: z.string().min(1).max(60),
  quantity: z.number().min(0).max(10000),
  unit: z.string().min(1).max(24),
  note: z.string().max(120).nullable(),
});

export const generatedRecipeSchema = z.object({
  title: z.string().min(3).max(80),
  ingredients: z.array(ingredientSchema).min(1).max(30),
  steps: z.array(z.string().min(3).max(400)).min(1).max(20),
  timeMinutes: z.number().int().min(1).max(600),
  servings: z.number().int().min(1).max(20),
  perServing: macrosSchema,
  tags: z.array(z.string().min(2).max(24)).max(8),
  /** Names of pantry items this uses, so the UI can offer to deduct them. */
  usesFromPantry: z.array(z.string().min(1).max(60)).max(30),
  /** One sentence on why this recipe fits today. */
  why: z.string().min(10).max(240),
});

export type GeneratedRecipe = z.infer<typeof generatedRecipeSchema>;

function pantryLines(inventory: readonly InventoryItem[]): string[] {
  return inventory
    .slice()
    .sort((a, b) => {
      const left = a.useBy ?? '9999-12-31';
      const right = b.useBy ?? '9999-12-31';
      return left.localeCompare(right) || a.name.localeCompare(b.name);
    })
    .map(
      (item) =>
        `${item.name} — ${item.quantity} ${item.unit}${item.useBy == null ? '' : ` (use by ${item.useBy})`}`,
    );
}

function macroLine(label: string, macros: MacroTotals | null): string {
  if (macros == null) return `${label}: not set`;
  return (
    `${label}: ${Math.round(macros.kcal)} kcal, ${Math.round(macros.proteinG)} g protein, ` +
    `${Math.round(macros.carbsG)} g carbs, ${Math.round(macros.fatG)} g fat, ${Math.round(macros.fiberG)} g fibre`
  );
}

function constraintLines(constraints: Partial<MealPlanConstraints> | undefined): string[] {
  if (constraints == null) return [];
  const lines: string[] = [];
  if (constraints.dietary?.length) lines.push(`dietary: ${[...constraints.dietary].sort().join(', ')}`);
  if (constraints.excludeIngredients?.length) {
    lines.push(`must not contain: ${[...constraints.excludeIngredients].sort().join(', ')}`);
  }
  if (constraints.maxCookMinutes != null) lines.push(`time available: ${constraints.maxCookMinutes} minutes`);
  if (constraints.useInventoryFirst) lines.push('use what is already in the pantry before anything else');
  return lines;
}

const RECIPE_SYSTEM = [
  'You suggest one recipe a person can cook right now, from what they already have.',
  '',
  'Rules:',
  '- Prefer ingredients in the pantry, and put anything close to its use-by date to work first.',
  '- Anything not in the pantry must be a genuinely common staple. List it as an ingredient anyway so the',
  '  shopping is visible; never pretend they have it.',
  '- Respect every dietary constraint and exclusion exactly. One violation makes the recipe useless.',
  '- Fit the time budget, including prep.',
  '- perServing macros must be arithmetically consistent: protein and carbohydrate 4 kcal per gram, fat 9.',
  '- Steps are instructions someone can follow while cooking: one action each, no essays.',
  '- Never invent a nutrition claim, and never describe a food as healthy, clean or a cheat.',
].join('\n');

export interface GenerateRecipeOptions {
  client: AiClient;
  inventory: readonly InventoryItem[];
  /** Macros still available today; null when the person has no targets. */
  remaining: MacroTotals | null;
  constraints?: Partial<MealPlanConstraints>;
  /** Free-text preferences and dislikes, usually the active memories. */
  preferences?: readonly string[];
  /** `profile.foodRegion`. */
  region?: string;
  /** Cook time the person actually has, overriding `constraints.maxCookMinutes`. */
  timeMinutes?: number;
  servings?: number;
  model?: string;
  signal?: AbortSignal;
}

export interface GenerateRecipeResult {
  recipe: GeneratedRecipe | null;
  refusal: CoachRefusal | null;
  usage: TokenUsage;
  model: string;
}

export async function generateRecipe(
  options: GenerateRecipeOptions,
): Promise<GenerateRecipeResult> {
  const user = [
    `Region: ${options.region?.trim() || 'generic'}`,
    macroLine('Macros left today', options.remaining),
    options.timeMinutes == null ? null : `Time available: ${options.timeMinutes} minutes`,
    options.servings == null ? null : `Servings wanted: ${options.servings}`,
    '',
    describeList('Pantry (soonest use-by first)', pantryLines(options.inventory)),
    '',
    describeList('Constraints', constraintLines(options.constraints)),
    '',
    describeList(
      'Preferences and dislikes',
      [...(options.preferences ?? [])].sort(),
    ),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const result = await runStructuredTask({
    client: options.client,
    kind: 'task',
    schema: generatedRecipeSchema,
    system: RECIPE_SYSTEM,
    user,
    ...(options.model == null ? {} : { model: options.model }),
    ...(options.signal == null ? {} : { signal: options.signal }),
  });

  return {
    recipe: result.data,
    refusal: result.refusal,
    usage: result.usage,
    model: result.model,
  };
}

/** Converts a generated recipe into the `recipes` repository's draft shape. */
export function toRecipeDraft(recipe: GeneratedRecipe): {
  title: string;
  ingredients: RecipeIngredient[];
  steps: string[];
  timeMinutes: number;
  servings: number;
  perServing: MacroTotals;
  tags: string[];
  source: 'ai';
  saved: boolean;
} {
  return {
    title: recipe.title,
    ingredients: recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      note: ingredient.note,
    })),
    steps: recipe.steps,
    timeMinutes: recipe.timeMinutes,
    servings: recipe.servings,
    perServing: recipe.perServing,
    tags: recipe.tags,
    source: 'ai',
    saved: false,
  };
}

// ---------------------------------------------------------------------------
// Meal plan
// ---------------------------------------------------------------------------

const plannedItemSchema = z.object({
  name: z.string().min(1).max(80),
  quantity: z.number().min(0).max(10000),
  unit: z.string().min(1).max(24),
  kcal: z.number().min(0).max(10000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(2000),
  fatG: z.number().min(0).max(1000),
  fiberG: z.number().min(0).max(300),
  confidence: z.number().min(0).max(1),
});

const plannedMealSchema = z.object({
  mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
  title: z.string().min(2).max(80),
  items: z.array(plannedItemSchema).min(1).max(10),
});

export const mealPlanSchema = z.object({
  days: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        meals: z.array(plannedMealSchema).min(1).max(6),
        totals: macrosSchema,
      }),
    )
    .min(1)
    .max(14),
  /** One paragraph on how the week hangs together. */
  summary: z.string().min(10).max(600),
});

export type GeneratedMealPlan = z.infer<typeof mealPlanSchema>;

const MEAL_PLAN_SYSTEM = [
  'You build a short meal plan a person will actually cook.',
  '',
  'Rules:',
  '- Hit the daily targets within about 5 per cent on kcal and protein. Say so in the summary if a day cannot.',
  '- Repeat components across days on purpose — cooking rice once for three dinners is a feature.',
  '- Use pantry items first, especially anything near its use-by date.',
  '- Respect every dietary constraint and exclusion exactly.',
  '- Each day\'s totals must be the sum of its own items. Do not round them into agreement.',
  '- Plan real meals for the region given, not a generic macro-counting menu.',
].join('\n');

export interface GenerateMealPlanOptions {
  client: AiClient;
  startDate: LocalDate;
  days: number;
  /** Daily targets to plan against. */
  targets: MacroTotals | null;
  constraints?: Partial<MealPlanConstraints>;
  inventory?: readonly InventoryItem[];
  preferences?: readonly string[];
  region?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface GenerateMealPlanResult {
  /** Ready for `mealPlans.create({ startDate, plan })`. */
  plan: DayPlan[];
  summary: string | null;
  refusal: CoachRefusal | null;
  usage: TokenUsage;
  model: string;
}

export async function generateMealPlan(
  options: GenerateMealPlanOptions,
): Promise<GenerateMealPlanResult> {
  const user = [
    `Region: ${options.region?.trim() || 'generic'}`,
    `Plan ${options.days} day(s) starting ${options.startDate}.`,
    macroLine('Daily targets', options.targets),
    '',
    describeList('Pantry (soonest use-by first)', pantryLines(options.inventory ?? [])),
    '',
    describeList('Constraints', constraintLines(options.constraints)),
    '',
    describeList('Preferences and dislikes', [...(options.preferences ?? [])].sort()),
  ].join('\n');

  const result = await runStructuredTask({
    client: options.client,
    kind: 'task',
    schema: mealPlanSchema,
    system: MEAL_PLAN_SYSTEM,
    user,
    ...(options.model == null ? {} : { model: options.model }),
    ...(options.signal == null ? {} : { signal: options.signal }),
  });

  const plan: DayPlan[] = (result.data?.days ?? []).map((day) => ({
    date: day.date,
    meals: day.meals.map((meal) => ({
      mealSlot: meal.mealSlot,
      title: meal.title,
      items: meal.items.map((item) => ({ ...item, savedMealId: null })),
      recipeId: null,
      savedMealId: null,
    })),
    totals: day.totals,
  }));

  return {
    plan,
    summary: result.data?.summary ?? null,
    refusal: result.refusal,
    usage: result.usage,
    model: result.model,
  };
}
