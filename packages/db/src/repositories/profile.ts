import type { Profile } from '@vigor/core';
import { eq } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { profile as profileTable } from '../schema';
import { firstOrNull, definedOnly, isEmptyPatch } from './support';

/** Everything the caller may set. `id` and `updatedAt` are owned by the repository. */
export type ProfileFields = Omit<Profile, 'id' | 'updatedAt'>;

/**
 * Onboarding only knows the user's name, so everything else falls back to the
 * defaults below and the You tab fills the rest in later.
 */
export type ProfileDraft = Partial<ProfileFields> & Pick<ProfileFields, 'displayName'>;

/** Applied to any field onboarding has not asked about yet. */
export const PROFILE_DEFAULTS: Omit<ProfileFields, 'displayName'> = {
  birthDate: null,
  sex: null,
  heightCm: null,
  weightKg: null,
  fitnessLevel: 'beginner',
  trainingExperienceMonths: 0,
  preferredDurationMin: 45,
  preferredStyles: [],
  trainingLocation: 'gym',
  unitSystem: 'metric',
  foodRegion: 'generic',
  activityLevel: 'moderate',
  notes: null,
};

export interface ProfileRepository {
  /** The single profile row, or `null` before onboarding. */
  get(): Promise<Profile | null>;
  /** Creates the profile, or replaces it wholesale if one already exists. */
  save(draft: ProfileDraft): Promise<Profile>;
  /** Patches the existing row. Creates it from `PROFILE_DEFAULTS` if there is none. */
  update(patch: Partial<ProfileFields>): Promise<Profile>;
  /** Removes the profile. Used by import-replace and by "delete my data". */
  clear(): Promise<void>;
}

export function createProfileRepository(db: VigorDb): ProfileRepository {
  async function get(): Promise<Profile | null> {
    const rows = await db.orm.select().from(profileTable).limit(1);
    return firstOrNull(rows);
  }

  async function save(draft: ProfileDraft): Promise<Profile> {
    const existing = await get();
    const row: Profile = {
      id: existing?.id ?? db.newId(),
      ...PROFILE_DEFAULTS,
      ...definedOnly(draft),
      displayName: draft.displayName,
      updatedAt: db.now(),
    };
    return db.transaction(async (tx) => {
      await tx.orm.delete(profileTable);
      const [inserted] = await tx.orm.insert(profileTable).values(row).returning();
      return inserted as Profile;
    });
  }

  async function update(patch: Partial<ProfileFields>): Promise<Profile> {
    const existing = await get();
    if (!existing) {
      const { displayName, ...rest } = { displayName: '', ...definedOnly(patch) };
      return save({ displayName, ...rest });
    }
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) return existing;
    const [row] = await db.orm
      .update(profileTable)
      .set({ ...fields, updatedAt: db.now() })
      .where(eq(profileTable.id, existing.id))
      .returning();
    return row as Profile;
  }

  async function clear(): Promise<void> {
    await db.orm.delete(profileTable);
  }

  return { get, save, update, clear };
}
