/**
 * Drizzle schema for every table in DESIGN.md §4.1.
 *
 * Column names are the §4.1 field names verbatim (camelCase), so a `select()`
 * row is structurally the matching `@vigor/core` domain type and the repository
 * layer needs no hand-written mapper. The repositories assert that by declaring
 * their return types as the core interfaces.
 *
 * Storage conventions (DESIGN.md §4):
 *   - ids are UUID v7 strings          -> `text` primary keys
 *   - timestamps are ISO 8601 UTC      -> `text`
 *   - calendar days are `YYYY-MM-DD`   -> `text`
 *   - booleans                         -> `integer` 0/1
 *   - json payloads                    -> `text` with `mode: 'json'`
 *   - canonical units are kg, cm, g, kcal, seconds — never display units
 */

import type {
  ActivityLevel,
  AiJobKind,
  AiJobStatus,
  BodyMeasurements,
  DateRange,
  DayPlan,
  Difficulty,
  EquipmentCategory,
  EstimationStatus,
  EvidenceRef,
  ExerciseRelationKind,
  FitnessLevel,
  FoodItemDraft,
  FoodLogSource,
  GoalType,
  InsightSeverity,
  LoadType,
  MacroTotals,
  MealPlanConstraints,
  MealSlot,
  MemoryDomain,
  MemoryKind,
  MemorySource,
  MessageRole,
  MovementPattern,
  NutritionTargetSource,
  NutritionWeekStats,
  PersonalRecordKind,
  ProgressPhotoView,
  ProgressionDecision,
  Rationale,
  RecipeIngredient,
  RecipeSource,
  RepRange,
  SafetyEventKind,
  SafetyEventSource,
  Scale1To5,
  Sex,
  TokenUsage,
  TrainingLocation,
  TrainingWeekStats,
  UnitSystem,
  WorkoutSource,
  WorkoutStatus,
} from '@vigor/core';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Profile & settings
// ---------------------------------------------------------------------------

/** `profile` — single row (DESIGN.md §4.1). */
export const profile = sqliteTable('profile', {
  id: text('id').primaryKey(),
  displayName: text('displayName').notNull(),
  birthDate: text('birthDate'),
  sex: text('sex').$type<Sex>(),
  heightCm: real('heightCm'),
  weightKg: real('weightKg'),
  fitnessLevel: text('fitnessLevel').$type<FitnessLevel>().notNull(),
  trainingExperienceMonths: integer('trainingExperienceMonths').notNull(),
  preferredDurationMin: integer('preferredDurationMin').notNull(),
  preferredStyles: text('preferredStyles', { mode: 'json' }).$type<string[]>().notNull(),
  trainingLocation: text('trainingLocation').$type<TrainingLocation>().notNull(),
  unitSystem: text('unitSystem').$type<UnitSystem>().notNull(),
  foodRegion: text('foodRegion').notNull(),
  activityLevel: text('activityLevel').$type<ActivityLevel>().notNull(),
  notes: text('notes'),
  updatedAt: text('updatedAt').notNull(),
});

/** `goals` */
export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    type: text('type').$type<GoalType>().notNull(),
    /** 1 = highest. */
    priority: integer('priority').notNull(),
    targetNote: text('targetNote'),
    active: integer('active', { mode: 'boolean' }).notNull(),
    createdAt: text('createdAt').notNull(),
  },
  (table) => [index('goals_active_priority_idx').on(table.active, table.priority)],
);

/** `equipment` */
export const equipment = sqliteTable(
  'equipment',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category').$type<EquipmentCategory>().notNull(),
    available: integer('available', { mode: 'boolean' }).notNull(),
    /** Smallest load jump possible with this item, in kg. */
    loadIncrementKg: real('loadIncrementKg'),
    notes: text('notes'),
  },
  (table) => [index('equipment_available_idx').on(table.available)],
);

