import type { Id, IsoTimestamp, Recipe } from '@vigor/core';
import { and, asc, desc, eq, like, type SQL } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { recipes as recipesTable } from '../schema';
import {
  definedOnly,
  firstOrNull,
  isEmptyPatch,
  jsonArrayContainsPattern,
  requireRow,
} from './support';

export type RecipeFields = Omit<Recipe, 'id'>;

export type RecipeDraft = Partial<RecipeFields> &
  Pick<RecipeFields, 'title' | 'ingredients' | 'steps' | 'perServing'>;

const RECIPE_DEFAULTS: Omit<RecipeFields, 'title' | 'ingredients' | 'steps' | 'perServing'> = {
  timeMinutes: 20,
  servings: 1,
  tags: [],
  source: 'ai',
  timesMade: 0,
  lastMadeAt: null,
  saved: false,
};

export interface RecipeRepository {
  list(filter?: { savedOnly?: boolean; tag?: string; limit?: number }): Promise<Recipe[]>;
  get(id: Id): Promise<Recipe | null>;
  create(draft: RecipeDraft): Promise<Recipe>;
  update(id: Id, patch: Partial<RecipeFields>): Promise<Recipe>;
  /** Keeps the recipe out of the auto-clean of one-off generations. */
  setSaved(id: Id, saved: boolean): Promise<Recipe>;
  /** "VigorEngine also learns which recipes the user actually makes" (idea.md §18). */
  markMade(id: Id, at?: IsoTimestamp): Promise<Recipe>;
  remove(id: Id): Promise<void>;
}

export function createRecipeRepository(db: VigorDb): RecipeRepository {
  async function get(id: Id): Promise<Recipe | null> {
    const rows = await db.orm.select().from(recipesTable).where(eq(recipesTable.id, id)).limit(1);
    return firstOrNull(rows);
  }

  async function update(id: Id, patch: Partial<RecipeFields>): Promise<Recipe> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'recipes', id);
    }
    const [row] = await db.orm
      .update(recipesTable)
      .set(fields)
      .where(eq(recipesTable.id, id))
      .returning();
    return requireRow(row as Recipe | undefined, 'recipes', id);
  }

  return {
    async list(
      filter: { savedOnly?: boolean; tag?: string; limit?: number } = {},
    ): Promise<Recipe[]> {
      const conditions: SQL[] = [];
      if (filter.savedOnly) conditions.push(eq(recipesTable.saved, true));
      if (filter.tag) {
        conditions.push(like(recipesTable.tags, jsonArrayContainsPattern(filter.tag)));
      }
      const query = db.orm
        .select()
        .from(recipesTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(recipesTable.timesMade), asc(recipesTable.title));
      return filter.limit !== undefined ? query.limit(filter.limit) : query;
    },
    get,
    async create(draft: RecipeDraft): Promise<Recipe> {
      const row: Recipe = {
        id: db.newId(),
        ...RECIPE_DEFAULTS,
        ...definedOnly(draft),
        title: draft.title,
        ingredients: draft.ingredients,
        steps: draft.steps,
        perServing: draft.perServing,
      };
      const [inserted] = await db.orm.insert(recipesTable).values(row).returning();
      return inserted as Recipe;
    },
    update,
    setSaved: (id, saved) => update(id, { saved }),
    async markMade(id: Id, at?: IsoTimestamp): Promise<Recipe> {
      return db.transaction(async (tx) => {
        const rows = await tx.orm
          .select()
          .from(recipesTable)
          .where(eq(recipesTable.id, id))
          .limit(1);
        const current = requireRow(rows[0], 'recipes', id);
        const [row] = await tx.orm
          .update(recipesTable)
          .set({ timesMade: current.timesMade + 1, lastMadeAt: at ?? db.now() })
          .where(eq(recipesTable.id, id))
          .returning();
        return row as Recipe;
      });
    },
    async remove(id: Id): Promise<void> {
      await db.orm.delete(recipesTable).where(eq(recipesTable.id, id));
    },
  };
}
