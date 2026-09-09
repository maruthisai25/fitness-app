/**
 * Shared TanStack Query keys — DESIGN.md §7.2.
 *
 * "Query keys are defined once in `packages/core/queries` so invalidation rules
 * are shared." Both apps import from here; neither app spells a key inline.
 *
 * Keys are plain readonly tuples, so they are stable, serialisable and safe to
 * compare. `invalidationsFor(mutation)` names the key prefixes a mutation
 * invalidates, so a repository write and a cache refresh cannot drift apart.
 */

import type { Id, LocalDate } from './types';

/** Root segments, one per aggregate. Prefix matching drives invalidation. */
export const QUERY_ROOTS = {
  profile: 'profile',
  goals: 'goals',
  equipment: 'equipment',
  settings: 'settings',
  exercises: 'exercises',
  workouts: 'workouts',
  sets: 'sets',
  personalRecords: 'personalRecords',
  readiness: 'readiness',
  bodyMetrics: 'bodyMetrics',
  progressPhotos: 'progressPhotos',
  nutrition: 'nutrition',
  savedMeals: 'savedMeals',
  inventory: 'inventory',
  recipes: 'recipes',
  mealPlans: 'mealPlans',
  memories: 'memories',
  insights: 'insights',
  weeklyReviews: 'weeklyReviews',
  conversations: 'conversations',
  messages: 'messages',
  aiJobs: 'aiJobs',
  safetyEvents: 'safetyEvents',
  today: 'today',
} as const;

export type QueryRoot = (typeof QUERY_ROOTS)[keyof typeof QUERY_ROOTS];

/** Every key this app can build. The first element is always a {@link QueryRoot}. */
export type QueryKey = readonly unknown[];

export const queryKeys = {
  profile: () => [QUERY_ROOTS.profile] as const,

  goals: () => [QUERY_ROOTS.goals] as const,
  activeGoals: () => [QUERY_ROOTS.goals, 'active'] as const,

  equipment: () => [QUERY_ROOTS.equipment] as const,
  availableEquipment: () => [QUERY_ROOTS.equipment, 'available'] as const,

  settings: () => [QUERY_ROOTS.settings] as const,

  exercises: () => [QUERY_ROOTS.exercises] as const,
  exercise: (exerciseId: Id) => [QUERY_ROOTS.exercises, exerciseId] as const,
  exerciseSearch: (query: string) => [QUERY_ROOTS.exercises, 'search', query] as const,
  exerciseStats: (exerciseId: Id) => [QUERY_ROOTS.exercises, exerciseId, 'stats'] as const,
  exerciseHistory: (exerciseId: Id, limit?: number) =>
    [QUERY_ROOTS.exercises, exerciseId, 'history', limit ?? null] as const,

  workouts: () => [QUERY_ROOTS.workouts] as const,
  workout: (workoutId: Id) => [QUERY_ROOTS.workouts, workoutId] as const,
  workoutsRecent: (days: number) => [QUERY_ROOTS.workouts, 'recent', days] as const,
  workoutsRange: (from: LocalDate, to: LocalDate) =>
    [QUERY_ROOTS.workouts, 'range', from, to] as const,
  workoutsByDate: (date: LocalDate) => [QUERY_ROOTS.workouts, 'date', date] as const,

  sets: (workoutExerciseId: Id) => [QUERY_ROOTS.sets, workoutExerciseId] as const,

  personalRecords: (exerciseId?: Id) => [QUERY_ROOTS.personalRecords, exerciseId ?? 'all'] as const,

  readiness: (date: LocalDate) => [QUERY_ROOTS.readiness, date] as const,
  readinessRange: (from: LocalDate, to: LocalDate) =>
    [QUERY_ROOTS.readiness, 'range', from, to] as const,

  bodyMetrics: () => [QUERY_ROOTS.bodyMetrics] as const,
  bodyMetricsRange: (from: LocalDate, to: LocalDate) =>
    [QUERY_ROOTS.bodyMetrics, 'range', from, to] as const,

  progressPhotos: () => [QUERY_ROOTS.progressPhotos] as const,

  nutritionDay: (date: LocalDate) => [QUERY_ROOTS.nutrition, 'day', date] as const,
  nutritionRange: (from: LocalDate, to: LocalDate) =>
    [QUERY_ROOTS.nutrition, 'range', from, to] as const,
  nutritionTargets: () => [QUERY_ROOTS.nutrition, 'targets'] as const,

  savedMeals: () => [QUERY_ROOTS.savedMeals] as const,
  inventory: () => [QUERY_ROOTS.inventory] as const,
  recipes: () => [QUERY_ROOTS.recipes] as const,
  recipe: (recipeId: Id) => [QUERY_ROOTS.recipes, recipeId] as const,
  mealPlans: () => [QUERY_ROOTS.mealPlans] as const,

  memories: () => [QUERY_ROOTS.memories] as const,
  activeMemories: () => [QUERY_ROOTS.memories, 'active'] as const,

  insights: () => [QUERY_ROOTS.insights] as const,
  openInsights: () => [QUERY_ROOTS.insights, 'open'] as const,

  weeklyReviews: () => [QUERY_ROOTS.weeklyReviews] as const,
  weeklyReview: (weekStart: LocalDate) => [QUERY_ROOTS.weeklyReviews, weekStart] as const,

  conversations: () => [QUERY_ROOTS.conversations] as const,
  messages: (conversationId: Id) => [QUERY_ROOTS.messages, conversationId] as const,

  aiJobs: () => [QUERY_ROOTS.aiJobs] as const,
  queuedAiJobs: () => [QUERY_ROOTS.aiJobs, 'queued'] as const,

  safetyEvents: () => [QUERY_ROOTS.safetyEvents] as const,
  openSafetyEvents: () => [QUERY_ROOTS.safetyEvents, 'open'] as const,

  today: (date: LocalDate) => [QUERY_ROOTS.today, date] as const,
} as const;

