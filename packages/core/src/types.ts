/**
 * VigorEngine domain types — DESIGN.md §4.1 (tables), §5 (engine outputs), §8 (export).
 *
 * Storage conventions (DESIGN.md §4):
 *   - every id is a UUID v7 string
 *   - every timestamp is an ISO 8601 UTC string
 *   - every "calendar day for the user" is a local `YYYY-MM-DD` string
 *   - canonical units are kg, cm, g, kcal, seconds — never display units
 *
 * `packages/core/src/schemas.ts` holds a zod schema for every type in this file
 * and asserts at compile time that the two stay in sync.
 */

// ---------------------------------------------------------------------------
// Scalar aliases
// ---------------------------------------------------------------------------

/** UUID v7 primary key. */
export type Id = string;

/** ISO 8601 UTC timestamp, e.g. `2026-09-10T06:31:00.000Z`. */
export type IsoTimestamp = string;

/** A calendar day in the user's local timezone, `YYYY-MM-DD`. */
export type LocalDate = string;

/** A local wall-clock time of day, `HH:mm`. */
export type LocalTime = string;

/** 1–5 subjective scale used by the readiness check-in. */
export type Scale1To5 = 1 | 2 | 3 | 4 | 5;

/** Exercise difficulty, 1 (easiest) – 5 (hardest). */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** Day index, 0 = Sunday .. 6 = Saturday. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ---------------------------------------------------------------------------
// Enum-like string unions
// ---------------------------------------------------------------------------

export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';

export type Sex = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export type UnitSystem = 'metric' | 'imperial';

export type TrainingLocation = 'home' | 'gym' | 'outdoor' | 'hotel' | 'other';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export type GoalType =
  | 'strength'
  | 'hypertrophy'
  | 'fat_loss'
  | 'general'
  | 'endurance'
  | 'mobility'
  | 'conditioning'
  | 'consistency';

export type EquipmentCategory =
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'band'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'cardio'
  | 'other';

export type NutritionTargetSource = 'user' | 'computed';

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'carry'
  | 'core'
  | 'isolation'
  | 'cardio'
  | 'mobility';

export type LoadType = 'external' | 'bodyweight' | 'assisted' | 'band' | 'time' | 'distance';

export type ExerciseRelationKind = 'variation' | 'progression' | 'regression' | 'substitution';

export type WorkoutStatus = 'planned' | 'in_progress' | 'completed' | 'skipped' | 'abandoned';

export type WorkoutSource = 'ai' | 'rule' | 'manual' | 'template';

export type PersonalRecordKind = 'e1rm' | 'max_load' | 'max_reps_at_load' | 'session_volume';

export type ProgressPhotoView = 'front' | 'side' | 'back';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';

export type FoodLogSource = 'ai' | 'saved_meal' | 'manual';

export type EstimationStatus = 'final' | 'pending' | 'failed';

export type RecipeSource = 'ai' | 'user';

export type MemoryKind =
  'preference' | 'dislike' | 'constraint' | 'injury' | 'behavior' | 'fact' | 'goal_note';

export type MemoryDomain = 'training' | 'nutrition' | 'general';

export type MemorySource = 'user' | 'coach' | 'derived';

export type InsightSeverity = 'info' | 'notice' | 'warning';

export type MessageRole = 'user' | 'assistant' | 'system';

export type AiJobKind = 'estimate_food' | 'weekly_review' | 'insight_phrasing' | 'recipe';

export type AiJobStatus = 'queued' | 'running' | 'done' | 'failed';

export type SafetyEventKind = 'pain' | 'injury' | 'dizziness' | 'symptom' | 'excessive_fatigue';

export type SafetyEventSource = 'readiness' | 'chat' | 'session';

/** Output of the readiness engine — DESIGN.md §5.2. */
export type ReadinessModifier = 'normal' | 'hold' | 'reduce' | 'safety';

