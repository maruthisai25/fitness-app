/** Prompt tasks outside chat — DESIGN.md §6.4. */

export { describeList, runStructuredTask } from './run';
export type { StructuredTaskOptions, StructuredTaskResult } from './run';

export { foodItemDraftSchema, parseFood, parsedFoodSchema } from './parseFood';
export type { ParseFoodOptions, ParseFoodResult, ParsedFood } from './parseFood';

export {
  generateMealPlan,
  generateRecipe,
  generatedRecipeSchema,
  mealPlanSchema,
  toRecipeDraft,
} from './recipes';
export type {
  GeneratedMealPlan,
  GeneratedRecipe,
  GenerateMealPlanOptions,
  GenerateMealPlanResult,
  GenerateRecipeOptions,
  GenerateRecipeResult,
} from './recipes';

export {
  extractMemories,
  memoryExtractionSchema,
  memoryProposalSchema,
  phraseInsights,
  phrasedInsightsSchema,
  weeklyReviewProseSchema,
  writeWeeklyReview,
} from './review';
export type {
  ExtractMemoriesOptions,
  ExtractMemoriesResult,
  MemoryProposal,
  PhrasedInsight,
  PhraseInsightsOptions,
  PhraseInsightsResult,
  WeeklyReviewProse,
  WriteWeeklyReviewOptions,
  WriteWeeklyReviewResult,
} from './review';
