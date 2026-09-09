import type { FoodItemDraft, Id, IsoTimestamp, SavedMeal } from '@vigor/core';
import { asc, desc, eq } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { savedMeals as savedMealsTable } from '../schema';
import { sumMacros } from './nutrition';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type SavedMealFields = Omit<SavedMeal, 'id'>;

/**
 * Macros are derived from `items`, so a caller only supplies the name and the
 * items — idea.md §18: saving a meal is one action, logging it is one more.
 */
export type SavedMealDraft = {
  name: string;
  items: readonly FoodItemDraft[];
  timesLogged?: number;
  lastLoggedAt?: IsoTimestamp | null;
};

export interface SavedMealRepository {
  /** Most-used first — that is the order the quick-log sheet wants. */
  list(options?: { limit?: number }): Promise<SavedMeal[]>;
  get(id: Id): Promise<SavedMeal | null>;
  getByName(name: string): Promise<SavedMeal | null>;
  create(draft: SavedMealDraft): Promise<SavedMeal>;
  /** Recomputes the macro columns whenever `items` changes. */
  update(id: Id, patch: Partial<SavedMealDraft>): Promise<SavedMeal>;
  /** Bumps `timesLogged` and `lastLoggedAt` after the meal is logged. */
  markLogged(id: Id, at?: IsoTimestamp): Promise<SavedMeal>;
  remove(id: Id): Promise<void>;
}

export function createSavedMealRepository(db: VigorDb): SavedMealRepository {
  async function get(id: Id): Promise<SavedMeal | null> {
    const rows = await db.orm
      .select()
      .from(savedMealsTable)
      .where(eq(savedMealsTable.id, id))
      .limit(1);
    return firstOrNull(rows);
  }

  return {
    async list(options: { limit?: number } = {}): Promise<SavedMeal[]> {
      const query = db.orm
        .select()
        .from(savedMealsTable)
        .orderBy(desc(savedMealsTable.timesLogged), asc(savedMealsTable.name));
      return options.limit !== undefined ? query.limit(options.limit) : query;
    },
    get,
    async getByName(name: string): Promise<SavedMeal | null> {
      const rows = await db.orm
        .select()
        .from(savedMealsTable)
        .where(eq(savedMealsTable.name, name))
        .limit(1);
      return firstOrNull(rows);
    },
    async create(draft: SavedMealDraft): Promise<SavedMeal> {
      const items = [...draft.items];
      const row: SavedMeal = {
        id: db.newId(),
        name: draft.name,
        items,
        ...sumMacros(items),
        timesLogged: draft.timesLogged ?? 0,
        lastLoggedAt: draft.lastLoggedAt ?? null,
      };
      const [inserted] = await db.orm.insert(savedMealsTable).values(row).returning();
      return inserted as SavedMeal;
    },
    async update(id: Id, patch: Partial<SavedMealDraft>): Promise<SavedMeal> {
      const fields = definedOnly(patch);
      if (isEmptyPatch(fields)) {
        const current = await get(id);
        return requireRow(current ?? undefined, 'saved_meals', id);
      }
      const next: Partial<SavedMealFields> = { ...fields } as Partial<SavedMealFields>;
      if (patch.items !== undefined) {
        const items = [...patch.items];
        next.items = items;
        Object.assign(next, sumMacros(items));
      }
      const [row] = await db.orm
        .update(savedMealsTable)
        .set(next)
        .where(eq(savedMealsTable.id, id))
        .returning();
      return requireRow(row as SavedMeal | undefined, 'saved_meals', id);
    },
    async markLogged(id: Id, at?: IsoTimestamp): Promise<SavedMeal> {
      return db.transaction(async (tx) => {
        const rows = await tx.orm
          .select()
          .from(savedMealsTable)
          .where(eq(savedMealsTable.id, id))
          .limit(1);
        const current = requireRow(rows[0], 'saved_meals', id);
        const [row] = await tx.orm
          .update(savedMealsTable)
          .set({ timesLogged: current.timesLogged + 1, lastLoggedAt: at ?? db.now() })
          .where(eq(savedMealsTable.id, id))
          .returning();
        return row as SavedMeal;
      });
    },
    async remove(id: Id): Promise<void> {
      await db.orm.delete(savedMealsTable).where(eq(savedMealsTable.id, id));
    },
  };
}
