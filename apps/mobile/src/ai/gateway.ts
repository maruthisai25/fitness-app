/**
 * The app's view of the AI layer — DESIGN.md §6.4 ("prompt tasks outside chat").
 *
 * `packages/ai` owns the Anthropic client, the prompts and the structured
 * output schemas. The Eat screens never talk to it directly: they talk to this
 * interface, so every screen has one obvious behaviour when the coach is not
 * connected (no API key, offline, or the package not wired up yet) — degrade to
 * manual entry, or say "connect the coach in Settings".
 *
 * The real implementation is injected once at startup with
 * {@link installAiGateway}; until then {@link unavailableGateway} is in force
 * and `isAvailable()` answers `false`.
 */

import type {
  DayPlan,
  FoodItemDraft,
  InventoryItem,
  MacroTotals,
  NutritionTargets,
  Recipe,
} from '@vigor/core';

/**
 * Thrown by every gateway method when the coach is not connected. Screens
 * catch this specifically so a missing key reads differently from a real
 * failure.
 */
export class AiUnavailableError extends Error {
  readonly code = 'AI_UNAVAILABLE';

  constructor(
    message = 'The coach is not connected. Add your Anthropic API key in You → Settings, or enter this by hand.',
  ) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/** True for the error every screen has a manual fallback for. */
export function isAiUnavailable(error: unknown): error is AiUnavailableError {
  return error instanceof AiUnavailableError;
}

/** DESIGN.md §6.4 — food parsing. `region` comes from `profile.foodRegion`. */
export interface ParseFoodInput {
  text: string;
  region: string;
}

/** DESIGN.md §6.4 — recipe generation. `remaining` is today's macro headroom. */
export interface GenerateRecipeInput {
  inventory: InventoryItem[];
  remaining: MacroTotals;
  /** Dietary constraints, from `memories` and the profile. */
  constraints: string[];
  timeMinutes?: number;
  preferences: string[];
}

/** DESIGN.md §6.4 — meal plan. One `DayPlan` per day, respecting `targets`. */
export interface GenerateMealPlanInput {
  days: number;
  targets: NutritionTargets;
  inventory: InventoryItem[];
  constraints: string[];
  /** Ingredients the plan must not use — the "Plan ahead" form's exclusion chips. */
  excludeIngredients?: string[];
  /** Longest a single meal may take to cook, in minutes. Null/omitted = no limit. */
  maxCookMinutes?: number | null;
  /** Defaults true; the pantry-first preset pins it on. */
  useInventoryFirst?: boolean;
}

export interface AiGateway {
  /** False when there is no API key, no network, or no wired-up client. */
  isAvailable(): boolean;
  parseFood(input: ParseFoodInput): Promise<FoodItemDraft[]>;
  /**
   * Returns a fully-formed `Recipe`. Its `id` is provisional — saving goes
   * through `repos.recipes.create`, which mints the stored id.
   */
  generateRecipe(input: GenerateRecipeInput): Promise<Recipe>;
  generateMealPlan(input: GenerateMealPlanInput): Promise<DayPlan[]>;
}

/** The gateway in force until the real one is installed. */
export const unavailableGateway: AiGateway = {
  isAvailable: () => false,
  parseFood: () => Promise.reject(new AiUnavailableError()),
  generateRecipe: () => Promise.reject(new AiUnavailableError()),
  generateMealPlan: () => Promise.reject(new AiUnavailableError()),
};

let current: AiGateway = unavailableGateway;
const listeners = new Set<(gateway: AiGateway) => void>();

/**
 * Wires the real `packages/ai` gateway in. Call once, as early as the app
 * knows whether a key is stored — every Eat screen picks it up immediately.
 */
export function installAiGateway(gateway: AiGateway): void {
  current = gateway;
  for (const listener of listeners) listener(gateway);
}

/** Puts the app back into its degraded state, e.g. after the key is removed. */
export function resetAiGateway(): void {
  installAiGateway(unavailableGateway);
}

/** The gateway as it stands right now, outside React. */
export function getAiGateway(): AiGateway {
  return current;
}

/** Subscribes to installs; returns an unsubscribe function. */
export function subscribeToAiGateway(listener: (gateway: AiGateway) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