/** What the progression engine decided to do next — DESIGN.md §5.1. */
export type ProgressionAction =
  | 'increase_load'
  | 'hold_load'
  | 'decrease_load'
  | 'increase_reps'
  | 'increase_time'
  | 'progress_variation'
  | 'reduce_volume';

// ---------------------------------------------------------------------------
// Shared value objects
// ---------------------------------------------------------------------------

/**
 * Why an engine decided what it decided — DESIGN.md §5.
 * Every recommendation carries one; the UI surfaces `summary` behind "Why?".
 */
export interface Rationale {
  /** Machine reason codes, e.g. `["ALL_SETS_TOP_OF_RANGE", "RPE_UNDER_THRESHOLD"]`. */
  codes: string[];
  /** The numbers that drove the decision. */
  facts: Record<string, unknown>;
  /** One plain sentence, template-generated — no AI required. */
  summary: string;
}

/** Inclusive rep target range. */
export interface RepRange {
  min: number;
  max: number;
}

/** An inclusive date range, used by insights and reviews. */
export interface DateRange {
  from: LocalDate;
  to: LocalDate;
}

/** A pointer back to the raw log row that justifies a memory or insight. */
export interface EvidenceRef {
  /** Table name, e.g. `sets`, `food_items`, `workouts`. */
  table: string;
  id: Id;
  note: string | null;
}

/** The five tracked macros, in canonical units (kcal and grams). */
export interface MacroTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

/**
 * Circumference measurements in cm. Well-known keys are `chestCm`, `hipsCm`,
 * `armCm`, `thighCm`, `calfCm`, `neckCm`; users may add their own.
 */
export type BodyMeasurements = Record<string, number>;

/** Well-known measurement keys, offered by the UI before custom entries. */
export const KNOWN_MEASUREMENT_KEYS = [
  'chestCm',
  'hipsCm',
  'armCm',
  'thighCm',
  'calfCm',
  'neckCm',
] as const;

/** Token accounting for one assistant message. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
}

// ---------------------------------------------------------------------------
// Profile & settings — DESIGN.md §4.1
// ---------------------------------------------------------------------------

/** `profile` — single row. */
export interface Profile {
  id: Id;
  displayName: string;
  birthDate: LocalDate | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  fitnessLevel: FitnessLevel;
  trainingExperienceMonths: number;
  preferredDurationMin: number;
  /** json string[] */
  preferredStyles: string[];
  trainingLocation: TrainingLocation;
  unitSystem: UnitSystem;
  /** ISO 3166-1 alpha-2 region hint for food estimation, or `generic`. */
  foodRegion: string;
  activityLevel: ActivityLevel;
  notes: string | null;
  updatedAt: IsoTimestamp;
}

/** `goals` */
export interface Goal {
  id: Id;
  type: GoalType;
  /** 1 = highest priority. */
  priority: number;
  targetNote: string | null;
  active: boolean;
  createdAt: IsoTimestamp;
}

/** `equipment` */
export interface Equipment {
  id: Id;
  name: string;
  category: EquipmentCategory;
  available: boolean;
  /** Smallest load jump possible with this item, in kg. Null = not load-bearing. */
  loadIncrementKg: number | null;
  notes: string | null;
}

/** `nutrition_targets` */
export interface NutritionTargets {
  id: Id;
  effectiveFrom: LocalDate;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  source: NutritionTargetSource;
}

/** One row of the `settings` key/value table. */
export interface SettingsEntry {
  key: string;
  /** JSON-encoded value; use `Settings` for the decoded, typed view. */
  value: string;
}

/** When each reminder fires, `HH:mm` local, null = disabled — DESIGN.md §7.3. */
export interface ReminderTimes {
  workout: LocalTime | null;
  mealLog: LocalTime | null;
  protein: LocalTime | null;
  weeklyReview: LocalTime | null;
}

