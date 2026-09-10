import { settingsSchema, type SettingsEntry, type Settings } from '@vigor/core';
import { eq, inArray } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { settings as settingsTable } from '../schema';
import { chunk, MAX_BOUND_PARAMS } from './support';

/**
 * DESIGN.md §6.1 defaults. `apiKeyRef` is a handle into the platform
 * SecureStore, never the key itself — the key never reaches SQLite (§8).
 */
export const DEFAULT_SETTINGS: Settings = {
  apiKeyRef: null,
  coachModel: 'claude-opus-5',
  fastModel: 'claude-haiku-4-5',
  notificationsEnabled: false,
  reminderTimes: {
    workout: null,
    missedWorkout: null,
    mealLog: null,
    protein: null,
    weeklyReview: null,
    measurement: null,
  },
  weekStartsOn: 1,
  onboardingComplete: false,
  disclaimerAcceptedAt: null,
  insightsLastRunOn: null,
  // null = follow `weekStartsOn` (DESIGN.md §7.3).
  weeklyReviewDay: null,
  lastReviewViewedWeek: null,
  // DESIGN.md §6.1: the `fallbacks: "default"` beta is on unless the user
  // turns it off, and the settings screen says so.
  serverSideFallback: true,
};

/** The keys the `settings` table is allowed to hold (DESIGN.md §4.1). */
export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

const SETTINGS_KEY_SET = new Set<string>(SETTINGS_KEYS);

/**
 * Decodes one stored entry, falling back to the default when the value is
 * unreadable. A single corrupt row must not stop the app from opening — the
 * user would have no way back in to fix it.
 */
function decodeEntry<K extends keyof Settings>(key: K, encoded: string): Settings[K] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    return DEFAULT_SETTINGS[key];
  }
  const result = settingsSchema.shape[key].safeParse(parsed);
  return result.success ? (result.data as Settings[K]) : DEFAULT_SETTINGS[key];
}

export interface SettingsRepository {
  /** The whole decoded settings object, with defaults filled in. */
  getAll(): Promise<Settings>;
  get<K extends keyof Settings>(key: K): Promise<Settings[K]>;
  set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<Settings[K]>;
  /** Writes several keys in one transaction and returns the new full object. */
  setMany(patch: Partial<Settings>): Promise<Settings>;
  /** Resets a key to its DESIGN.md §6.1 default. */
  reset(key: keyof Settings): Promise<void>;
  /** Raw key/value rows, as the export bundle carries them. */
  listEntries(): Promise<SettingsEntry[]>;
  /** Raw write, used by import-restore. Unknown keys are rejected. */
  putEntries(entries: readonly SettingsEntry[]): Promise<void>;
  clear(): Promise<void>;
}

export function createSettingsRepository(db: VigorDb): SettingsRepository {
  async function getAll(): Promise<Settings> {
    const rows = await db.orm.select().from(settingsTable);
    const decoded: Settings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      if (!SETTINGS_KEY_SET.has(row.key)) continue;
      const key = row.key as keyof Settings;
      // The generic write is safe: `decodeEntry` returns exactly `Settings[key]`,
      // but TypeScript cannot follow that through a runtime-chosen key.
      (decoded as unknown as Record<string, unknown>)[key] = decodeEntry(key, row.value);
    }
    return decoded;
  }

  async function writeEntries(entries: readonly SettingsEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await db.transaction(async (tx) => {
      for (const entry of entries) {
        await tx.orm
          .insert(settingsTable)
          .values(entry)
          .onConflictDoUpdate({ target: settingsTable.key, set: { value: entry.value } });
      }
    });
  }

  async function setMany(patch: Partial<Settings>): Promise<Settings> {
    const entries: SettingsEntry[] = [];
    for (const key of SETTINGS_KEYS) {
      const value = patch[key];
      if (value === undefined) continue;
      const parsed = settingsSchema.shape[key].parse(value);
      entries.push({ key, value: JSON.stringify(parsed) });
    }
    await writeEntries(entries);
    return getAll();
  }

  return {
    getAll,
    async get<K extends keyof Settings>(key: K): Promise<Settings[K]> {
      const rows = await db.orm
        .select()
        .from(settingsTable)
        .where(eq(settingsTable.key, key))
        .limit(1);
      const row = rows[0];
      return row ? decodeEntry(key, row.value) : DEFAULT_SETTINGS[key];
    },
    async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<Settings[K]> {
      const parsed = settingsSchema.shape[key].parse(value) as Settings[K];
      await writeEntries([{ key, value: JSON.stringify(parsed) }]);
      return parsed;
    },
    setMany,
    async reset(key: keyof Settings): Promise<void> {
      await db.orm.delete(settingsTable).where(eq(settingsTable.key, key));
    },
    async listEntries(): Promise<SettingsEntry[]> {
      return db.orm.select().from(settingsTable);
    },
    async putEntries(entries: readonly SettingsEntry[]): Promise<void> {
      const unknown = entries.filter((entry) => !SETTINGS_KEY_SET.has(entry.key));
      if (unknown.length > 0) {
        throw new Error(
          `settings: unknown key(s) ${unknown.map((entry) => entry.key).join(', ')}. ` +
            `Allowed keys: ${SETTINGS_KEYS.join(', ')}.`,
        );
      }
      await writeEntries(entries);
    },
    async clear(): Promise<void> {
      for (const keys of chunk(SETTINGS_KEYS, MAX_BOUND_PARAMS)) {
        await db.orm.delete(settingsTable).where(inArray(settingsTable.key, keys));
      }
    },
  };
}