/** `nutrition_targets` */
export const nutritionTargets = sqliteTable(
  'nutrition_targets',
  {
    id: text('id').primaryKey(),
    effectiveFrom: text('effectiveFrom').notNull(),
    kcal: real('kcal').notNull(),
    proteinG: real('proteinG').notNull(),
    carbsG: real('carbsG').notNull(),
    fatG: real('fatG').notNull(),
    fiberG: real('fiberG').notNull(),
    source: text('source').$type<NutritionTargetSource>().notNull(),
  },
  (table) => [index('nutrition_targets_effective_from_idx').on(table.effectiveFrom)],
);

/** `settings` — key/value; `value` holds JSON-encoded scalars (DESIGN.md §4.1). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

/** `exercises` */
export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    movementPattern: text('movementPattern').$type<MovementPattern>().notNull(),
    primaryMuscles: text('primaryMuscles', { mode: 'json' }).$type<string[]>().notNull(),
    secondaryMuscles: text('secondaryMuscles', { mode: 'json' }).$type<string[]>().notNull(),
    equipment: text('equipment', { mode: 'json' }).$type<EquipmentCategory[]>().notNull(),
    difficulty: integer('difficulty').$type<Difficulty>().notNull(),
    instructions: text('instructions').notNull(),
    cues: text('cues', { mode: 'json' }).$type<string[]>().notNull(),
    isCustom: integer('isCustom', { mode: 'boolean' }).notNull(),
    loadType: text('loadType').$type<LoadType>().notNull(),
    defaultRepRange: text('defaultRepRange', { mode: 'json' }).$type<RepRange>().notNull(),
    archived: integer('archived', { mode: 'boolean' }).notNull(),
  },
  (table) => [
    index('exercises_pattern_idx').on(table.movementPattern),
    index('exercises_archived_idx').on(table.archived),
  ],
);

/** `exercise_relations` — the variation/progression/regression/substitution graph. */
export const exerciseRelations = sqliteTable(
  'exercise_relations',
  {
    fromId: text('fromId')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    toId: text('toId')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ExerciseRelationKind>().notNull(),
    note: text('note'),
  },
  (table) => [
    primaryKey({ columns: [table.fromId, table.toId, table.kind] }),
    index('exercise_relations_from_idx').on(table.fromId, table.kind),
    index('exercise_relations_to_idx').on(table.toId, table.kind),
  ],
);

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

/** `workouts` */
export const workouts = sqliteTable(
  'workouts',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    status: text('status').$type<WorkoutStatus>().notNull(),
    source: text('source').$type<WorkoutSource>().notNull(),
    title: text('title').notNull(),
    focus: text('focus', { mode: 'json' }).$type<string[]>().notNull(),
    plannedDurationMin: integer('plannedDurationMin').notNull(),
    startedAt: text('startedAt'),
    finishedAt: text('finishedAt'),
    readinessId: text('readinessId'),
    rationale: text('rationale', { mode: 'json' }).$type<Rationale>(),
    coachMessageId: text('coachMessageId'),
    notes: text('notes'),
  },
  (table) => [
    index('workouts_date_idx').on(table.date),
    index('workouts_status_date_idx').on(table.status, table.date),
  ],
);

/** `workout_exercises` */
export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    id: text('id').primaryKey(),
    workoutId: text('workoutId')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    /** Position in the session, 0-based. `order` is quoted in generated SQL. */
    order: integer('order').notNull(),
    exerciseId: text('exerciseId')
      .notNull()
      .references(() => exercises.id),
    targetSets: integer('targetSets').notNull(),
    targetRepMin: integer('targetRepMin').notNull(),
    targetRepMax: integer('targetRepMax').notNull(),
    targetLoadKg: real('targetLoadKg'),
    restSec: integer('restSec').notNull(),
    tempo: text('tempo'),
    substitutedFromExerciseId: text('substitutedFromExerciseId').references(() => exercises.id),
    progressionDecision: text('progressionDecision', { mode: 'json' }).$type<ProgressionDecision>(),
    notes: text('notes'),
  },
  (table) => [
    index('workout_exercises_workout_idx').on(table.workoutId, table.order),
    index('workout_exercises_exercise_idx').on(table.exerciseId),
  ],
);