/** The decoded `settings` table — DESIGN.md §4.1 "Profile & settings". */
export interface Settings {
  /**
   * Opaque handle to the Anthropic API key in the platform SecureStore.
   * Never the key itself, never logged, never exported (DESIGN.md §8).
   */
  apiKeyRef: string | null;
  coachModel: string;
  fastModel: string;
  notificationsEnabled: boolean;
  reminderTimes: ReminderTimes;
  weekStartsOn: WeekDay;
  onboardingComplete: boolean;
  disclaimerAcceptedAt: IsoTimestamp | null;
}

// ---------------------------------------------------------------------------
// Exercise library — DESIGN.md §4.1
// ---------------------------------------------------------------------------

/** `exercises` */
export interface Exercise {
  id: Id;
  name: string;
  slug: string;
  movementPattern: MovementPattern;
  /** json string[] */
  primaryMuscles: string[];
  /** json string[] */
  secondaryMuscles: string[];
  /** json EquipmentCategory[] */
  equipment: EquipmentCategory[];
  difficulty: Difficulty;
  instructions: string;
  /** json string[] — short coaching cues. */
  cues: string[];
  isCustom: boolean;
  loadType: LoadType;
  defaultRepRange: RepRange;
  archived: boolean;
}

/** `exercise_relations` — the substitution/progression graph. */
export interface ExerciseRelation {
  fromId: Id;
  toId: Id;
  kind: ExerciseRelationKind;
  note: string | null;
}

// ---------------------------------------------------------------------------
// Training — DESIGN.md §4.1
// ---------------------------------------------------------------------------

/** `workouts` */
export interface Workout {
  id: Id;
  date: LocalDate;
  status: WorkoutStatus;
  source: WorkoutSource;
  title: string;
  /** json muscle groups */
  focus: string[];
  plannedDurationMin: number;
  startedAt: IsoTimestamp | null;
  finishedAt: IsoTimestamp | null;
  readinessId: Id | null;
  rationale: Rationale | null;
  coachMessageId: Id | null;
  notes: string | null;
}

/** `workout_exercises` */
export interface WorkoutExercise {
  id: Id;
  workoutId: Id;
  /** Position in the session, 0-based. */
  order: number;
  exerciseId: Id;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  /** Canonical kg. Null for bodyweight/time/distance load types. */
  targetLoadKg: number | null;
  restSec: number;
  tempo: string | null;
  substitutedFromExerciseId: Id | null;
  progressionDecision: ProgressionDecision | null;
  notes: string | null;
}

/** `sets` — one logged set. */
export interface SetRecord {
  id: Id;
  workoutExerciseId: Id;
  /** Position within the exercise, 0-based. */
  setIndex: number;
  targetReps: number;
  actualReps: number | null;
  actualLoadKg: number | null;
  /** 1–10, halves allowed. Null when the user did not rate it. */
  rpe: number | null;
  completed: boolean;
  isWarmup: boolean;
  notes: string | null;
  completedAt: IsoTimestamp | null;
}

/** `personal_records` */
export interface PersonalRecord {
  id: Id;
  exerciseId: Id;
  kind: PersonalRecordKind;
  /** The record value in the unit implied by `kind` (kg, reps, or kg of volume). */
  value: number;
  loadKg: number | null;
  reps: number | null;
  setId: Id | null;
  date: LocalDate;
}

