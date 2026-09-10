/**
 * The real {@link AiGateway}: the Eat screens' three prompt tasks, wired to the
 * `@vigor/ai` task functions — DESIGN.md §6.4.
 *
 * Nothing here decides anything. `packages/ai` owns the prompts, the models and
 * the structured-output schemas; this module only translates between the shapes
 * the screens speak and the options objects those tasks take, and turns a
 * refusal or an empty result into the one error every screen already handles.
 *
 * It is never installed without a client and a connection: {@link realGateway}
 * hands back {@link unavailableGateway} when either is missing, so the degraded
 * path stays exactly the path the screens were built and tested against.
 */
import {
  generateMealPlan as aiGenerateMealPlan,
  generateRecipe as aiGenerateRecipe,
  parseFood as aiParseFood,
  toRecipeDraft,
  type AiClient,
} from '@vigor/ai';
import type { LocalDate, MealPlanConstraints, Recipe } from '@vigor/core';

import {
  AiUnavailableError,
  unavailableGateway,
  type AiGateway,
  type GenerateMealPlanInput,
  type GenerateRecipeInput,
  type ParseFoodInput,
} from './gateway';

/** What the gateway needs beyond the client itself. */
export interface RealGatewaySettings {
  /** `profile.foodRegion`, e.g. `IN`. Defaults to `generic` when empty. */
  region: string;
  /** The Network adapter's answer. Offline means no gateway at all. */
  online: boolean;
  /**
   * The Clock adapter, read when a task runs rather than when the gateway is
   * built. An app resumed after midnight would otherwise plan meals starting
   * yesterday.
   */
  today: () => LocalDate;
}

/** A recipe id only ever used in memory; saving mints the stored one. */
const DRAFT_RECIPE_ID = 'draft';

/** The screens' free-text constraints, as `packages/ai` wants them. */
function toConstraints(
  constraints: readonly string[],
  timeMinutes?: number,
): Partial<MealPlanConstraints> {
  return {
    dietary: [...constraints],
    maxCookMinutes: timeMinutes ?? null,
    useInventoryFirst: true,
  };
}

/**
 * A refusal is not a bug and not a missing key — the model declined, and the
 * screen's manual path is the right answer either way, so it reads as the same
 * unavailable state with the model's own explanation.
 */
function refused(what: string, reason: string | null): AiUnavailableError {
  return new AiUnavailableError(
    reason?.trim()
      ? `The coach could not ${what}: ${reason.trim()}`
      : `The coach could not ${what}. Enter it by hand instead.`,
  );
}

/**
 * Builds the gateway the Eat screens use when the coach is connected.
 *
 * Returns {@link unavailableGateway} when there is no key (`client` is null) or
 * the device is offline, which is what makes "connect the coach in Settings"
 * and "you are offline" the same, already-tested screen state.
 */
export function realGateway(client: AiClient | null, settings: RealGatewaySettings): AiGateway {
  if (client == null || !settings.online) return unavailableGateway;

  return {
    isAvailable: () => true,

    async parseFood(input: ParseFoodInput) {
      const result = await aiParseFood({
        client,
        text: input.text,
        region: input.region || settings.region,
      });
      if (result.items.length === 0) {
        throw refused('read that', result.refusal?.message ?? null);
      }
      return result.items;
    },

    async generateRecipe(input: GenerateRecipeInput): Promise<Recipe> {
      const result = await aiGenerateRecipe({
        client,
        inventory: input.inventory,
        remaining: input.remaining,
        constraints: toConstraints(input.constraints, input.timeMinutes),
        preferences: input.preferences,
        region: settings.region,
        ...(input.timeMinutes == null ? {} : { timeMinutes: input.timeMinutes }),
      });
      if (result.recipe == null) {
        throw refused('write a recipe', result.refusal?.message ?? null);
      }
      // `toRecipeDraft` gives the repository's draft shape; the screen renders a
      // `Recipe`, so the two fields only a stored row has are filled in here.
      return {
        ...toRecipeDraft(result.recipe),
        id: DRAFT_RECIPE_ID,
        timesMade: 0,
        lastMadeAt: null,
      };
    },

    async generateMealPlan(input: GenerateMealPlanInput) {
      const result = await aiGenerateMealPlan({
        client,
        startDate: settings.today(),
        days: input.days,
        targets: input.targets,
        inventory: input.inventory,
        constraints: toConstraints(input.constraints),
      });
      if (result.plan.length === 0) {
        throw refused('build a plan', result.refusal?.message ?? null);
      }
      return result.plan;
    },
  };
}
