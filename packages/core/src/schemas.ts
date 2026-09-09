/**
 * Zod schemas for every domain type in `./types.ts` — DESIGN.md §11 requires a
 * schema at every boundary (tool inputs, structured outputs, import bundles,
 * settings).
 *
 * The block at the bottom of this file asserts at compile time that each schema
 * infers exactly the interface it mirrors, so the two files cannot drift.
 */

import { z } from 'zod';

import type {
  ActivityLevel,
  AiJob,
  AiJobKind,
  AiJobStatus,
  BodyMeasurements,
  BodyMetric,
  Conversation,
  DateRange,
  DayNutrition,
  DayPlan,
  DayPlanMeal,
  Difficulty,
  Equipment,
  EquipmentCategory,
  EstimationStatus,
  EvidenceRef,
  Exercise,
  ExerciseRelation,
  ExerciseRelationKind,
  ExerciseSession,
  ExportBundle,
  ExportBundlePhoto,
  ExportTables,
  FitnessLevel,
  FoodItem,
  FoodItemDraft,
  FoodLog,
  FoodLogSource,
  FoodLogWithItems,
  Goal,
  GoalType,
  Insight,
  InsightSeverity,
  InventoryItem,
  LoadType,
  MacroHitRate,
  MacroTotals,
  MealPlan,
  MealPlanConstraints,
  MealSlot,
  Memory,
  MemoryDomain,
  MemoryKind,
  MemorySource,
  Message,
  MessageRole,
  MovementPattern,
  MuscleGroupVolume,
  NutritionTargetSource,
  NutritionTargets,
  NutritionWeekStats,
  PersonalRecord,
  PersonalRecordKind,
  PersonalRecordSummary,
  Profile,
  ProgressPhoto,
  ProgressPhotoView,
  ProgressionAction,
  ProgressionDecision,
  Rationale,
  ReadinessModifier,
  Readiness,
  Recipe,
  RecipeIngredient,
  RecipeSource,
  ReminderTimes,
  RepRange,
  SafetyEvent,
  SafetyEventKind,
  SafetyEventSource,
  SavedMeal,
  Scale1To5,
  SetRecord,
  Settings,
  SettingsEntry,
  Sex,
  TokenUsage,
  TrainingLocation,
  TrainingWeekStats,
  UnitSystem,
  WeekDay,
  WeeklyReview,
  Workout,
  WorkoutExercise,
  WorkoutExerciseWithSets,
  WorkoutPlan,
  WorkoutPlanExercise,
  WorkoutSource,
  WorkoutStatus,
  WorkoutWithExercises,
} from './types';

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

/** UUID v7 primary key. */
export const idSchema = z.string().min(1);

/** ISO 8601 UTC timestamp. */
export const isoTimestampSchema = z.string().min(1);

/** Local calendar day, `YYYY-MM-DD`. */
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** Local wall-clock time, `HH:mm`. */
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm');

export const scale1To5Schema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const difficultySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const weekDaySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

// ---------------------------------------------------------------------------
// Enum-like string unions
// ---------------------------------------------------------------------------

export const fitnessLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

export const sexSchema = z.enum(['male', 'female', 'other', 'prefer_not_to_say']);

export const unitSystemSchema = z.enum(['metric', 'imperial']);

export const trainingLocationSchema = z.enum(['home', 'gym', 'outdoor', 'hotel', 'other']);

export const activityLevelSchema = z.enum([
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
]);

export const goalTypeSchema = z.enum([
  'strength',
  'hypertrophy',
  'fat_loss',
  'general',
  'endurance',
  'mobility',
  'conditioning',
  'consistency',
]);

export const equipmentCategorySchema = z.enum([
  'barbell',
  'dumbbell',
  'kettlebell',
  'band',
  'machine',
  'cable',
  'bodyweight',
  'cardio',
  'other',
]);

export const nutritionTargetSourceSchema = z.enum(['user', 'computed']);

export const movementPatternSchema = z.enum([
  'squat',
  'hinge',
  'lunge',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'carry',
  'core',
  'isolation',
  'cardio',
  'mobility',
]);

export const loadTypeSchema = z.enum([
  'external',
  'bodyweight',
  'assisted',
  'band',
  'time',
  'distance',
]);

export const exerciseRelationKindSchema = z.enum([
  'variation',
  'progression',
  'regression',
  'substitution',
]);