/** `readiness` — today's check-in. */
export interface Readiness {
  id: Id;
  date: LocalDate;
  sleepHours: number | null;
  sleepQuality: Scale1To5 | null;
  energy: Scale1To5 | null;
  soreness: Scale1To5 | null;
  fatigue: Scale1To5 | null;
  stress: Scale1To5 | null;
  painReported: boolean;
  painNote: string | null;
  /** 0–100, computed by the readiness engine (DESIGN.md §5.2). */
  score: number | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Body — DESIGN.md §4.1
// ---------------------------------------------------------------------------

/** `body_metrics` */
export interface BodyMetric {
  id: Id;
  date: LocalDate;
  weightKg: number | null;
  waistCm: number | null;
  measurements: BodyMeasurements;
  notes: string | null;
}

/** `progress_photos` */
export interface ProgressPhoto {
  id: Id;
  date: LocalDate;
  view: ProgressPhotoView;
  /** App-sandbox relative path, e.g. `photos/2026-09-10-front.jpg`. */
  fileRef: string;
  note: string | null;
}

// ---------------------------------------------------------------------------
// Nutrition — DESIGN.md §4.1
// ---------------------------------------------------------------------------

/** `food_logs` */
export interface FoodLog {
  id: Id;
  date: LocalDate;
  mealSlot: MealSlot;
  rawText: string;
  loggedAt: IsoTimestamp;
  source: FoodLogSource;
  estimationStatus: EstimationStatus;
}

/**
 * One estimated or saved food item, before it is attached to a log row.
 * This is also the shape the food-parsing prompt returns (DESIGN.md §6.4).
 */
export interface FoodItemDraft {
  name: string;
  quantity: number;
  /** Free-text unit as the user said it, e.g. `g`, `roti`, `cup`. */
  unit: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  /** 0–1 estimation confidence. */
  confidence: number;
  savedMealId: Id | null;
}

/** `food_items` */
export interface FoodItem extends FoodItemDraft {
  id: Id;
  foodLogId: Id;
}

/** `saved_meals` — `items` is stored without log ids, so it holds drafts. */
export interface SavedMeal {
  id: Id;
  name: string;
  items: FoodItemDraft[];
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  timesLogged: number;
  lastLoggedAt: IsoTimestamp | null;
}

/** `inventory_items` — the pantry. */
export interface InventoryItem {
  id: Id;
  name: string;
  quantity: number;
  unit: string;
  category: string | null;
  addedAt: IsoTimestamp;
  useBy: LocalDate | null;
  notes: string | null;
}

/** One line of a recipe's ingredient list. */
export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
  note: string | null;
}

/** `recipes` */
export interface Recipe {
  id: Id;
  title: string;
  ingredients: RecipeIngredient[];
  /** json string[] */
  steps: string[];
  timeMinutes: number;
  servings: number;
  perServing: MacroTotals;
  /** json string[] */
  tags: string[];
  source: RecipeSource;
  timesMade: number;
  lastMadeAt: IsoTimestamp | null;
  saved: boolean;
}

/** One planned meal inside a `DayPlan`. */
export interface DayPlanMeal {
  mealSlot: MealSlot;
  title: string;
  items: FoodItemDraft[];
  recipeId: Id | null;
  savedMealId: Id | null;
}

/** One day of a meal plan — DESIGN.md §6.4. */
export interface DayPlan {
  date: LocalDate;
  meals: DayPlanMeal[];
  totals: MacroTotals;
}

/** What the meal planner had to respect. */
export interface MealPlanConstraints {
  kcalPerDay: number | null;
  proteinGPerDay: number | null;
  /** e.g. `vegetarian`, `no_beef`, `lactose_free`. */
  dietary: string[];
  excludeIngredients: string[];
  maxCookMinutes: number | null;
  useInventoryFirst: boolean;
}

