CREATE TABLE `ai_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer NOT NULL,
	`resultRef` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`lastError` text
);
--> statement-breakpoint
CREATE INDEX `ai_jobs_status_idx` ON `ai_jobs` (`status`,`createdAt`);--> statement-breakpoint
CREATE TABLE `body_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`weightKg` real,
	`waistCm` real,
	`measurements` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `body_metrics_date_idx` ON `body_metrics` (`date`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`createdAt` text NOT NULL,
	`lastMessageAt` text NOT NULL,
	`archived` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversations_last_message_idx` ON `conversations` (`archived`,`lastMessageAt`);--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`available` integer NOT NULL,
	`loadIncrementKg` real,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `equipment_available_idx` ON `equipment` (`available`);--> statement-breakpoint
CREATE TABLE `exercise_relations` (
	`fromId` text NOT NULL,
	`toId` text NOT NULL,
	`kind` text NOT NULL,
	`note` text,
	PRIMARY KEY(`fromId`, `toId`, `kind`),
	FOREIGN KEY (`fromId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`toId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exercise_relations_from_idx` ON `exercise_relations` (`fromId`,`kind`);--> statement-breakpoint
CREATE INDEX `exercise_relations_to_idx` ON `exercise_relations` (`toId`,`kind`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`movementPattern` text NOT NULL,
	`primaryMuscles` text NOT NULL,
	`secondaryMuscles` text NOT NULL,
	`equipment` text NOT NULL,
	`difficulty` integer NOT NULL,
	`instructions` text NOT NULL,
	`cues` text NOT NULL,
	`isCustom` integer NOT NULL,
	`loadType` text NOT NULL,
	`defaultRepRange` text NOT NULL,
	`archived` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_slug_unique` ON `exercises` (`slug`);--> statement-breakpoint
CREATE INDEX `exercises_pattern_idx` ON `exercises` (`movementPattern`);--> statement-breakpoint
CREATE INDEX `exercises_archived_idx` ON `exercises` (`archived`);--> statement-breakpoint
CREATE TABLE `food_items` (
	`id` text PRIMARY KEY NOT NULL,
	`foodLogId` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`kcal` real NOT NULL,
	`proteinG` real NOT NULL,
	`carbsG` real NOT NULL,
	`fatG` real NOT NULL,
	`fiberG` real NOT NULL,
	`confidence` real NOT NULL,
	`savedMealId` text,
	FOREIGN KEY (`foodLogId`) REFERENCES `food_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `food_items_log_idx` ON `food_items` (`foodLogId`);--> statement-breakpoint
CREATE TABLE `food_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`mealSlot` text NOT NULL,
	`rawText` text NOT NULL,
	`loggedAt` text NOT NULL,
	`source` text NOT NULL,
	`estimationStatus` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `food_logs_date_idx` ON `food_logs` (`date`,`mealSlot`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`priority` integer NOT NULL,
	`targetNote` text,
	`active` integer NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `goals_active_priority_idx` ON `goals` (`active`,`priority`);--> statement-breakpoint
CREATE TABLE `insights` (
	`id` text PRIMARY KEY NOT NULL,
	`detector` text NOT NULL,
	`period` text NOT NULL,
	`headline` text NOT NULL,
	`detail` text NOT NULL,
	`evidence` text NOT NULL,
	`severity` text NOT NULL,
	`dismissed` integer NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `insights_dismissed_idx` ON `insights` (`dismissed`,`createdAt`);--> statement-breakpoint
CREATE INDEX `insights_detector_idx` ON `insights` (`detector`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`category` text,
	`addedAt` text NOT NULL,
	`useBy` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `inventory_items_use_by_idx` ON `inventory_items` (`useBy`);--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`startDate` text NOT NULL,
	`days` integer NOT NULL,
	`plan` text NOT NULL,
	`constraints` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meal_plans_start_date_idx` ON `meal_plans` (`startDate`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`domain` text NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`confidence` real NOT NULL,
	`evidence` text NOT NULL,
	`active` integer NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`expiresAt` text
);
--> statement-breakpoint
CREATE INDEX `memories_active_idx` ON `memories` (`active`,`updatedAt`);--> statement-breakpoint
CREATE TABLE `memory_forgets` (
	`id` text PRIMARY KEY NOT NULL,
	`memoryId` text NOT NULL,
	`reason` text,
	`forgottenAt` text NOT NULL,
	FOREIGN KEY (`memoryId`) REFERENCES `memories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memory_forgets_memory_idx` ON `memory_forgets` (`memoryId`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversationId` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`model` text,
	`usage` text,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `nutrition_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`effectiveFrom` text NOT NULL,
	`kcal` real NOT NULL,
	`proteinG` real NOT NULL,
	`carbsG` real NOT NULL,
	`fatG` real NOT NULL,
	`fiberG` real NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nutrition_targets_effective_from_idx` ON `nutrition_targets` (`effectiveFrom`);--> statement-breakpoint
CREATE TABLE `personal_records` (
	`id` text PRIMARY KEY NOT NULL,
	`exerciseId` text NOT NULL,
	`kind` text NOT NULL,
	`value` real NOT NULL,
	`loadKg` real,
	`reps` integer,
	`setId` text,
	`date` text NOT NULL,
	FOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `personal_records_exercise_idx` ON `personal_records` (`exerciseId`,`kind`,`date`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` text PRIMARY KEY NOT NULL,
	`displayName` text NOT NULL,
	`birthDate` text,
	`sex` text,
	`heightCm` real,
	`weightKg` real,
	`fitnessLevel` text NOT NULL,
	`trainingExperienceMonths` integer NOT NULL,
	`preferredDurationMin` integer NOT NULL,
	`preferredStyles` text NOT NULL,
	`trainingLocation` text NOT NULL,
	`unitSystem` text NOT NULL,
	`foodRegion` text NOT NULL,
	`activityLevel` text NOT NULL,
	`notes` text,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `progress_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`view` text NOT NULL,
	`fileRef` text NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE INDEX `progress_photos_date_idx` ON `progress_photos` (`date`,`view`);--> statement-breakpoint
CREATE TABLE `readiness` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`sleepHours` real,
	`sleepQuality` integer,
	`energy` integer,
	`soreness` integer,
	`fatigue` integer,
	`stress` integer,
	`painReported` integer NOT NULL,
	`painNote` text,
	`score` real,
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `readiness_date_unique` ON `readiness` (`date`);--> statement-breakpoint
CREATE INDEX `readiness_date_idx` ON `readiness` (`date`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`ingredients` text NOT NULL,
	`steps` text NOT NULL,
	`timeMinutes` integer NOT NULL,
	`servings` integer NOT NULL,
	`perServing` text NOT NULL,
	`tags` text NOT NULL,
	`source` text NOT NULL,
	`timesMade` integer NOT NULL,
	`lastMadeAt` text,
	`saved` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recipes_saved_idx` ON `recipes` (`saved`);--> statement-breakpoint
CREATE TABLE `safety_events` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`resolvedAt` text,
	`note` text
);
--> statement-breakpoint
CREATE INDEX `safety_events_resolved_idx` ON `safety_events` (`resolvedAt`,`date`);--> statement-breakpoint
CREATE TABLE `saved_meals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`items` text NOT NULL,
	`kcal` real NOT NULL,
	`proteinG` real NOT NULL,
	`carbsG` real NOT NULL,
	`fatG` real NOT NULL,
	`fiberG` real NOT NULL,
	`timesLogged` integer NOT NULL,
	`lastLoggedAt` text
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workoutExerciseId` text NOT NULL,
	`setIndex` integer NOT NULL,
	`targetReps` integer NOT NULL,
	`actualReps` integer,
	`actualLoadKg` real,
	`rpe` real,
	`completed` integer NOT NULL,
	`isWarmup` integer NOT NULL,
	`notes` text,
	`completedAt` text,
	FOREIGN KEY (`workoutExerciseId`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sets_workout_exercise_idx` ON `sets` (`workoutExerciseId`,`setIndex`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`weekStart` text NOT NULL,
	`training` text NOT NULL,
	`nutrition` text NOT NULL,
	`summary` text,
	`recommendation` text,
	`generatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_reviews_weekStart_unique` ON `weekly_reviews` (`weekStart`);--> statement-breakpoint
CREATE INDEX `weekly_reviews_week_start_idx` ON `weekly_reviews` (`weekStart`);--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workoutId` text NOT NULL,
	`order` integer NOT NULL,
	`exerciseId` text NOT NULL,
	`targetSets` integer NOT NULL,
	`targetRepMin` integer NOT NULL,
	`targetRepMax` integer NOT NULL,
	`targetLoadKg` real,
	`restSec` integer NOT NULL,
	`tempo` text,
	`substitutedFromExerciseId` text,
	`progressionDecision` text,
	`notes` text,
	FOREIGN KEY (`workoutId`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`substitutedFromExerciseId`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workout_exercises_workout_idx` ON `workout_exercises` (`workoutId`,`order`);--> statement-breakpoint
CREATE INDEX `workout_exercises_exercise_idx` ON `workout_exercises` (`exerciseId`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`focus` text NOT NULL,
	`plannedDurationMin` integer NOT NULL,
	`startedAt` text,
	`finishedAt` text,
	`readinessId` text,
	`rationale` text,
	`coachMessageId` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `workouts_date_idx` ON `workouts` (`date`);--> statement-breakpoint
CREATE INDEX `workouts_status_date_idx` ON `workouts` (`status`,`date`);