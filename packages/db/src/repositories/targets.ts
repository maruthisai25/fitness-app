import type { Id, LocalDate, NutritionTargets } from '@vigor/core';
import { desc, eq, lte } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { nutritionTargets as targetsTable } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type NutritionTargetsFields = Omit<NutritionTargets, 'id'>;

export type NutritionTargetsDraft = Omit<NutritionTargetsFields, 'source'> &
  Partial<Pick<NutritionTargetsFields, 'source'>>;

export interface TargetsRepository {
  /** Newest effective date first. */
  list(): Promise<NutritionTargets[]>;
  get(id: Id): Promise<NutritionTargets | null>;
  /**
   * The targets in force on `date`: the newest row whose `effectiveFrom` is on
   * or before it. `null` while the user has none — `packages/core` §5.6 then
   * computes a starting set from the profile.
   */
  getActive(date: LocalDate): Promise<NutritionTargets | null>;
  /** Adds a new effective-dated row; history is never overwritten. */
  create(draft: NutritionTargetsDraft): Promise<NutritionTargets>;
  update(id: Id, patch: Partial<NutritionTargetsFields>): Promise<NutritionTargets>;
  remove(id: Id): Promise<void>;
}

export function createTargetsRepository(db: VigorDb): TargetsRepository {
  async function get(id: Id): Promise<NutritionTargets | null> {
    const rows = await db.orm.select().from(targetsTable).where(eq(targetsTable.id, id)).limit(1);
    return firstOrNull(rows);
  }

  return {
    async list(): Promise<NutritionTargets[]> {
      return db.orm.select().from(targetsTable).orderBy(desc(targetsTable.effectiveFrom));
    },
    get,
    async getActive(date: LocalDate): Promise<NutritionTargets | null> {
      const rows = await db.orm
        .select()
        .from(targetsTable)
        .where(lte(targetsTable.effectiveFrom, date))
        .orderBy(desc(targetsTable.effectiveFrom))
        .limit(1);
      return firstOrNull(rows);
    },
    async create(draft: NutritionTargetsDraft): Promise<NutritionTargets> {
      const row: NutritionTargets = {
        id: db.newId(),
        effectiveFrom: draft.effectiveFrom,
        kcal: draft.kcal,
        proteinG: draft.proteinG,
        carbsG: draft.carbsG,
        fatG: draft.fatG,
        fiberG: draft.fiberG,
        source: draft.source ?? 'user',
      };
      const [inserted] = await db.orm.insert(targetsTable).values(row).returning();
      return inserted as NutritionTargets;
    },
    async update(id: Id, patch: Partial<NutritionTargetsFields>): Promise<NutritionTargets> {
      const fields = definedOnly(patch);
      if (isEmptyPatch(fields)) {
        const current = await get(id);
        return requireRow(current ?? undefined, 'nutrition_targets', id);
      }
      const [row] = await db.orm
        .update(targetsTable)
        .set(fields)
        .where(eq(targetsTable.id, id))
        .returning();
      return requireRow(row as NutritionTargets | undefined, 'nutrition_targets', id);
    },
    async remove(id: Id): Promise<void> {
      await db.orm.delete(targetsTable).where(eq(targetsTable.id, id));
    },
  };
}
