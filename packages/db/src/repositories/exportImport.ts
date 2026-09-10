import {
  exportBundleSchema,
  type ExportBundle,
  type ExportBundlePhoto,
  type ExportTables,
  type IsoTimestamp,
  type UnitSystem,
} from '@vigor/core';
import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { VigorDb } from '../client';
import * as schema from '../schema';
import { chunk } from './support';

/**
 * Bumped whenever the shape of `ExportTables` changes. `restore` refuses a
 * bundle it does not recognise rather than half-importing it (DESIGN.md §8).
 *
 * Version 2 is version 1 plus `insights.dismissedAt` (migration 0001). Older
 * bundles are upgraded on the way in, not rejected — a backup taken before the
 * column existed is still the user's only copy of that data.
 */
export const EXPORT_SCHEMA_VERSION = 2;

/** Stamped into the bundle so a support question can name the build. */
export const EXPORT_APP_VERSION = '0.1.0';

/**
 * The settings key that points at the Anthropic key in the platform
 * SecureStore. DESIGN.md §8: the API key "is never logged, never included in
 * exports". The handle is stripped with it — it means nothing on another
 * device, and carrying it would silently point the import at a missing key.
 */
const EXPORT_EXCLUDED_SETTINGS_KEYS = new Set(['apiKeyRef']);

/**
 * Parent-before-child, so a restore never inserts a row whose foreign key is
 * not there yet. Deletes walk the same list backwards.
 */
const RESTORE_ORDER: readonly (keyof ExportTables)[] = [
  'profile',
  'settings',
  'goals',
  'equipment',
  'nutritionTargets',
  'exercises',
  'exerciseRelations',
  'conversations',
  'messages',
  'readiness',
  'workouts',
  'workoutExercises',
  'sets',
  'personalRecords',
  'bodyMetrics',
  'progressPhotos',
  'foodLogs',
  'foodItems',
  'savedMeals',
  'inventoryItems',
  'recipes',
  'mealPlans',
  'memories',
  'insights',
  'weeklyReviews',
  'aiJobs',
  'safetyEvents',
];

/** Which Drizzle table backs each `ExportTables` key. */
const TABLE_BY_KEY: Record<keyof ExportTables, SQLiteTable> = {
  profile: schema.profile,
  goals: schema.goals,
  equipment: schema.equipment,
  nutritionTargets: schema.nutritionTargets,
  settings: schema.settings,
  exercises: schema.exercises,
  exerciseRelations: schema.exerciseRelations,
  workouts: schema.workouts,
  workoutExercises: schema.workoutExercises,
  sets: schema.sets,
  personalRecords: schema.personalRecords,
  readiness: schema.readiness,
  bodyMetrics: schema.bodyMetrics,
  progressPhotos: schema.progressPhotos,
  foodLogs: schema.foodLogs,
  foodItems: schema.foodItems,
  savedMeals: schema.savedMeals,
  inventoryItems: schema.inventoryItems,
  recipes: schema.recipes,
  mealPlans: schema.mealPlans,
  memories: schema.memories,
  insights: schema.insights,
  weeklyReviews: schema.weeklyReviews,
  conversations: schema.conversations,
  messages: schema.messages,
  aiJobs: schema.aiJobs,
  safetyEvents: schema.safetyEvents,
};

/** SQLite's bound-parameter ceiling, with room to spare for the statement itself. */
const MAX_PARAMS_PER_INSERT = 900;

export interface BundleOptions {
  /**
   * Progress photo bytes. `packages/db` stores only `fileRef` paths, so the
   * caller reads the files through the platform FileStore and passes them here
   * (DESIGN.md §8: "all tables + photos as base64").
   */
  photos?: readonly ExportBundlePhoto[];
  appVersion?: string;
  exportedAt?: IsoTimestamp;
}

export interface RestoreOptions {
  /**
   * `replace` wipes every table first. `merge` keeps existing rows and adds
   * only ids the database does not already have, so a re-import is safe.
   */
  mode?: 'replace' | 'merge';
}

export interface RestoreResult {
  mode: 'replace' | 'merge';
  /** Rows written per table. */
  inserted: Record<keyof ExportTables, number>;
}

/**
 * A bundle arrives as decrypted JSON, so nothing about its shape is known
 * until `exportBundleSchema` has seen it — including its version number.
 */