export const workoutStatusSchema = z.enum([
  'planned',
  'in_progress',
  'completed',
  'skipped',
  'abandoned',
]);

export const workoutSourceSchema = z.enum(['ai', 'rule', 'manual', 'template']);

export const personalRecordKindSchema = z.enum([
  'e1rm',
  'max_load',
  'max_reps_at_load',
  'session_volume',
]);

export const progressPhotoViewSchema = z.enum(['front', 'side', 'back']);

export const mealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']);

export const foodLogSourceSchema = z.enum(['ai', 'saved_meal', 'manual']);

export const estimationStatusSchema = z.enum(['final', 'pending', 'failed']);

export const recipeSourceSchema = z.enum(['ai', 'user']);

export const memoryKindSchema = z.enum([
  'preference',
  'dislike',
  'constraint',
  'injury',
  'behavior',
  'fact',
  'goal_note',
]);

export const memoryDomainSchema = z.enum(['training', 'nutrition', 'general']);

export const memorySourceSchema = z.enum(['user', 'coach', 'derived']);

export const insightSeveritySchema = z.enum(['info', 'notice', 'warning']);

export const messageRoleSchema = z.enum(['user', 'assistant', 'system']);

export const aiJobKindSchema = z.enum([
  'estimate_food',
  'weekly_review',
  'insight_phrasing',
  'recipe',
]);

export const aiJobStatusSchema = z.enum(['queued', 'running', 'done', 'failed']);

export const safetyEventKindSchema = z.enum([
  'pain',
  'injury',
  'dizziness',
  'symptom',
  'excessive_fatigue',
]);

export const safetyEventSourceSchema = z.enum(['readiness', 'chat', 'session']);

export const readinessModifierSchema = z.enum(['normal', 'hold', 'reduce', 'safety']);

export const progressionActionSchema = z.enum([
  'increase_load',
  'hold_load',
  'decrease_load',
  'increase_reps',
  'increase_time',
  'progress_variation',
  'reduce_volume',
]);

// ---------------------------------------------------------------------------
// Shared value objects
// ---------------------------------------------------------------------------

export const rationaleSchema = z.object({
  codes: z.array(z.string()),
  facts: z.record(z.string(), z.unknown()),
  summary: z.string(),
});

export const repRangeSchema = z.object({
  min: z.number().int().positive(),
  max: z.number().int().positive(),
});

export const dateRangeSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
});

export const evidenceRefSchema = z.object({
  table: z.string(),
  id: idSchema,
  note: z.string().nullable(),
});

export const macroTotalsSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number(),
});

export const bodyMeasurementsSchema = z.record(z.string(), z.number());

export const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheCreationInputTokens: z.number().int().nonnegative().nullable(),
  cacheReadInputTokens: z.number().int().nonnegative().nullable(),
});

// ---------------------------------------------------------------------------
// Engine outputs — DESIGN.md §5
// ---------------------------------------------------------------------------

export const progressionDecisionSchema = z.object({
  exerciseId: idSchema,
  action: progressionActionSchema,
  targetLoadKg: z.number().nonnegative().nullable(),
  targetRepMin: z.number().int().positive(),
  targetRepMax: z.number().int().positive(),
  targetSets: z.number().int().positive(),
  restSec: z.number().int().nonnegative(),
  suggestedExerciseId: idSchema.nullable(),
  loadDeltaKg: z.number(),
  rationale: rationaleSchema,
});

// ---------------------------------------------------------------------------
// Profile & settings
// ---------------------------------------------------------------------------

export const profileSchema = z.object({
  id: idSchema,
  displayName: z.string(),
  birthDate: localDateSchema.nullable(),
  sex: sexSchema.nullable(),
  heightCm: z.number().positive().nullable(),
  weightKg: z.number().positive().nullable(),
  fitnessLevel: fitnessLevelSchema,
  trainingExperienceMonths: z.number().int().nonnegative(),
  preferredDurationMin: z.number().int().positive(),
  preferredStyles: z.array(z.string()),
  trainingLocation: trainingLocationSchema,
  unitSystem: unitSystemSchema,
  foodRegion: z.string(),
  activityLevel: activityLevelSchema,
  notes: z.string().nullable(),
  updatedAt: isoTimestampSchema,
});