/** Every mutation the apps can run, named once so invalidation stays in sync. */
export type MutationName =
  | 'saveProfile'
  | 'saveGoals'
  | 'saveEquipment'
  | 'saveSettings'
  | 'saveExercise'
  | 'createWorkout'
  | 'updateWorkout'
  | 'recordSet'
  | 'finishWorkout'
  | 'substituteExercise'
  | 'saveReadiness'
  | 'reportSafety'
  | 'resolveSafety'
  | 'logFood'
  | 'deleteFoodLog'
  | 'saveNutritionTargets'
  | 'saveMeal'
  | 'updateInventory'
  | 'saveRecipe'
  | 'saveMealPlan'
  | 'saveBodyMetric'
  | 'savePhoto'
  | 'remember'
  | 'forget'
  | 'dismissInsight'
  | 'saveWeeklyReview'
  | 'sendMessage'
  | 'enqueueAiJob'
  | 'importBundle';

/**
 * Key prefixes to invalidate after a mutation. `today` is on almost every list
 * because the Today view aggregates training, nutrition, readiness and safety.
 */
export const INVALIDATIONS: Record<MutationName, readonly QueryRoot[]> = {
  saveProfile: [QUERY_ROOTS.profile, QUERY_ROOTS.nutrition, QUERY_ROOTS.today],
  saveGoals: [QUERY_ROOTS.goals, QUERY_ROOTS.nutrition, QUERY_ROOTS.today],
  saveEquipment: [QUERY_ROOTS.equipment, QUERY_ROOTS.exercises, QUERY_ROOTS.today],
  saveSettings: [QUERY_ROOTS.settings],
  saveExercise: [QUERY_ROOTS.exercises],
  createWorkout: [QUERY_ROOTS.workouts, QUERY_ROOTS.today],
  updateWorkout: [QUERY_ROOTS.workouts, QUERY_ROOTS.today],
  recordSet: [
    QUERY_ROOTS.sets,
    QUERY_ROOTS.workouts,
    QUERY_ROOTS.personalRecords,
    QUERY_ROOTS.exercises,
    QUERY_ROOTS.today,
  ],
  finishWorkout: [
    QUERY_ROOTS.workouts,
    QUERY_ROOTS.personalRecords,
    QUERY_ROOTS.insights,
    QUERY_ROOTS.exercises,
    QUERY_ROOTS.today,
  ],
  substituteExercise: [QUERY_ROOTS.workouts, QUERY_ROOTS.today],
  saveReadiness: [QUERY_ROOTS.readiness, QUERY_ROOTS.workouts, QUERY_ROOTS.today],
  reportSafety: [QUERY_ROOTS.safetyEvents, QUERY_ROOTS.workouts, QUERY_ROOTS.today],
  resolveSafety: [QUERY_ROOTS.safetyEvents, QUERY_ROOTS.workouts, QUERY_ROOTS.today],
  logFood: [QUERY_ROOTS.nutrition, QUERY_ROOTS.savedMeals, QUERY_ROOTS.today],
  deleteFoodLog: [QUERY_ROOTS.nutrition, QUERY_ROOTS.today],
  saveNutritionTargets: [QUERY_ROOTS.nutrition, QUERY_ROOTS.today],
  saveMeal: [QUERY_ROOTS.savedMeals, QUERY_ROOTS.nutrition],
  updateInventory: [QUERY_ROOTS.inventory, QUERY_ROOTS.recipes],
  saveRecipe: [QUERY_ROOTS.recipes],
  saveMealPlan: [QUERY_ROOTS.mealPlans],
  saveBodyMetric: [QUERY_ROOTS.bodyMetrics, QUERY_ROOTS.today],
  savePhoto: [QUERY_ROOTS.progressPhotos],
  remember: [QUERY_ROOTS.memories, QUERY_ROOTS.today],
  forget: [QUERY_ROOTS.memories, QUERY_ROOTS.today],
  dismissInsight: [QUERY_ROOTS.insights, QUERY_ROOTS.today],
  saveWeeklyReview: [QUERY_ROOTS.weeklyReviews, QUERY_ROOTS.insights],
  sendMessage: [QUERY_ROOTS.messages, QUERY_ROOTS.conversations],
  enqueueAiJob: [QUERY_ROOTS.aiJobs],
  importBundle: Object.values(QUERY_ROOTS),
};

/** The key prefixes a mutation should invalidate. */
export function invalidationsFor(mutation: MutationName): QueryKey[] {
  return INVALIDATIONS[mutation].map((root) => [root] as const);
}

/** True when `key` sits under `prefix` — the same rule TanStack Query uses. */
export function matchesPrefix(key: QueryKey, prefix: QueryKey): boolean {
  if (prefix.length > key.length) return false;
  return prefix.every((segment, index) => Object.is(segment, key[index]));
}
