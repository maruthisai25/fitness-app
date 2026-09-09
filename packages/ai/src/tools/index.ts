/**
 * The coach's tool set — DESIGN.md §6.3, all seventeen tools.
 *
 * The order below is fixed and must stay fixed: tools render at position 0 of
 * the request, so reordering them invalidates the whole prompt cache for every
 * conversation. New tools go at the end.
 */

import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';

import type { CoachDeps } from '../deps';
import {
  getInventoryTool,
  getNutritionDayTool,
  logFoodTool,
  saveMealTool,
  saveRecipeTool,
  updateInventoryTool,
} from './nutrition';
import {
  forgetTool,
  rememberTool,
  reportSafetyTool,
  updateProfileTool,
  updateTargetsTool,
} from './personal';
import {
  adjustWorkoutTool,
  getExerciseHistoryTool,
  getWorkoutsTool,
  proposeWorkoutTool,
  searchExercisesTool,
  substituteExerciseTool,
} from './training';

/**
 * A tool the runner can execute locally. Every coach tool is a plain custom
 * tool, so `name` and `description` are always present — the SDK's union covers
 * the Anthropic-defined tools too, which this package does not use.
 */
export type CoachTool = BetaRunnableTool<never> & { name: string; description: string };

/** DESIGN.md §6.3, in the order the design table lists them. */
export const COACH_TOOL_NAMES = [
  'get_exercise_history',
  'search_exercises',
  'get_workouts',
  'propose_workout',
  'substitute_exercise',
  'adjust_workout',
  'get_nutrition_day',
  'log_food',
  'get_inventory',
  'update_inventory',
  'save_recipe',
  'save_meal',
  'remember',
  'forget',
  'update_profile',
  'update_targets',
  'report_safety',
] as const;

export type CoachToolName = (typeof COACH_TOOL_NAMES)[number];

/**
 * Builds every tool over one `CoachDeps`. Deterministic order — see the note at
 * the top of this file about the prompt cache.
 */
export function createCoachTools(deps: CoachDeps): CoachTool[] {
  const tools = [
    getExerciseHistoryTool(deps),
    searchExercisesTool(deps),
    getWorkoutsTool(deps),
    proposeWorkoutTool(deps),
    substituteExerciseTool(deps),
    adjustWorkoutTool(deps),
    getNutritionDayTool(deps),
    logFoodTool(deps),
    getInventoryTool(deps),
    updateInventoryTool(deps),
    saveRecipeTool(deps),
    saveMealTool(deps),
    rememberTool(deps),
    forgetTool(deps),
    updateProfileTool(deps),
    updateTargetsTool(deps),
    reportSafetyTool(deps),
  ] as unknown as CoachTool[];
  return tools;
}

/** Looks one tool up by name — used by tests and by the "run this again" affordance. */
export function findCoachTool(tools: readonly CoachTool[], name: CoachToolName): CoachTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool == null) throw new Error(`No coach tool named ${name}`);
  return tool;
}

export * from './shared';
export {
  foodItemInput,
  getInventoryTool,
  getNutritionDayTool,
  logFoodTool,
  saveMealTool,
  saveRecipeTool,
  toFoodItemDraft,
  updateInventoryTool,
} from './nutrition';
export {
  forgetTool,
  rememberTool,
  reportSafetyTool,
  updateProfileTool,
  updateTargetsTool,
} from './personal';
export {
  adjustWorkoutTool,
  decideForExercise,
  getExerciseHistoryTool,
  getWorkoutsTool,
  proposeWorkoutTool,
  searchExercisesTool,
  substituteExerciseTool,
} from './training';
export type { DecideForExerciseOptions } from './training';