/** `sets` — one logged set. The core type is `SetRecord` (`Set` is taken in JS). */
export const sets = sqliteTable(
  'sets',
  {
    id: text('id').primaryKey(),
    workoutExerciseId: text('workoutExerciseId')
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    /** Position within the exercise, 0-based. */
    setIndex: integer('setIndex').notNull(),
    targetReps: integer('targetReps').notNull(),
    actualReps: integer('actualReps'),
    actualLoadKg: real('actualLoadKg'),
    /** 1–10, halves allowed. */
    rpe: real('rpe'),
    completed: integer('completed', { mode: 'boolean' }).notNull(),
    isWarmup: integer('isWarmup', { mode: 'boolean' }).notNull(),
    notes: text('notes'),
    completedAt: text('completedAt'),
  },
  (table) => [index('sets_workout_exercise_idx').on(table.workoutExerciseId, table.setIndex)],
);

/** `personal_records` */
export const personalRecords = sqliteTable(
  'personal_records',
  {
    id: text('id').primaryKey(),
    exerciseId: text('exerciseId')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<PersonalRecordKind>().notNull(),
    value: real('value').notNull(),
    loadKg: real('loadKg'),
    reps: integer('reps'),
    setId: text('setId'),
    date: text('date').notNull(),
  },
  (table) => [index('personal_records_exercise_idx').on(table.exerciseId, table.kind, table.date)],
);

/** `readiness` — one check-in per day. */
export const readiness = sqliteTable(
  'readiness',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull().unique(),
    sleepHours: real('sleepHours'),
    sleepQuality: integer('sleepQuality').$type<Scale1To5>(),
    energy: integer('energy').$type<Scale1To5>(),
    soreness: integer('soreness').$type<Scale1To5>(),
    fatigue: integer('fatigue').$type<Scale1To5>(),
    stress: integer('stress').$type<Scale1To5>(),
    painReported: integer('painReported', { mode: 'boolean' }).notNull(),
    painNote: text('painNote'),
    /** 0–100, computed by the readiness engine (DESIGN.md §5.2). */
    score: real('score'),
    notes: text('notes'),
  },
  (table) => [index('readiness_date_idx').on(table.date)],
);

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

/** `body_metrics` */
export const bodyMetrics = sqliteTable(
  'body_metrics',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    weightKg: real('weightKg'),
    waistCm: real('waistCm'),
    measurements: text('measurements', { mode: 'json' }).$type<BodyMeasurements>().notNull(),
    notes: text('notes'),
  },
  (table) => [index('body_metrics_date_idx').on(table.date)],
);

/** `progress_photos` */
export const progressPhotos = sqliteTable(
  'progress_photos',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    view: text('view').$type<ProgressPhotoView>().notNull(),
    /** App-sandbox relative path, never an absolute path (DESIGN.md §7.3). */
    fileRef: text('fileRef').notNull(),
    note: text('note'),
  },
  (table) => [index('progress_photos_date_idx').on(table.date, table.view)],
);

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

/** `food_logs` */
export const foodLogs = sqliteTable(
  'food_logs',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    mealSlot: text('mealSlot').$type<MealSlot>().notNull(),
    rawText: text('rawText').notNull(),
    loggedAt: text('loggedAt').notNull(),
    source: text('source').$type<FoodLogSource>().notNull(),
    estimationStatus: text('estimationStatus').$type<EstimationStatus>().notNull(),
  },
  (table) => [index('food_logs_date_idx').on(table.date, table.mealSlot)],
);

