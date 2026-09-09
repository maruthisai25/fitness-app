/**
 * GENERATED FILE — do not edit.
 *
 * Produced by `scripts/build-migrations.mjs` from the drizzle-kit output in
 * `packages/db/migrations`. Regenerate with:
 *
 *   pnpm --filter @vigor/db migrations:generate   # schema diff -> .sql
 *   pnpm --filter @vigor/db migrations:build      # .sql -> this file
 */

import type { Migration } from './types';

/** Every migration, in journal order. */
export const MIGRATIONS: readonly Migration[] = [
  {
    idx: 0,
    tag: "0000_init",
    hash: "1b012c6c43bf0e16b9bf46d7bad813017b7e85e78c28a2350e72f3a8ec7f472a",
    statements: [
      "CREATE TABLE `ai_jobs` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`kind` text NOT NULL,\n\t`payload` text NOT NULL,\n\t`status` text NOT NULL,\n\t`attempts` integer NOT NULL,\n\t`resultRef` text,\n\t`createdAt` text NOT NULL,\n\t`updatedAt` text NOT NULL,\n\t`lastError` text\n);",
      "CREATE INDEX `ai_jobs_status_idx` ON `ai_jobs` (`status`,`createdAt`);",
      "CREATE TABLE `body_metrics` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`date` text NOT NULL,\n\t`weightKg` real,\n\t`waistCm` real,\n\t`measurements` text NOT NULL,\n\t`notes` text\n);",
      "CREATE INDEX `body_metrics_date_idx` ON `body_metrics` (`date`);",
      "CREATE TABLE `conversations` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`title` text NOT NULL,\n\t`createdAt` text NOT NULL,\n\t`lastMessageAt` text NOT NULL,\n\t`archived` integer NOT NULL\n);",
      "CREATE INDEX `conversations_last_message_idx` ON `conversations` (`archived`,`lastMessageAt`);",
      "CREATE TABLE `equipment` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`category` text NOT NULL,\n\t`available` integer NOT NULL,\n\t`loadIncrementKg` real,\n\t`notes` text\n);",
      "CREATE INDEX `equipment_available_idx` ON `equipment` (`available`);",
      "CREATE TABLE `exercise_relations` (\n\t`fromId` text NOT NULL,\n\t`toId` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`note` text,\n\tPRIMARY KEY(`fromId`, `toId`, `kind`),\n\tFOREIGN KEY (`fromId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`toId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `exercise_relations_from_idx` ON `exercise_relations` (`fromId`,`kind`);",
      "CREATE INDEX `exercise_relations_to_idx` ON `exercise_relations` (`toId`,`kind`);",
      "CREATE TABLE `exercises` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`slug` text NOT NULL,\n\t`movementPattern` text NOT NULL,\n\t`primaryMuscles` text NOT NULL,\n\t`secondaryMuscles` text NOT NULL,\n\t`equipment` text NOT NULL,\n\t`difficulty` integer NOT NULL,\n\t`instructions` text NOT NULL,\n\t`cues` text NOT NULL,\n\t`isCustom` integer NOT NULL,\n\t`loadType` text NOT NULL,\n\t`defaultRepRange` text NOT NULL,\n\t`archived` integer NOT NULL\n);",
      "CREATE UNIQUE INDEX `exercises_slug_unique` ON `exercises` (`slug`);",
      "CREATE INDEX `exercises_pattern_idx` ON `exercises` (`movementPattern`);",
      "CREATE INDEX `exercises_archived_idx` ON `exercises` (`archived`);",
      "CREATE TABLE `food_items` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`foodLogId` text NOT NULL,\n\t`name` text NOT NULL,\n\t`quantity` real NOT NULL,\n\t`unit` text NOT NULL,\n\t`kcal` real NOT NULL,\n\t`proteinG` real NOT NULL,\n\t`carbsG` real NOT NULL,\n\t`fatG` real NOT NULL,\n\t`fiberG` real NOT NULL,\n\t`confidence` real NOT NULL,\n\t`savedMealId` text,\n\tFOREIGN KEY (`foodLogId`) REFERENCES `food_logs`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `food_items_log_idx` ON `food_items` (`foodLogId`);",
      "CREATE TABLE `food_logs` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`date` text NOT NULL,\n\t`mealSlot` text NOT NULL,\n\t`rawText` text NOT NULL,\n\t`loggedAt` text NOT NULL,\n\t`source` text NOT NULL,\n\t`estimationStatus` text NOT NULL\n);",
      "CREATE INDEX `food_logs_date_idx` ON `food_logs` (`date`,`mealSlot`);",
      "CREATE TABLE `goals` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`type` text NOT NULL,\n\t`priority` integer NOT NULL,\n\t`targetNote` text,\n\t`active` integer NOT NULL,\n\t`createdAt` text NOT NULL\n);",
      "CREATE INDEX `goals_active_priority_idx` ON `goals` (`active`,`priority`);",
      "CREATE TABLE `insights` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`detector` text NOT NULL,\n\t`period` text NOT NULL,\n\t`headline` text NOT NULL,\n\t`detail` text NOT NULL,\n\t`evidence` text NOT NULL,\n\t`severity` text NOT NULL,\n\t`dismissed` integer NOT NULL,\n\t`createdAt` text NOT NULL\n);",
      "CREATE INDEX `insights_dismissed_idx` ON `insights` (`dismissed`,`createdAt`);",
      "CREATE INDEX `insights_detector_idx` ON `insights` (`detector`);",
      "CREATE TABLE `inventory_items` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`quantity` real NOT NULL,\n\t`unit` text NOT NULL,\n\t`category` text,\n\t`addedAt` text NOT NULL,\n\t`useBy` text,\n\t`notes` text\n);",
      "CREATE INDEX `inventory_items_use_by_idx` ON `inventory_items` (`useBy`);",
      "CREATE TABLE `meal_plans` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`startDate` text NOT NULL,\n\t`days` integer NOT NULL,\n\t`plan` text NOT NULL,\n\t`constraints` text NOT NULL,\n\t`createdAt` text NOT NULL\n);",
      "CREATE INDEX `meal_plans_start_date_idx` ON `meal_plans` (`startDate`);",
      "CREATE TABLE `memories` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`kind` text NOT NULL,\n\t`domain` text NOT NULL,\n\t`text` text NOT NULL,\n\t`source` text NOT NULL,\n\t`confidence` real NOT NULL,\n\t`evidence` text NOT NULL,\n\t`active` integer NOT NULL,\n\t`createdAt` text NOT NULL,\n\t`updatedAt` text NOT NULL,\n\t`expiresAt` text\n);",
      "CREATE INDEX `memories_active_idx` ON `memories` (`active`,`updatedAt`);",
      "CREATE TABLE `memory_forgets` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`memoryId` text NOT NULL,\n\t`reason` text,\n\t`forgottenAt` text NOT NULL,\n\tFOREIGN KEY (`memoryId`) REFERENCES `memories`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `memory_forgets_memory_idx` ON `memory_forgets` (`memoryId`);",
      "CREATE TABLE `messages` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`conversationId` text NOT NULL,\n\t`role` text NOT NULL,\n\t`content` text NOT NULL,\n\t`model` text,\n\t`usage` text,\n\t`createdAt` text NOT NULL,\n\tFOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `messages_conversation_idx` ON `messages` (`conversationId`,`createdAt`);",
      "CREATE TABLE `nutrition_targets` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`effectiveFrom` text NOT NULL,\n\t`kcal` real NOT NULL,\n\t`proteinG` real NOT NULL,\n\t`carbsG` real NOT NULL,\n\t`fatG` real NOT NULL,\n\t`fiberG` real NOT NULL,\n\t`source` text NOT NULL\n);",
      "CREATE INDEX `nutrition_targets_effective_from_idx` ON `nutrition_targets` (`effectiveFrom`);",
      "CREATE TABLE `personal_records` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`exerciseId` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`value` real NOT NULL,\n\t`loadKg` real,\n\t`reps` integer,\n\t`setId` text,\n\t`date` text NOT NULL,\n\tFOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `personal_records_exercise_idx` ON `personal_records` (`exerciseId`,`kind`,`date`);",
      "CREATE TABLE `profile` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`displayName` text NOT NULL,\n\t`birthDate` text,\n\t`sex` text,\n\t`heightCm` real,\n\t`weightKg` real,\n\t`fitnessLevel` text NOT NULL,\n\t`trainingExperienceMonths` integer NOT NULL,\n\t`preferredDurationMin` integer NOT NULL,\n\t`preferredStyles` text NOT NULL,\n\t`trainingLocation` text NOT NULL,\n\t`unitSystem` text NOT NULL,\n\t`foodRegion` text NOT NULL,\n\t`activityLevel` text NOT NULL,\n\t`notes` text,\n\t`updatedAt` text NOT NULL\n);",
      "CREATE TABLE `progress_photos` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`date` text NOT NULL,\n\t`view` text NOT NULL,\n\t`fileRef` text NOT NULL,\n\t`note` text\n);",
      "CREATE INDEX `progress_photos_date_idx` ON `progress_photos` (`date`,`view`);",
      "CREATE TABLE `readiness` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`date` text NOT NULL,\n\t`sleepHours` real,\n\t`sleepQuality` integer,\n\t`energy` integer,\n\t`soreness` integer,\n\t`fatigue` integer,\n\t`stress` integer,\n\t`painReported` integer NOT NULL,\n\t`painNote` text,\n\t`score` real,\n\t`notes` text\n);",
      "CREATE UNIQUE INDEX `readiness_date_unique` ON `readiness` (`date`);",
      "CREATE INDEX `readiness_date_idx` ON `readiness` (`date`);",
      "CREATE TABLE `recipes` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`title` text NOT NULL,\n\t`ingredients` text NOT NULL,\n\t`steps` text NOT NULL,\n\t`timeMinutes` integer NOT NULL,\n\t`servings` integer NOT NULL,\n\t`perServing` text NOT NULL,\n\t`tags` text NOT NULL,\n\t`source` text NOT NULL,\n\t`timesMade` integer NOT NULL,\n\t`lastMadeAt` text,\n\t`saved` integer NOT NULL\n);",
      "CREATE INDEX `recipes_saved_idx` ON `recipes` (`saved`);",
      "CREATE TABLE `safety_events` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`date` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`text` text NOT NULL,\n\t`source` text NOT NULL,\n\t`resolvedAt` text,\n\t`note` text\n);",
      "CREATE INDEX `safety_events_resolved_idx` ON `safety_events` (`resolvedAt`,`date`);",
      "CREATE TABLE `saved_meals` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`items` text NOT NULL,\n\t`kcal` real NOT NULL,\n\t`proteinG` real NOT NULL,\n\t`carbsG` real NOT NULL,\n\t`fatG` real NOT NULL,\n\t`fiberG` real NOT NULL,\n\t`timesLogged` integer NOT NULL,\n\t`lastLoggedAt` text\n);",
      "CREATE TABLE `sets` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`workoutExerciseId` text NOT NULL,\n\t`setIndex` integer NOT NULL,\n\t`targetReps` integer NOT NULL,\n\t`actualReps` integer,\n\t`actualLoadKg` real,\n\t`rpe` real,\n\t`completed` integer NOT NULL,\n\t`isWarmup` integer NOT NULL,\n\t`notes` text,\n\t`completedAt` text,\n\tFOREIGN KEY (`workoutExerciseId`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `sets_workout_exercise_idx` ON `sets` (`workoutExerciseId`,`setIndex`);",
      "CREATE TABLE `settings` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`value` text NOT NULL\n);",
      "CREATE TABLE `weekly_reviews` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`weekStart` text NOT NULL,\n\t`training` text NOT NULL,\n\t`nutrition` text NOT NULL,\n\t`summary` text,\n\t`recommendation` text,\n\t`generatedAt` text NOT NULL\n);",
      "CREATE UNIQUE INDEX `weekly_reviews_weekStart_unique` ON `weekly_reviews` (`weekStart`);",
      "CREATE INDEX `weekly_reviews_week_start_idx` ON `weekly_reviews` (`weekStart`);",
      "CREATE TABLE `workout_exercises` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`workoutId` text NOT NULL,\n\t`order` integer NOT NULL,\n\t`exerciseId` text NOT NULL,\n\t`targetSets` integer NOT NULL,\n\t`targetRepMin` integer NOT NULL,\n\t`targetRepMax` integer NOT NULL,\n\t`targetLoadKg` real,\n\t`restSec` integer NOT NULL,\n\t`tempo` text,\n\t`substitutedFromExerciseId` text,\n\t`progressionDecision` text,\n\t`notes` text,\n\tFOREIGN KEY (`workoutId`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`substitutedFromExerciseId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE INDEX `workout_exercises_workout_idx` ON `workout_exercises` (`workoutId`,`order`);",
      "CREATE INDEX `workout_exercises_exercise_idx` ON `workout_exercises` (`exerciseId`);",
      "CREATE TABLE `workouts` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`date` text NOT NULL,\n\t`status` text NOT NULL,\n\t`source` text NOT NULL,\n\t`title` text NOT NULL,\n\t`focus` text NOT NULL,\n\t`plannedDurationMin` integer NOT NULL,\n\t`startedAt` text,\n\t`finishedAt` text,\n\t`readinessId` text,\n\t`rationale` text,\n\t`coachMessageId` text,\n\t`notes` text\n);",
      "CREATE INDEX `workouts_date_idx` ON `workouts` (`date`);",
      "CREATE INDEX `workouts_status_date_idx` ON `workouts` (`status`,`date`);",
    ],
  },
  {
    idx: 1,
    tag: "0001_insights_dismissed_at",
    hash: "1be1f02d133dfe0760c1a5a98000474a28a0426e8d80d02852cdf5d5edc77101",
    statements: [
      "ALTER TABLE `insights` ADD `dismissedAt` text;",
    ],
  },
];