/** `meal_plans` */
export interface MealPlan {
  id: Id;
  startDate: LocalDate;
  days: number;
  plan: DayPlan[];
  constraints: MealPlanConstraints;
  createdAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Memory & insight — DESIGN.md §4.1
// ---------------------------------------------------------------------------

/** `memories` */
export interface Memory {
  id: Id;
  kind: MemoryKind;
  domain: MemoryDomain;
  text: string;
  source: MemorySource;
  /** 0–1. */
  confidence: number;
  evidence: EvidenceRef[];
  /** `forget` soft-deletes by clearing this, keeping the audit trail. */
  active: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  expiresAt: IsoTimestamp | null;
}

/** `insights` */
export interface Insight {
  id: Id;
  /** Detector code, e.g. `EXERCISE_TREND` (DESIGN.md §5.8). */
  detector: string;
  period: DateRange;
  headline: string;
  detail: string;
  evidence: EvidenceRef[];
  severity: InsightSeverity;
  dismissed: boolean;
  createdAt: IsoTimestamp;
}

/** Set volume for one muscle group over a period. */
export interface MuscleGroupVolume {
  muscle: string;
  sets: number;
  volumeKg: number;
}

/** A PR as it appears in a weekly review. */
export interface PersonalRecordSummary {
  exerciseId: Id;
  exerciseName: string;
  kind: PersonalRecordKind;
  value: number;
  date: LocalDate;
}

/** Deterministic training stats for one week — DESIGN.md §5.9. */
export interface TrainingWeekStats {
  workoutsCompleted: number;
  workoutsPlanned: number;
  /** 0–1. */
  completionRate: number;
  totalSets: number;
  totalVolumeKg: number;
  volumeByMuscleGroup: MuscleGroupVolume[];
  personalRecords: PersonalRecordSummary[];
  missedSessions: number;
  averageRpe: number | null;
  averageDurationMin: number | null;
}

/** Share of days each macro target was met, 0–1. */
export interface MacroHitRate {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

/** Deterministic nutrition stats for one week — DESIGN.md §5.9. */
export interface NutritionWeekStats {
  daysLogged: number;
  averageKcal: number;
  averageProteinG: number;
  averageCarbsG: number;
  averageFatG: number;
  averageFiberG: number;
  targetHitRate: MacroHitRate;
  /** Macro keys missed most often, e.g. `["proteinG", "fiberG"]`. */
  missedTargets: string[];
}

/** `weekly_reviews` — stats are stored first, the coach fills the prose later. */
export interface WeeklyReview {
  id: Id;
  weekStart: LocalDate;
  training: TrainingWeekStats;
  nutrition: NutritionWeekStats;
  summary: string | null;
  recommendation: string | null;
  generatedAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Coach — DESIGN.md §4.1
// ---------------------------------------------------------------------------

/** `conversations` */
export interface Conversation {
  id: Id;
  title: string;
  createdAt: IsoTimestamp;
  lastMessageAt: IsoTimestamp;
  archived: boolean;
}

/** `messages` — `content` holds Anthropic content blocks (incl. tool_use/tool_result). */
export interface Message {
  id: Id;
  conversationId: Id;
  role: MessageRole;
  content: unknown[];
  model: string | null;
  usage: TokenUsage | null;
  createdAt: IsoTimestamp;
}

/** `ai_jobs` — the offline retry queue (DESIGN.md §8). */
export interface AiJob {
  id: Id;
  kind: AiJobKind;
  payload: Record<string, unknown>;
  status: AiJobStatus;
  attempts: number;
  /** Row this job wrote its result into, e.g. a `food_logs` id. */
  resultRef: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Safety — DESIGN.md §4.1, §6.5
// ---------------------------------------------------------------------------

/** `safety_events` */
export interface SafetyEvent {
  id: Id;
  date: LocalDate;
  kind: SafetyEventKind;
  text: string;
  source: SafetyEventSource;
  resolvedAt: IsoTimestamp | null;
  note: string | null;
}

// ---------------------------------------------------------------------------
// Engine outputs — DESIGN.md §5
// ---------------------------------------------------------------------------

/**
 * What the progression engine decided for one exercise — DESIGN.md §5.1.
 * The engine owns every number here; the coach may only ask for `hold` or
 * `lighter` with a reason (DESIGN.md §6.3).
 */
export interface ProgressionDecision {
  exerciseId: Id;
  action: ProgressionAction;
  /** Canonical kg, or null for bodyweight/time/distance load types. */
  targetLoadKg: number | null;
  targetRepMin: number;
  targetRepMax: number;
  targetSets: number;
  restSec: number;
  /** Set when `action` is `progress_variation` (DESIGN.md §5.1 rule 5). */
  suggestedExerciseId: Id | null;
  /** Signed change applied to the previous load, in kg. */
  loadDeltaKg: number;
  rationale: Rationale;
}

/** One exercise slot in a proposed workout. */
export interface WorkoutPlanExercise {
  exerciseId: Id;
  order: number;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  targetLoadKg: number | null;
  restSec: number;
  tempo: string | null;
  substitutedFromExerciseId: Id | null;
  progressionDecision: ProgressionDecision | null;
  notes: string | null;
}

/**
 * A workout before it is written to the database — produced by the rule-based
 * planner (DESIGN.md §5.4) and by the `propose_workout` tool (DESIGN.md §6.3).
 */
export interface WorkoutPlan {
  date: LocalDate;
  title: string;
  focus: string[];
  plannedDurationMin: number;
  source: WorkoutSource;
  exercises: WorkoutPlanExercise[];
  readinessId: Id | null;
  notes: string | null;
  rationale: Rationale;
}

/** A food log with its estimated items resolved. */
export interface FoodLogWithItems extends FoodLog {
  items: FoodItem[];
}

/** Today's nutrition state — DESIGN.md §4.2, §5.6, idea.md §19. */
export interface DayNutrition {
  date: LocalDate;
  /** The targets in effect on `date`, or null if the user has none yet. */
  targets: NutritionTargets | null;
  consumed: MacroTotals;
  /** Signed: negative means over target. The UI clamps at 0 (DESIGN.md §5.6). */
  remaining: MacroTotals;
  logs: FoodLogWithItems[];
  mealsLogged: number;
}

/** A workout with its exercises and their sets, as repositories return it. */
export interface WorkoutExerciseWithSets extends WorkoutExercise {
  sets: SetRecord[];
}

/** DESIGN.md §4.2 — `workouts.getRecent`. */
export interface WorkoutWithExercises extends Workout {
  exercises: WorkoutExerciseWithSets[];
}

/** DESIGN.md §4.2 — `workouts.getExerciseHistory`. One past session of one exercise. */
export interface ExerciseSession {
  workoutId: Id;
  workoutExerciseId: Id;
  exerciseId: Id;
  date: LocalDate;
  status: WorkoutStatus;
  targetRepMin: number;
  targetRepMax: number;
  targetLoadKg: number | null;
  sets: SetRecord[];
}

// ---------------------------------------------------------------------------
// Export / import — DESIGN.md §8
// ---------------------------------------------------------------------------

/** A progress photo carried inside an export bundle. */
export interface ExportBundlePhoto {
  fileRef: string;
  /** base64-encoded file contents. */
  base64: string;
}

/** Every table, in export order. */
export interface ExportTables {
  profile: Profile[];
  goals: Goal[];
  equipment: Equipment[];
  nutritionTargets: NutritionTargets[];
  /** The `apiKeyRef` entry is stripped before export (DESIGN.md §8). */
  settings: SettingsEntry[];
  exercises: Exercise[];
  exerciseRelations: ExerciseRelation[];
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  sets: SetRecord[];
  personalRecords: PersonalRecord[];
  readiness: Readiness[];
  bodyMetrics: BodyMetric[];
  progressPhotos: ProgressPhoto[];
  foodLogs: FoodLog[];
  foodItems: FoodItem[];
  savedMeals: SavedMeal[];
  inventoryItems: InventoryItem[];
  recipes: Recipe[];
  mealPlans: MealPlan[];
  memories: Memory[];
  insights: Insight[];
  weeklyReviews: WeeklyReview[];
  conversations: Conversation[];
  messages: Message[];
  aiJobs: AiJob[];
  safetyEvents: SafetyEvent[];
}

/** `vigorengine-YYYY-MM-DD.json`, encrypted at rest with the user's passphrase. */
export interface ExportBundle {
  /** Bumped whenever the table shapes change; import refuses unknown versions. */
  schemaVersion: number;
  appVersion: string;
  exportedAt: IsoTimestamp;
  unitSystem: UnitSystem;
  tables: ExportTables;
  photos: ExportBundlePhoto[];
}
