/**
 * Friendly wording for the tool-activity chips — DESIGN.md §7.1: `tool
 * activity chips ("Looking at your last 3 sessions…", "Planned today's
 * workout")`.
 *
 * Every name here comes from `COACH_TOOL_NAMES` in `@vigor/ai`; a tool this
 * app has never seen still gets a readable fallback rather than nothing.
 */

const RUNNING_LABEL: Record<string, string> = {
  get_exercise_history: 'Looking at your history with this exercise…',
  search_exercises: 'Searching the exercise library…',
  get_workouts: 'Looking at your recent sessions…',
  propose_workout: 'Planning a session…',
  substitute_exercise: 'Ranking a substitute exercise…',
  adjust_workout: 'Adjusting the session…',
  get_nutrition_day: 'Checking today’s nutrition…',
  log_food: 'Logging that food…',
  get_inventory: 'Checking your pantry…',
  update_inventory: 'Updating your pantry…',
  save_recipe: 'Saving that recipe…',
  save_meal: 'Saving that meal…',
  remember: 'Remembering that…',
  forget: 'Forgetting that…',
  update_profile: 'Updating your profile…',
  update_targets: 'Updating your nutrition targets…',
  report_safety: 'Recording a safety note…',
};

const DONE_LABEL: Record<string, string> = {
  get_exercise_history: 'Looked at your history with this exercise',
  search_exercises: 'Searched the exercise library',
  get_workouts: 'Looked at your recent sessions',
  propose_workout: 'Planned a session',
  substitute_exercise: 'Swapped the exercise',
  adjust_workout: 'Adjusted the session',
  get_nutrition_day: 'Checked today’s nutrition',
  log_food: 'Logged that food',
  get_inventory: 'Checked your pantry',
  update_inventory: 'Updated your pantry',
  save_recipe: 'Saved that recipe',
  save_meal: 'Saved that meal',
  remember: 'Remembered that',
  forget: 'Forgot that',
  update_profile: 'Updated your profile',
  update_targets: 'Updated your nutrition targets',
  report_safety: 'Recorded a safety note',
};

export function toolActivityLabel(name: string, status: 'running' | 'ok' | 'error'): string {
  if (status === 'running') return RUNNING_LABEL[name] ?? `Using ${name}…`;
  const done = DONE_LABEL[name] ?? `Used ${name}`;
  return status === 'error' ? `Could not finish: ${done.charAt(0).toLowerCase()}${done.slice(1)}` : done;
}