export const goalSchema = z.object({
  id: idSchema,
  type: goalTypeSchema,
  priority: z.number().int().positive(),
  targetNote: z.string().nullable(),
  active: z.boolean(),
  createdAt: isoTimestampSchema,
});

export const equipmentSchema = z.object({
  id: idSchema,
  name: z.string(),
  category: equipmentCategorySchema,
  available: z.boolean(),
  loadIncrementKg: z.number().positive().nullable(),
  notes: z.string().nullable(),
});

export const nutritionTargetsSchema = z.object({
  id: idSchema,
  effectiveFrom: localDateSchema,
  kcal: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative(),
  source: nutritionTargetSourceSchema,
});

export const settingsEntrySchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const reminderTimesSchema = z.object({
  workout: localTimeSchema.nullable(),
  mealLog: localTimeSchema.nullable(),
  protein: localTimeSchema.nullable(),
  weeklyReview: localTimeSchema.nullable(),
});

export const settingsSchema = z.object({
  apiKeyRef: z.string().nullable(),
  coachModel: z.string(),
  fastModel: z.string(),
  notificationsEnabled: z.boolean(),
  reminderTimes: reminderTimesSchema,
  weekStartsOn: weekDaySchema,
  onboardingComplete: z.boolean(),
  disclaimerAcceptedAt: isoTimestampSchema.nullable(),
  insightsLastRunOn: localDateSchema.nullable(),
  /** `null` = follow `weekStartsOn` (DESIGN.md §7.3). */
  weeklyReviewDay: weekDaySchema.nullable(),
  lastReviewViewedWeek: localDateSchema.nullable(),
  serverSideFallback: z.boolean(),
});

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

export const exerciseSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  movementPattern: movementPatternSchema,
  primaryMuscles: z.array(z.string()),
  secondaryMuscles: z.array(z.string()),
  equipment: z.array(equipmentCategorySchema),
  difficulty: difficultySchema,
  instructions: z.string(),
  cues: z.array(z.string()),
  isCustom: z.boolean(),
  loadType: loadTypeSchema,
  defaultRepRange: repRangeSchema,
  archived: z.boolean(),
});

export const exerciseRelationSchema = z.object({
  fromId: idSchema,
  toId: idSchema,
  kind: exerciseRelationKindSchema,
  note: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export const workoutSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  status: workoutStatusSchema,
  source: workoutSourceSchema,
  title: z.string(),
  focus: z.array(z.string()),
  plannedDurationMin: z.number().int().nonnegative(),
  startedAt: isoTimestampSchema.nullable(),
  finishedAt: isoTimestampSchema.nullable(),
  readinessId: idSchema.nullable(),
  rationale: rationaleSchema.nullable(),
  coachMessageId: idSchema.nullable(),
  notes: z.string().nullable(),
});

export const workoutExerciseSchema = z.object({
  id: idSchema,
  workoutId: idSchema,
  order: z.number().int().nonnegative(),
  exerciseId: idSchema,
  targetSets: z.number().int().positive(),
  targetRepMin: z.number().int().positive(),
  targetRepMax: z.number().int().positive(),
  targetLoadKg: z.number().nonnegative().nullable(),
  restSec: z.number().int().nonnegative(),
  tempo: z.string().nullable(),
  substitutedFromExerciseId: idSchema.nullable(),
  progressionDecision: progressionDecisionSchema.nullable(),
  notes: z.string().nullable(),
});

export const setRecordSchema = z.object({
  id: idSchema,
  workoutExerciseId: idSchema,
  setIndex: z.number().int().nonnegative(),
  targetReps: z.number().int().nonnegative(),
  actualReps: z.number().int().nonnegative().nullable(),
  actualLoadKg: z.number().nonnegative().nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  completed: z.boolean(),
  isWarmup: z.boolean(),
  notes: z.string().nullable(),
  completedAt: isoTimestampSchema.nullable(),
});

export const personalRecordSchema = z.object({
  id: idSchema,
  exerciseId: idSchema,
  kind: personalRecordKindSchema,
  value: z.number(),
  loadKg: z.number().nonnegative().nullable(),
  reps: z.number().int().nonnegative().nullable(),
  setId: idSchema.nullable(),
  date: localDateSchema,
});