/** `food_items` */
export const foodItems = sqliteTable(
  'food_items',
  {
    id: text('id').primaryKey(),
    foodLogId: text('foodLogId')
      .notNull()
      .references(() => foodLogs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    quantity: real('quantity').notNull(),
    /** Free-text unit as the user said it, e.g. `g`, `roti`, `cup`. */
    unit: text('unit').notNull(),
    kcal: real('kcal').notNull(),
    proteinG: real('proteinG').notNull(),
    carbsG: real('carbsG').notNull(),
    fatG: real('fatG').notNull(),
    fiberG: real('fiberG').notNull(),
    /** 0–1 estimation confidence. */
    confidence: real('confidence').notNull(),
    savedMealId: text('savedMealId'),
  },
  (table) => [index('food_items_log_idx').on(table.foodLogId)],
);

/** `saved_meals` */
export const savedMeals = sqliteTable('saved_meals', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  items: text('items', { mode: 'json' }).$type<FoodItemDraft[]>().notNull(),
  kcal: real('kcal').notNull(),
  proteinG: real('proteinG').notNull(),
  carbsG: real('carbsG').notNull(),
  fatG: real('fatG').notNull(),
  fiberG: real('fiberG').notNull(),
  timesLogged: integer('timesLogged').notNull(),
  lastLoggedAt: text('lastLoggedAt'),
});

/** `inventory_items` — the pantry. */
export const inventoryItems = sqliteTable(
  'inventory_items',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    quantity: real('quantity').notNull(),
    unit: text('unit').notNull(),
    category: text('category'),
    addedAt: text('addedAt').notNull(),
    useBy: text('useBy'),
    notes: text('notes'),
  },
  (table) => [index('inventory_items_use_by_idx').on(table.useBy)],
);

/** `recipes` */
export const recipes = sqliteTable(
  'recipes',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    ingredients: text('ingredients', { mode: 'json' }).$type<RecipeIngredient[]>().notNull(),
    steps: text('steps', { mode: 'json' }).$type<string[]>().notNull(),
    timeMinutes: integer('timeMinutes').notNull(),
    servings: integer('servings').notNull(),
    perServing: text('perServing', { mode: 'json' }).$type<MacroTotals>().notNull(),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
    source: text('source').$type<RecipeSource>().notNull(),
    timesMade: integer('timesMade').notNull(),
    lastMadeAt: text('lastMadeAt'),
    saved: integer('saved', { mode: 'boolean' }).notNull(),
  },
  (table) => [index('recipes_saved_idx').on(table.saved)],
);

/** `meal_plans` */
export const mealPlans = sqliteTable(
  'meal_plans',
  {
    id: text('id').primaryKey(),
    startDate: text('startDate').notNull(),
    days: integer('days').notNull(),
    plan: text('plan', { mode: 'json' }).$type<DayPlan[]>().notNull(),
    constraints: text('constraints', { mode: 'json' }).$type<MealPlanConstraints>().notNull(),
    createdAt: text('createdAt').notNull(),
  },
  (table) => [index('meal_plans_start_date_idx').on(table.startDate)],
);

// ---------------------------------------------------------------------------
// Memory & insight
// ---------------------------------------------------------------------------

/** `memories` — `active` is the soft-delete flag `memories.forget` clears. */
export const memories = sqliteTable(
  'memories',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<MemoryKind>().notNull(),
    domain: text('domain').$type<MemoryDomain>().notNull(),
    text: text('text').notNull(),
    source: text('source').$type<MemorySource>().notNull(),
    confidence: real('confidence').notNull(),
    evidence: text('evidence', { mode: 'json' }).$type<EvidenceRef[]>().notNull(),
    active: integer('active', { mode: 'boolean' }).notNull(),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
    expiresAt: text('expiresAt'),
  },
  (table) => [index('memories_active_idx').on(table.active, table.updatedAt)],
);

/**
 * `memory_forgets` — the audit trail behind `memories.forget` (DESIGN.md §4.2).
 * `memories` rows are never deleted, so every forget keeps its reason and time.
 */
export const memoryForgets = sqliteTable(
  'memory_forgets',
  {
    id: text('id').primaryKey(),
    memoryId: text('memoryId')
      .notNull()
      .references(() => memories.id, { onDelete: 'cascade' }),
    reason: text('reason'),
    forgottenAt: text('forgottenAt').notNull(),
  },
  (table) => [index('memory_forgets_memory_idx').on(table.memoryId)],
);

