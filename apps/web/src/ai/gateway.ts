/**
 * The AI surface the Eat tab talks to — DESIGN.md §6.4, consumed as §6.4 says
 * the prompt tasks outside chat should be: food parsing, recipe generation and
 * meal planning.
 *
 * `packages/ai` owns the Anthropic client, the key and the prompts. This module
 * is only the shape the screens depend on, so every screen can be built, tested
 * and shipped before the coach is connected, and so no screen ever reaches for
 * the API key itself (DESIGN.md §11).
 *
 * The orchestrator injects the real implementation through
 * `<AiGatewayProvider gateway={…}>` in `src/ai/context.tsx`; until it does, the
 * app runs on {@link unavailableGateway} and every screen degrades to manual
 * entry or a "connect the coach in Settings" state.
 */

import {
  dayPlanSchema,
  foodItemDraftSchema,
  recipeSchema,
  type DayPlan,
  type FoodItemDraft,
  type InventoryItem,
  type MacroTotals,
  type NutritionTargets,
  type Recipe,
} from '@vigor/core';
import { z } from 'zod';

/** DESIGN.md §6.4 — food parsing takes the raw text plus `profile.foodRegion`. */
export interface ParseFoodInput {
  text: string;
  /** `profile.foodRegion`: an ISO 3166-1 alpha-2 code, or `generic`. */
  region: string;
}

/** DESIGN.md §6.4 — recipe generation, "What can I make?". */
export interface GenerateRecipeInput {
  inventory: InventoryItem[];
  /** Today's remaining macros, signed as stored (DESIGN.md §5.6). */
  remaining: MacroTotals;
  /** Dietary constraints from memories and the profile, e.g. `vegetarian`. */
  constraints: string[];
  timeMinutes?: number;
  /** Softer than a constraint: things the user likes, not rules. */
  preferences: string[];
}

/** DESIGN.md §6.4 — meal plan, "respects targets per day". */
export interface GenerateMealPlanInput {
  /** 1–7. */
  days: number;
  targets: NutritionTargets;
  inventory: InventoryItem[];
  constraints: string[];
}

/**
 * Everything the Eat tab asks the coach for. Deliberately narrow: nothing here
 * returns free prose, and every result is validated before a screen renders it.
 */
export interface AiGateway {
  /** False whenever a call would fail — no API key, offline, or not yet wired. */
  isAvailable(): boolean;
  parseFood(input: ParseFoodInput): Promise<FoodItemDraft[]>;
  generateRecipe(input: GenerateRecipeInput): Promise<Recipe>;
  generateMealPlan(input: GenerateMealPlanInput): Promise<DayPlan[]>;
}

/** Which gateway call could not run, for a screen that wants to say so precisely. */
export type AiGatewayTask = 'parseFood' | 'generateRecipe' | 'generateMealPlan';

/**
 * Thrown when the coach is not connected. Screens catch this by type and show
 * the manual path instead of an error — never a stack trace, never a crash.
 */
export class AiUnavailableError extends Error {
  override readonly name = 'AiUnavailableError';
  readonly task: AiGatewayTask;
  /** The sentence a screen can show verbatim. */
  readonly userMessage: string;

  constructor(task: AiGatewayTask, userMessage = DEFAULT_UNAVAILABLE_MESSAGE) {
    super(`VigorEngine: the coach is not connected, so ${task} cannot run.`);
    this.task = task;
    this.userMessage = userMessage;
  }
}

export const DEFAULT_UNAVAILABLE_MESSAGE =
  'The coach is not connected yet. Add your Anthropic API key in You → Settings, or keep going by hand.';

export function isAiUnavailableError(error: unknown): error is AiUnavailableError {
  return error instanceof AiUnavailableError;
}

/**
 * The gateway the app boots with. Every method rejects with a typed
 * {@link AiUnavailableError}, so the degraded path is the same code path the
 * screens take when a real call fails offline.
 */
export const unavailableGateway: AiGateway = {
  isAvailable: () => false,
  parseFood: () => Promise.reject(new AiUnavailableError('parseFood')),
  generateRecipe: () => Promise.reject(new AiUnavailableError('generateRecipe')),
  generateMealPlan: () => Promise.reject(new AiUnavailableError('generateMealPlan')),
};

// ---------------------------------------------------------------------------
// Boundary validation — DESIGN.md §11: "zod for every boundary".
// ---------------------------------------------------------------------------

const parsedFoodSchema = z.array(foodItemDraftSchema);
const generatedRecipeSchema = recipeSchema;
const generatedPlanSchema = z.array(dayPlanSchema).min(1);

/**
 * Wraps any gateway so its results are zod-checked before they reach a screen.
 * The orchestrator should wrap the real gateway with this; a malformed model
 * response then fails loudly here instead of writing junk into `food_items`.
 */
export function validating(gateway: AiGateway): AiGateway {
  return {
    isAvailable: () => gateway.isAvailable(),
    async parseFood(input) {
      return parsedFoodSchema.parse(await gateway.parseFood(input));
    },
    async generateRecipe(input) {
      return generatedRecipeSchema.parse(await gateway.generateRecipe(input));
    },
    async generateMealPlan(input) {
      return generatedPlanSchema.parse(await gateway.generateMealPlan(input));
    },
  };
}

export { parsedFoodSchema, generatedRecipeSchema, generatedPlanSchema };