export const readinessSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  sleepHours: z.number().nonnegative().nullable(),
  sleepQuality: scale1To5Schema.nullable(),
  energy: scale1To5Schema.nullable(),
  soreness: scale1To5Schema.nullable(),
  fatigue: scale1To5Schema.nullable(),
  stress: scale1To5Schema.nullable(),
  painReported: z.boolean(),
  painNote: z.string().nullable(),
  score: z.number().min(0).max(100).nullable(),
  notes: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export const bodyMetricSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  weightKg: z.number().positive().nullable(),
  waistCm: z.number().positive().nullable(),
  measurements: bodyMeasurementsSchema,
  notes: z.string().nullable(),
});

export const progressPhotoSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  view: progressPhotoViewSchema,
  fileRef: z.string(),
  note: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export const foodLogSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  mealSlot: mealSlotSchema,
  rawText: z.string(),
  loggedAt: isoTimestampSchema,
  source: foodLogSourceSchema,
  estimationStatus: estimationStatusSchema,
});

export const foodItemDraftSchema = z.object({
  name: z.string(),
  quantity: z.number().nonnegative(),
  unit: z.string(),
  kcal: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  savedMealId: idSchema.nullable(),
});

export const foodItemSchema = foodItemDraftSchema.extend({
  id: idSchema,
  foodLogId: idSchema,
});

export const savedMealSchema = z.object({
  id: idSchema,
  name: z.string(),
  items: z.array(foodItemDraftSchema),
  kcal: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative(),
  timesLogged: z.number().int().nonnegative(),
  lastLoggedAt: isoTimestampSchema.nullable(),
});

export const inventoryItemSchema = z.object({
  id: idSchema,
  name: z.string(),
  quantity: z.number().nonnegative(),
  unit: z.string(),
  category: z.string().nullable(),
  addedAt: isoTimestampSchema,
  useBy: localDateSchema.nullable(),
  notes: z.string().nullable(),
});

export const recipeIngredientSchema = z.object({
  name: z.string(),
  quantity: z.number().nonnegative(),
  unit: z.string(),
  note: z.string().nullable(),
});

export const recipeSchema = z.object({
  id: idSchema,
  title: z.string(),
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(z.string()),
  timeMinutes: z.number().int().nonnegative(),
  servings: z.number().int().positive(),
  perServing: macroTotalsSchema,
  tags: z.array(z.string()),
  source: recipeSourceSchema,
  timesMade: z.number().int().nonnegative(),
  lastMadeAt: isoTimestampSchema.nullable(),
  saved: z.boolean(),
});

export const dayPlanMealSchema = z.object({
  mealSlot: mealSlotSchema,
  title: z.string(),
  items: z.array(foodItemDraftSchema),
  recipeId: idSchema.nullable(),
  savedMealId: idSchema.nullable(),
});

export const dayPlanSchema = z.object({
  date: localDateSchema,
  meals: z.array(dayPlanMealSchema),
  totals: macroTotalsSchema,
});

export const mealPlanConstraintsSchema = z.object({
  kcalPerDay: z.number().nonnegative().nullable(),
  proteinGPerDay: z.number().nonnegative().nullable(),
  dietary: z.array(z.string()),
  excludeIngredients: z.array(z.string()),
  maxCookMinutes: z.number().int().nonnegative().nullable(),
  useInventoryFirst: z.boolean(),
});

export const mealPlanSchema = z.object({
  id: idSchema,
  startDate: localDateSchema,
  days: z.number().int().positive(),
  plan: z.array(dayPlanSchema),
  constraints: mealPlanConstraintsSchema,
  createdAt: isoTimestampSchema,
});

// ---------------------------------------------------------------------------
// Memory & insight
// ---------------------------------------------------------------------------

