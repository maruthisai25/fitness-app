/**
 * One repository module per aggregate — DESIGN.md §4.2.
 *
 * `createRepositories(driver)` is the only thing the apps and `packages/ai`
 * need: no SQL, no Drizzle types and no driver details leak past this boundary.
 */

import { createDb, type DbOptions, type VigorDb } from '../client';
import type { SqlDriver } from '../driver';
import { createAiJobRepository, type AiJobRepository } from './aiJobs';
import { createBodyRepository, type BodyRepository } from './body';
import { createConversationRepository, type ConversationRepository } from './conversations';
import { createEquipmentRepository, type EquipmentRepository } from './equipment';
import { createExerciseRepository, type ExerciseRepository } from './exercises';
import { createExportRepository, type ExportRepository } from './exportImport';
import { createGoalRepository, type GoalRepository } from './goals';
import { createInsightRepository, type InsightRepository } from './insights';
import { createInventoryRepository, type InventoryRepository } from './inventory';
import { createMealPlanRepository, type MealPlanRepository } from './mealPlans';
import { createMemoryRepository, type MemoryRepository } from './memories';
import { createNutritionRepository, type NutritionRepository } from './nutrition';
import { createProfileRepository, type ProfileRepository } from './profile';
import { createReadinessRepository, type ReadinessRepository } from './readiness';
import { createRecipeRepository, type RecipeRepository } from './recipes';
import { createRecordRepository, type RecordRepository } from './records';
import { createReviewRepository, type ReviewRepository } from './reviews';
import { createSafetyRepository, type SafetyRepository } from './safety';
import { createSavedMealRepository, type SavedMealRepository } from './savedMeals';
import { createSetRepository, type SetRepository } from './sets';
import { createSettingsRepository, type SettingsRepository } from './settings';
import { createTargetsRepository, type TargetsRepository } from './targets';
import { createWorkoutRepository, type WorkoutRepository } from './workouts';

export interface Repositories {
  profile: ProfileRepository;
  goals: GoalRepository;
  equipment: EquipmentRepository;
  targets: TargetsRepository;
  settings: SettingsRepository;
  exercises: ExerciseRepository;
  workouts: WorkoutRepository;
  sets: SetRepository;
  records: RecordRepository;
  readiness: ReadinessRepository;
  body: BodyRepository;
  nutrition: NutritionRepository;
  savedMeals: SavedMealRepository;
  inventory: InventoryRepository;
  recipes: RecipeRepository;
  mealPlans: MealPlanRepository;
  memories: MemoryRepository;
  insights: InsightRepository;
  reviews: ReviewRepository;
  conversations: ConversationRepository;
  aiJobs: AiJobRepository;
  safety: SafetyRepository;
  /** DESIGN.md §4.2 names this aggregate `export`. */
  export: ExportRepository;
  /** The handle the repositories share, for callers that need a transaction. */
  db: VigorDb;
}

/** Builds every repository over one Drizzle handle. */
export function createRepositoriesFor(db: VigorDb): Repositories {
  const targets = createTargetsRepository(db);
  return {
    profile: createProfileRepository(db),
    goals: createGoalRepository(db),
    equipment: createEquipmentRepository(db),
    targets,
    settings: createSettingsRepository(db),
    exercises: createExerciseRepository(db),
    workouts: createWorkoutRepository(db),
    sets: createSetRepository(db),
    records: createRecordRepository(db),
    readiness: createReadinessRepository(db),
    body: createBodyRepository(db),
    nutrition: createNutritionRepository(db, targets),
    savedMeals: createSavedMealRepository(db),
    inventory: createInventoryRepository(db),
    recipes: createRecipeRepository(db),
    mealPlans: createMealPlanRepository(db),
    memories: createMemoryRepository(db),
    insights: createInsightRepository(db),
    reviews: createReviewRepository(db),
    conversations: createConversationRepository(db),
    aiJobs: createAiJobRepository(db),
    safety: createSafetyRepository(db),
    export: createExportRepository(db),
    db,
  };
}

/**
 * The app entry point: wrap a platform driver and get the whole repository
 * surface. Run `migrate(driver)` first — DESIGN.md §4.
 */
export function createRepositories(driver: SqlDriver, options?: DbOptions): Repositories {
  return createRepositoriesFor(createDb(driver, options));
}

export * from './support';
export type { AiJobDraft, AiJobFields, AiJobRepository } from './aiJobs';
export type {
  BodyMetricDraft,
  BodyMetricFields,
  BodyRepository,
  ProgressPhotoDraft,
  ProgressPhotoFields,
} from './body';
export type { ConversationRepository, MessageDraft, MessageFields } from './conversations';
export { DEFAULT_LOAD_INCREMENT_KG } from './equipment';
export type { EquipmentDraft, EquipmentFields, EquipmentRepository } from './equipment';
export type {
  ExerciseDraft,
  ExerciseFields,
  ExerciseRepository,
  ExerciseSearchFilter,
} from './exercises';
export { EXPORT_APP_VERSION, EXPORT_SCHEMA_VERSION, UnsupportedBundleError } from './exportImport';
export type {
  BundleOptions,
  ExportRepository,
  RestoreOptions,
  RestoreResult,
} from './exportImport';
export type { GoalDraft, GoalFields, GoalRepository } from './goals';
export type { InsightDraft, InsightFields, InsightFilter, InsightRepository } from './insights';
export type { InventoryItemDraft, InventoryItemFields, InventoryRepository } from './inventory';
export type { MealPlanDraft, MealPlanFields, MealPlanRepository } from './mealPlans';
export type {
  ForgetRecord,
  MemoryDraft,
  MemoryFields,
  MemoryFilter,
  MemoryRepository,
} from './memories';
export { sumMacros } from './nutrition';
export type { FoodItemFields, FoodLogDraft, FoodLogFields, NutritionRepository } from './nutrition';
export { PROFILE_DEFAULTS } from './profile';
export type { ProfileDraft, ProfileFields, ProfileRepository } from './profile';
export type { ReadinessDraft, ReadinessFields, ReadinessRepository } from './readiness';
export type { RecipeDraft, RecipeFields, RecipeRepository } from './recipes';
export type { PersonalRecordDraft, PersonalRecordFields, RecordRepository } from './records';
export type { ReviewRepository, WeeklyReviewDraft, WeeklyReviewFields } from './reviews';
export type { SafetyEventDraft, SafetyEventFields, SafetyRepository } from './safety';
export type { SavedMealDraft, SavedMealFields, SavedMealRepository } from './savedMeals';
export type { SetDraft, SetFields, SetRepository, SetResult } from './sets';
export { DEFAULT_SETTINGS, SETTINGS_KEYS } from './settings';
export type { SettingsRepository } from './settings';
export type { NutritionTargetsDraft, NutritionTargetsFields, TargetsRepository } from './targets';
export { HISTORY_STATUSES } from './workouts';
export type {
  WorkoutDraft,
  WorkoutExerciseDraft,
  WorkoutExerciseFields,
  WorkoutFields,
  WorkoutRepository,
} from './workouts';
