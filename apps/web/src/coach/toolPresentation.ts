/**
 * Turns one coach tool call into what the chat panel shows and what it
 * invalidates — DESIGN.md §6.3, §9 phase 2 ("tool activity chips"), §7.2
 * ("a repository write and a cache refresh cannot drift apart").
 */

import type { CoachToolName } from '@vigor/ai';
import type { MutationName } from '@vigor/core';

/** "Looking at your last 3 sessions…" while the tool is running. */
export function describeToolStart(name: string, input: unknown): string {
  const record = isRecord(input) ? input : {};
  switch (name as CoachToolName) {
    case 'get_exercise_history':
      return 'Looking at that exercise’s history…';
    case 'search_exercises':
      return 'Searching the exercise library…';
    case 'get_workouts':
      return 'Looking at recent workouts…';
    case 'propose_workout':
      return 'Planning a session…';
    case 'substitute_exercise':
      return 'Finding a substitute exercise…';
    case 'adjust_workout':
      return 'Adjusting today’s workout…';
    case 'get_nutrition_day':
      return 'Checking today’s nutrition…';
    case 'log_food':
      return 'Logging that food…';
    case 'get_inventory':
      return 'Checking your inventory…';
    case 'update_inventory':
      return 'Updating your inventory…';
    case 'save_recipe':
      return 'Saving that recipe…';
    case 'save_meal':
      return 'Saving that meal…';
    case 'remember':
      return 'Remembering that…';
    case 'forget':
      return 'Forgetting that…';
    case 'update_profile':
      return 'Updating your profile…';
    case 'update_targets':
      return 'Updating your nutrition targets…';
    case 'report_safety':
      return 'Flagging a safety concern…';
    default:
      return typeof record.summary === 'string' ? record.summary : `Running ${name}…`;
  }
}

/** "Planned today's workout" once the tool has actually finished. */
export function describeToolResult(name: string, ok: boolean): string {
  if (!ok) return `${humanizeToolName(name)} did not go through`;
  switch (name as CoachToolName) {
    case 'get_exercise_history':
      return 'Looked at that exercise’s history';
    case 'search_exercises':
      return 'Searched the exercise library';
    case 'get_workouts':
      return 'Looked at recent workouts';
    case 'propose_workout':
      return 'Planned today’s workout';
    case 'substitute_exercise':
      return 'Swapped the exercise';
    case 'adjust_workout':
      return 'Adjusted today’s workout';
    case 'get_nutrition_day':
      return 'Checked today’s nutrition';
    case 'log_food':
      return 'Logged that food';
    case 'get_inventory':
      return 'Checked your inventory';
    case 'update_inventory':
      return 'Updated your inventory';
    case 'save_recipe':
      return 'Saved that recipe';
    case 'save_meal':
      return 'Saved that meal';
    case 'remember':
      return 'Remembered that';
    case 'forget':
      return 'Forgot that';
    case 'update_profile':
      return 'Updated your profile';
    case 'update_targets':
      return 'Updated your nutrition targets';
    case 'report_safety':
      return 'Flagged a safety concern';
    default:
      return `${humanizeToolName(name)} finished`;
  }
}

function humanizeToolName(name: string): string {
  return name.replace(/_/g, ' ');
}

/**
 * Which cache prefixes a successful tool call should refresh — the chat
 * panel's version of `apps/web/src/data/hooks.ts`'s `useInvalidate`, since a
 * coach turn can trigger any number of writes in one round trip.
 */
const TOOL_MUTATIONS: Partial<Record<CoachToolName, MutationName>> = {
  propose_workout: 'createWorkout',
  substitute_exercise: 'substituteExercise',
  adjust_workout: 'updateWorkout',
  log_food: 'logFood',
  update_inventory: 'updateInventory',
  save_recipe: 'saveRecipe',
  save_meal: 'saveMeal',
  remember: 'remember',
  forget: 'forget',
  update_profile: 'saveProfile',
  update_targets: 'saveNutritionTargets',
  report_safety: 'reportSafety',
};

/** Mutation names to invalidate for one batch of tool calls, `sendMessage` always included. */
export function mutationsForToolCalls(
  toolCalls: readonly { name: string; ok: boolean }[],
): MutationName[] {
  const names = new Set<MutationName>(['sendMessage']);
  for (const call of toolCalls) {
    if (!call.ok) continue;
    const mutation = TOOL_MUTATIONS[call.name as CoachToolName];
    if (mutation) names.add(mutation);
  }
  return [...names];
}

/** Parses a tool's `{"ok":true,...}` / `{"ok":false,...}` JSON result, or null if it is not JSON. */
export function parseToolResult(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