export const memorySchema = z.object({
  id: idSchema,
  kind: memoryKindSchema,
  domain: memoryDomainSchema,
  text: z.string(),
  source: memorySourceSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(evidenceRefSchema),
  active: z.boolean(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema.nullable(),
});

export const insightSchema = z.object({
  id: idSchema,
  detector: z.string(),
  period: dateRangeSchema,
  headline: z.string(),
  detail: z.string(),
  evidence: z.array(evidenceRefSchema),
  severity: insightSeveritySchema,
  dismissed: z.boolean(),
  /** When the user dismissed it; `null` while `dismissed` is false. */
  dismissedAt: isoTimestampSchema.nullable(),
  createdAt: isoTimestampSchema,
});

export const muscleGroupVolumeSchema = z.object({
  muscle: z.string(),
  sets: z.number().int().nonnegative(),
  volumeKg: z.number().nonnegative(),
});

export const personalRecordSummarySchema = z.object({
  exerciseId: idSchema,
  exerciseName: z.string(),
  kind: personalRecordKindSchema,
  value: z.number(),
  date: localDateSchema,
});

export const trainingWeekStatsSchema = z.object({
  workoutsCompleted: z.number().int().nonnegative(),
  workoutsPlanned: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1),
  totalSets: z.number().int().nonnegative(),
  totalVolumeKg: z.number().nonnegative(),
  volumeByMuscleGroup: z.array(muscleGroupVolumeSchema),
  personalRecords: z.array(personalRecordSummarySchema),
  missedSessions: z.number().int().nonnegative(),
  averageRpe: z.number().nullable(),
  averageDurationMin: z.number().nullable(),
});

export const macroHitRateSchema = z.object({
  kcal: z.number().min(0).max(1),
  proteinG: z.number().min(0).max(1),
  carbsG: z.number().min(0).max(1),
  fatG: z.number().min(0).max(1),
  fiberG: z.number().min(0).max(1),
});

export const nutritionWeekStatsSchema = z.object({
  daysLogged: z.number().int().nonnegative(),
  averageKcal: z.number().nonnegative(),
  averageProteinG: z.number().nonnegative(),
  averageCarbsG: z.number().nonnegative(),
  averageFatG: z.number().nonnegative(),
  averageFiberG: z.number().nonnegative(),
  targetHitRate: macroHitRateSchema,
  missedTargets: z.array(z.string()),
});

export const weeklyReviewSchema = z.object({
  id: idSchema,
  weekStart: localDateSchema,
  training: trainingWeekStatsSchema,
  nutrition: nutritionWeekStatsSchema,
  summary: z.string().nullable(),
  recommendation: z.string().nullable(),
  generatedAt: isoTimestampSchema,
});

// ---------------------------------------------------------------------------
// Coach
// ---------------------------------------------------------------------------

export const conversationSchema = z.object({
  id: idSchema,
  title: z.string(),
  createdAt: isoTimestampSchema,
  lastMessageAt: isoTimestampSchema,
  archived: z.boolean(),
});

export const messageSchema = z.object({
  id: idSchema,
  conversationId: idSchema,
  role: messageRoleSchema,
  content: z.array(z.unknown()),
  model: z.string().nullable(),
  usage: tokenUsageSchema.nullable(),
  createdAt: isoTimestampSchema,
});