function readSchemaVersion(bundle: unknown): number | null {
  if (typeof bundle !== 'object' || bundle === null) return null;
  const version = (bundle as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'number' ? version : null;
}

/**
 * Version 1 predates `insights.dismissedAt`. The column is nullable and a
 * `null` means "never dismissed", which is exactly what every row in a v1
 * bundle was, so the upgrade is a fill-in rather than a guess.
 */
function upgradeFromV1(bundle: unknown): unknown {
  const source = bundle as Record<string, unknown>;
  const tables = (source.tables ?? {}) as Record<string, unknown>;
  const insights = Array.isArray(tables.insights) ? tables.insights : [];
  return {
    ...source,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    tables: {
      ...tables,
      // The spread order lets a row that already carries the field keep it.
      insights: insights.map((row) => ({
        dismissedAt: null,
        ...(row as Record<string, unknown>),
      })),
    },
  };
}

export class UnsupportedBundleError extends Error {
  readonly schemaVersion: number;

  constructor(schemaVersion: number) {
    super(
      `export bundle schemaVersion ${schemaVersion} is not supported by this build ` +
        `(expected ${EXPORT_SCHEMA_VERSION}).`,
    );
    this.name = 'UnsupportedBundleError';
    this.schemaVersion = schemaVersion;
  }
}

export interface ExportRepository {
  /** DESIGN.md §4.2 — every table, ready to be encrypted and written to disk. */
  bundle(options?: BundleOptions): Promise<ExportBundle>;
  /** DESIGN.md §4.2 — validates, then writes the whole bundle in one transaction. */
  restore(bundle: ExportBundle, options?: RestoreOptions): Promise<RestoreResult>;
}

export function createExportRepository(db: VigorDb): ExportRepository {
  async function readTables(): Promise<ExportTables> {
    const orm = db.orm;
    const settingsRows = await orm.select().from(schema.settings);
    return {
      profile: await orm.select().from(schema.profile),
      goals: await orm.select().from(schema.goals),
      equipment: await orm.select().from(schema.equipment),
      nutritionTargets: await orm.select().from(schema.nutritionTargets),
      settings: settingsRows.filter((row) => !EXPORT_EXCLUDED_SETTINGS_KEYS.has(row.key)),
      exercises: await orm.select().from(schema.exercises),
      exerciseRelations: await orm.select().from(schema.exerciseRelations),
      workouts: await orm.select().from(schema.workouts),
      workoutExercises: await orm.select().from(schema.workoutExercises),
      sets: await orm.select().from(schema.sets),
      personalRecords: await orm.select().from(schema.personalRecords),
      readiness: await orm.select().from(schema.readiness),
      bodyMetrics: await orm.select().from(schema.bodyMetrics),
      progressPhotos: await orm.select().from(schema.progressPhotos),
      foodLogs: await orm.select().from(schema.foodLogs),
      foodItems: await orm.select().from(schema.foodItems),
      savedMeals: await orm.select().from(schema.savedMeals),
      inventoryItems: await orm.select().from(schema.inventoryItems),
      recipes: await orm.select().from(schema.recipes),
      mealPlans: await orm.select().from(schema.mealPlans),
      memories: await orm.select().from(schema.memories),
      insights: await orm.select().from(schema.insights),
      weeklyReviews: await orm.select().from(schema.weeklyReviews),
      conversations: await orm.select().from(schema.conversations),
      messages: await orm.select().from(schema.messages),
      aiJobs: await orm.select().from(schema.aiJobs),
      safetyEvents: await orm.select().from(schema.safetyEvents),
    };
  }

  return {
    async bundle(options: BundleOptions = {}): Promise<ExportBundle> {
      const tables = await readTables();
      const unitSystem: UnitSystem = tables.profile[0]?.unitSystem ?? 'metric';
      const draft: ExportBundle = {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        appVersion: options.appVersion ?? EXPORT_APP_VERSION,
        exportedAt: options.exportedAt ?? db.now(),
        unitSystem,
        tables,
        photos: options.photos ? [...options.photos] : [],
      };
      // Validating on the way out means a malformed bundle is caught here,
      // before it is encrypted and handed to the user as their only backup.
      return exportBundleSchema.parse(draft);
    },

    async restore(bundle: ExportBundle, options: RestoreOptions = {}): Promise<RestoreResult> {
      const version = readSchemaVersion(bundle);
      const upgraded = version === 1 ? upgradeFromV1(bundle) : bundle;
      if (readSchemaVersion(upgraded) !== EXPORT_SCHEMA_VERSION) {
        throw new UnsupportedBundleError(version ?? Number.NaN);
      }
      const parsed = exportBundleSchema.parse(upgraded);
      const mode = options.mode ?? 'replace';

      const inserted = {} as Record<keyof ExportTables, number>;
      for (const key of RESTORE_ORDER) inserted[key] = 0;

      await db.transaction(async (tx) => {
        if (mode === 'replace') {
          for (const key of [...RESTORE_ORDER].reverse()) {
            await tx.orm.delete(TABLE_BY_KEY[key]);
          }
          // `memory_forgets` is an audit table local to this device and is not
          // carried by `ExportTables`, so a replace clears it with the rest.
          await tx.orm.delete(schema.memoryForgets);
        }

        for (const key of RESTORE_ORDER) {
          const table = TABLE_BY_KEY[key];
          const rows = parsed.tables[key] as unknown as readonly Record<string, unknown>[];
          if (rows.length === 0) continue;
          const columnCount = Object.keys(getTableColumns(table)).length;
          const perStatement = Math.max(1, Math.floor(MAX_PARAMS_PER_INSERT / columnCount));
          let written = 0;
          for (const batch of chunk(rows, perStatement)) {
            // The rows came out of `exportBundleSchema`, which mirrors the very
            // types these tables are declared with; Drizzle cannot see that
            // through the `keyof ExportTables` indirection.
            const result = await tx.orm
              .insert(table)
              .values(batch as never)
              .onConflictDoNothing()
              .returning();
            written += result.length;
          }
          inserted[key] = written;
        }
      });

      return { mode, inserted };
    },
  };
}