/** `insights` */
export const insights = sqliteTable(
  'insights',
  {
    id: text('id').primaryKey(),
    detector: text('detector').notNull(),
    period: text('period', { mode: 'json' }).$type<DateRange>().notNull(),
    headline: text('headline').notNull(),
    detail: text('detail').notNull(),
    evidence: text('evidence', { mode: 'json' }).$type<EvidenceRef[]>().notNull(),
    severity: text('severity').$type<InsightSeverity>().notNull(),
    dismissed: integer('dismissed', { mode: 'boolean' }).notNull(),
    createdAt: text('createdAt').notNull(),
  },
  (table) => [
    index('insights_dismissed_idx').on(table.dismissed, table.createdAt),
    index('insights_detector_idx').on(table.detector),
  ],
);

/** `weekly_reviews` */
export const weeklyReviews = sqliteTable(
  'weekly_reviews',
  {
    id: text('id').primaryKey(),
    weekStart: text('weekStart').notNull().unique(),
    training: text('training', { mode: 'json' }).$type<TrainingWeekStats>().notNull(),
    nutrition: text('nutrition', { mode: 'json' }).$type<NutritionWeekStats>().notNull(),
    summary: text('summary'),
    recommendation: text('recommendation'),
    generatedAt: text('generatedAt').notNull(),
  },
  (table) => [index('weekly_reviews_week_start_idx').on(table.weekStart)],
);

// ---------------------------------------------------------------------------
// Coach
// ---------------------------------------------------------------------------

/** `conversations` */
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    createdAt: text('createdAt').notNull(),
    lastMessageAt: text('lastMessageAt').notNull(),
    archived: integer('archived', { mode: 'boolean' }).notNull(),
  },
  (table) => [index('conversations_last_message_idx').on(table.archived, table.lastMessageAt)],
);

/** `messages` — `content` holds Anthropic content blocks (incl. tool_use/tool_result). */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversationId')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').$type<MessageRole>().notNull(),
    content: text('content', { mode: 'json' }).$type<unknown[]>().notNull(),
    model: text('model'),
    usage: text('usage', { mode: 'json' }).$type<TokenUsage>(),
    createdAt: text('createdAt').notNull(),
  },
  (table) => [index('messages_conversation_idx').on(table.conversationId, table.createdAt)],
);

/** `ai_jobs` — the offline retry queue (DESIGN.md §8). */
export const aiJobs = sqliteTable(
  'ai_jobs',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<AiJobKind>().notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    status: text('status').$type<AiJobStatus>().notNull(),
    attempts: integer('attempts').notNull(),
    resultRef: text('resultRef'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
    lastError: text('lastError'),
  },
  (table) => [index('ai_jobs_status_idx').on(table.status, table.createdAt)],
);

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

/** `safety_events` — an unresolved row means safety state is active (DESIGN.md §6.5). */
export const safetyEvents = sqliteTable(
  'safety_events',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    kind: text('kind').$type<SafetyEventKind>().notNull(),
    text: text('text').notNull(),
    source: text('source').$type<SafetyEventSource>().notNull(),
    resolvedAt: text('resolvedAt'),
    note: text('note'),
  },
  (table) => [index('safety_events_resolved_idx').on(table.resolvedAt, table.date)],
);

// ---------------------------------------------------------------------------
// Migration bookkeeping
// ---------------------------------------------------------------------------

/**
 * `_migrations` — which generated migrations this database has applied.
 * Written only by `migrate()`; drizzle-kit never generates a diff for it
 * because it is excluded from `drizzle.config.ts`'s schema entry point.
 */
export const MIGRATIONS_TABLE = '_migrations';

/** Every table in the schema, keyed for the drizzle instance. */
export const schema = {
  profile,
  goals,
  equipment,
  nutritionTargets,
  settings,
  exercises,
  exerciseRelations,
  workouts,
  workoutExercises,
  sets,
  personalRecords,
  readiness,
  bodyMetrics,
  progressPhotos,
  foodLogs,
  foodItems,
  savedMeals,
  inventoryItems,
  recipes,
  mealPlans,
  memories,
  memoryForgets,
  insights,
  weeklyReviews,
  conversations,
  messages,
  aiJobs,
  safetyEvents,
};

export type Schema = typeof schema;