export const aiJobSchema = z.object({
  id: idSchema,
  kind: aiJobKindSchema,
  payload: z.record(z.string(), z.unknown()),
  status: aiJobStatusSchema,
  attempts: z.number().int().nonnegative(),
  resultRef: z.string().nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  lastError: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

export const safetyEventSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  kind: safetyEventKindSchema,
  text: z.string(),
  source: safetyEventSourceSchema,
  resolvedAt: isoTimestampSchema.nullable(),
  note: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Plans and view models
// ---------------------------------------------------------------------------

export const workoutPlanExerciseSchema = z.object({
  exerciseId: idSchema,
  order: z.number().int().nonnegative(),
  targetSets: z.number().int().positive(),
  targetRepMin: z.number().int().positive(),
  targetRepMax: z.number().int().positive(),
  targetLoadKg: z.number().nonnegative().nullable(),
  restSec: z.number().int().nonnegative(),
  tempo: z.string().nullable(),
  substitutedFromExerciseId: idSchema.nullable(),
  progressionDecision: progressionDecisionSchema.nullable(),
  notes: z.string().nullable(),
});

export const workoutPlanSchema = z.object({
  date: localDateSchema,
  title: z.string(),
  focus: z.array(z.string()),
  plannedDurationMin: z.number().int().nonnegative(),
  source: workoutSourceSchema,
  exercises: z.array(workoutPlanExerciseSchema),
  readinessId: idSchema.nullable(),
  notes: z.string().nullable(),
  rationale: rationaleSchema,
});

export const foodLogWithItemsSchema = foodLogSchema.extend({
  items: z.array(foodItemSchema),
});

export const dayNutritionSchema = z.object({
  date: localDateSchema,
  targets: nutritionTargetsSchema.nullable(),
  consumed: macroTotalsSchema,
  remaining: macroTotalsSchema,
  logs: z.array(foodLogWithItemsSchema),
  mealsLogged: z.number().int().nonnegative(),
});

export const workoutExerciseWithSetsSchema = workoutExerciseSchema.extend({
  sets: z.array(setRecordSchema),
});

export const workoutWithExercisesSchema = workoutSchema.extend({
  exercises: z.array(workoutExerciseWithSetsSchema),
});

export const exerciseSessionSchema = z.object({
  workoutId: idSchema,
  workoutExerciseId: idSchema,
  exerciseId: idSchema,
  date: localDateSchema,
  status: workoutStatusSchema,
  targetRepMin: z.number().int().positive(),
  targetRepMax: z.number().int().positive(),
  targetLoadKg: z.number().nonnegative().nullable(),
  sets: z.array(setRecordSchema),
});

// ---------------------------------------------------------------------------
// Export / import — DESIGN.md §8
// ---------------------------------------------------------------------------

export const exportBundlePhotoSchema = z.object({
  fileRef: z.string(),
  base64: z.string(),
});

export const exportTablesSchema = z.object({
  profile: z.array(profileSchema),
  goals: z.array(goalSchema),
  equipment: z.array(equipmentSchema),
  nutritionTargets: z.array(nutritionTargetsSchema),
  settings: z.array(settingsEntrySchema),
  exercises: z.array(exerciseSchema),
  exerciseRelations: z.array(exerciseRelationSchema),
  workouts: z.array(workoutSchema),
  workoutExercises: z.array(workoutExerciseSchema),
  sets: z.array(setRecordSchema),
  personalRecords: z.array(personalRecordSchema),
  readiness: z.array(readinessSchema),
  bodyMetrics: z.array(bodyMetricSchema),
  progressPhotos: z.array(progressPhotoSchema),
  foodLogs: z.array(foodLogSchema),
  foodItems: z.array(foodItemSchema),
  savedMeals: z.array(savedMealSchema),
  inventoryItems: z.array(inventoryItemSchema),
  recipes: z.array(recipeSchema),
  mealPlans: z.array(mealPlanSchema),
  memories: z.array(memorySchema),
  insights: z.array(insightSchema),
  weeklyReviews: z.array(weeklyReviewSchema),
  conversations: z.array(conversationSchema),
  messages: z.array(messageSchema),
  aiJobs: z.array(aiJobSchema),
  safetyEvents: z.array(safetyEventSchema),
});

/** Bumped whenever `ExportTables` changes shape. */
export const EXPORT_SCHEMA_VERSION = 1;

export const exportBundleSchema = z.object({
  schemaVersion: z.number().int().positive(),
  appVersion: z.string(),
  exportedAt: isoTimestampSchema,
  unitSystem: unitSystemSchema,
  tables: exportTablesSchema,
  photos: z.array(exportBundlePhotoSchema),
});

// ---------------------------------------------------------------------------
// Compile-time parity between types.ts and schemas.ts
//
// If a schema and its interface drift apart, `SchemaParityErrors` stops being
// `never` and the assignment below fails to typecheck, naming the offender.
// ---------------------------------------------------------------------------

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Parity = {
  scale1To5: Exact<z.infer<typeof scale1To5Schema>, Scale1To5>;
  difficulty: Exact<z.infer<typeof difficultySchema>, Difficulty>;
  weekDay: Exact<z.infer<typeof weekDaySchema>, WeekDay>;
  fitnessLevel: Exact<z.infer<typeof fitnessLevelSchema>, FitnessLevel>;
  sex: Exact<z.infer<typeof sexSchema>, Sex>;
  unitSystem: Exact<z.infer<typeof unitSystemSchema>, UnitSystem>;
  trainingLocation: Exact<z.infer<typeof trainingLocationSchema>, TrainingLocation>;
  activityLevel: Exact<z.infer<typeof activityLevelSchema>, ActivityLevel>;
  goalType: Exact<z.infer<typeof goalTypeSchema>, GoalType>;
  equipmentCategory: Exact<z.infer<typeof equipmentCategorySchema>, EquipmentCategory>;
  nutritionTargetSource: Exact<z.infer<typeof nutritionTargetSourceSchema>, NutritionTargetSource>;
  movementPattern: Exact<z.infer<typeof movementPatternSchema>, MovementPattern>;
  loadType: Exact<z.infer<typeof loadTypeSchema>, LoadType>;
  exerciseRelationKind: Exact<z.infer<typeof exerciseRelationKindSchema>, ExerciseRelationKind>;
  workoutStatus: Exact<z.infer<typeof workoutStatusSchema>, WorkoutStatus>;
  workoutSource: Exact<z.infer<typeof workoutSourceSchema>, WorkoutSource>;
  personalRecordKind: Exact<z.infer<typeof personalRecordKindSchema>, PersonalRecordKind>;
  progressPhotoView: Exact<z.infer<typeof progressPhotoViewSchema>, ProgressPhotoView>;
  mealSlot: Exact<z.infer<typeof mealSlotSchema>, MealSlot>;
  foodLogSource: Exact<z.infer<typeof foodLogSourceSchema>, FoodLogSource>;
  estimationStatus: Exact<z.infer<typeof estimationStatusSchema>, EstimationStatus>;
  recipeSource: Exact<z.infer<typeof recipeSourceSchema>, RecipeSource>;
  memoryKind: Exact<z.infer<typeof memoryKindSchema>, MemoryKind>;
  memoryDomain: Exact<z.infer<typeof memoryDomainSchema>, MemoryDomain>;
  memorySource: Exact<z.infer<typeof memorySourceSchema>, MemorySource>;
  insightSeverity: Exact<z.infer<typeof insightSeveritySchema>, InsightSeverity>;
  messageRole: Exact<z.infer<typeof messageRoleSchema>, MessageRole>;
  aiJobKind: Exact<z.infer<typeof aiJobKindSchema>, AiJobKind>;
  aiJobStatus: Exact<z.infer<typeof aiJobStatusSchema>, AiJobStatus>;
  safetyEventKind: Exact<z.infer<typeof safetyEventKindSchema>, SafetyEventKind>;
  safetyEventSource: Exact<z.infer<typeof safetyEventSourceSchema>, SafetyEventSource>;
  readinessModifier: Exact<z.infer<typeof readinessModifierSchema>, ReadinessModifier>;
  progressionAction: Exact<z.infer<typeof progressionActionSchema>, ProgressionAction>;

  rationale: Exact<z.infer<typeof rationaleSchema>, Rationale>;
  repRange: Exact<z.infer<typeof repRangeSchema>, RepRange>;
  dateRange: Exact<z.infer<typeof dateRangeSchema>, DateRange>;
  evidenceRef: Exact<z.infer<typeof evidenceRefSchema>, EvidenceRef>;
  macroTotals: Exact<z.infer<typeof macroTotalsSchema>, MacroTotals>;
  bodyMeasurements: Exact<z.infer<typeof bodyMeasurementsSchema>, BodyMeasurements>;
  tokenUsage: Exact<z.infer<typeof tokenUsageSchema>, TokenUsage>;
  progressionDecision: Exact<z.infer<typeof progressionDecisionSchema>, ProgressionDecision>;

  profile: Exact<z.infer<typeof profileSchema>, Profile>;
  goal: Exact<z.infer<typeof goalSchema>, Goal>;
  equipment: Exact<z.infer<typeof equipmentSchema>, Equipment>;
  nutritionTargets: Exact<z.infer<typeof nutritionTargetsSchema>, NutritionTargets>;
  settingsEntry: Exact<z.infer<typeof settingsEntrySchema>, SettingsEntry>;
  reminderTimes: Exact<z.infer<typeof reminderTimesSchema>, ReminderTimes>;
  settings: Exact<z.infer<typeof settingsSchema>, Settings>;

  exercise: Exact<z.infer<typeof exerciseSchema>, Exercise>;
  exerciseRelation: Exact<z.infer<typeof exerciseRelationSchema>, ExerciseRelation>;

  workout: Exact<z.infer<typeof workoutSchema>, Workout>;
  workoutExercise: Exact<z.infer<typeof workoutExerciseSchema>, WorkoutExercise>;
  setRecord: Exact<z.infer<typeof setRecordSchema>, SetRecord>;
  personalRecord: Exact<z.infer<typeof personalRecordSchema>, PersonalRecord>;
  readiness: Exact<z.infer<typeof readinessSchema>, Readiness>;

  bodyMetric: Exact<z.infer<typeof bodyMetricSchema>, BodyMetric>;
  progressPhoto: Exact<z.infer<typeof progressPhotoSchema>, ProgressPhoto>;

  foodLog: Exact<z.infer<typeof foodLogSchema>, FoodLog>;
  foodItemDraft: Exact<z.infer<typeof foodItemDraftSchema>, FoodItemDraft>;
  foodItem: Exact<z.infer<typeof foodItemSchema>, FoodItem>;
  savedMeal: Exact<z.infer<typeof savedMealSchema>, SavedMeal>;
  inventoryItem: Exact<z.infer<typeof inventoryItemSchema>, InventoryItem>;
  recipeIngredient: Exact<z.infer<typeof recipeIngredientSchema>, RecipeIngredient>;
  recipe: Exact<z.infer<typeof recipeSchema>, Recipe>;
  dayPlanMeal: Exact<z.infer<typeof dayPlanMealSchema>, DayPlanMeal>;
  dayPlan: Exact<z.infer<typeof dayPlanSchema>, DayPlan>;
  mealPlanConstraints: Exact<z.infer<typeof mealPlanConstraintsSchema>, MealPlanConstraints>;
  mealPlan: Exact<z.infer<typeof mealPlanSchema>, MealPlan>;

  memory: Exact<z.infer<typeof memorySchema>, Memory>;
  insight: Exact<z.infer<typeof insightSchema>, Insight>;
  muscleGroupVolume: Exact<z.infer<typeof muscleGroupVolumeSchema>, MuscleGroupVolume>;
  personalRecordSummary: Exact<z.infer<typeof personalRecordSummarySchema>, PersonalRecordSummary>;
  trainingWeekStats: Exact<z.infer<typeof trainingWeekStatsSchema>, TrainingWeekStats>;
  macroHitRate: Exact<z.infer<typeof macroHitRateSchema>, MacroHitRate>;
  nutritionWeekStats: Exact<z.infer<typeof nutritionWeekStatsSchema>, NutritionWeekStats>;
  weeklyReview: Exact<z.infer<typeof weeklyReviewSchema>, WeeklyReview>;

  conversation: Exact<z.infer<typeof conversationSchema>, Conversation>;
  message: Exact<z.infer<typeof messageSchema>, Message>;
  aiJob: Exact<z.infer<typeof aiJobSchema>, AiJob>;
  safetyEvent: Exact<z.infer<typeof safetyEventSchema>, SafetyEvent>;

  workoutPlanExercise: Exact<z.infer<typeof workoutPlanExerciseSchema>, WorkoutPlanExercise>;
  workoutPlan: Exact<z.infer<typeof workoutPlanSchema>, WorkoutPlan>;
  foodLogWithItems: Exact<z.infer<typeof foodLogWithItemsSchema>, FoodLogWithItems>;
  dayNutrition: Exact<z.infer<typeof dayNutritionSchema>, DayNutrition>;
  workoutExerciseWithSets: Exact<
    z.infer<typeof workoutExerciseWithSetsSchema>,
    WorkoutExerciseWithSets
  >;
  workoutWithExercises: Exact<z.infer<typeof workoutWithExercisesSchema>, WorkoutWithExercises>;
  exerciseSession: Exact<z.infer<typeof exerciseSessionSchema>, ExerciseSession>;

  exportBundlePhoto: Exact<z.infer<typeof exportBundlePhotoSchema>, ExportBundlePhoto>;
  exportTables: Exact<z.infer<typeof exportTablesSchema>, ExportTables>;
  exportBundle: Exact<z.infer<typeof exportBundleSchema>, ExportBundle>;
};

/** `never` when every schema matches its interface; otherwise the drifting keys. */
export type SchemaParityErrors = {
  [K in keyof Parity]: Parity[K] extends true ? never : K;
}[keyof Parity];

/**
 * Fails to typecheck when a schema stops matching its interface. The error
 * message names the offending key, e.g.
 * `Type 'true' is not assignable to type '{ SCHEMA_TYPE_DRIFT: "rationale" }'`.
 */
const _schemaParityHolds: [SchemaParityErrors] extends [never]
  ? true
  : { SCHEMA_TYPE_DRIFT: SchemaParityErrors } = true;
