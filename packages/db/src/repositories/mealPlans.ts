import type { DayPlan, Id, LocalDate, MealPlan, MealPlanConstraints } from '@vigor/core';
import { desc, eq, lte } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { shiftLocalDate } from '../dates';
import { mealPlans as mealPlansTable } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type MealPlanFields = Omit<MealPlan, 'id'>;

export type MealPlanDraft = {
  startDate: LocalDate;
  plan: readonly DayPlan[];
  /** Defaults to the number of days in `plan`. */
  days?: number;
  constraints?: MealPlanConstraints;
};

const NO_CONSTRAINTS: MealPlanConstraints = {
  kcalPerDay: null,
  proteinGPerDay: null,
  dietary: [],
  excludeIngredients: [],
  maxCookMinutes: null,
  useInventoryFirst: false,
};

export interface MealPlanRepository {
  /** Newest plan first. */
  list(options?: { limit?: number }): Promise<MealPlan[]>;
  get(id: Id): Promise<MealPlan | null>;
  /** The plan whose window covers `date`, or `null`. */
  getForDate(date: LocalDate): Promise<MealPlan | null>;
  /** The single day of a plan that covers `date`. */
  getDayFor(date: LocalDate): Promise<DayPlan | null>;
  create(draft: MealPlanDraft): Promise<MealPlan>;
  update(id: Id, patch: Partial<MealPlanFields>): Promise<MealPlan>;
  remove(id: Id): Promise<void>;
}

export function createMealPlanRepository(db: VigorDb): MealPlanRepository {
  async function get(id: Id): Promise<MealPlan | null> {
    const rows = await db.orm
      .select()
      .from(mealPlansTable)
      .where(eq(mealPlansTable.id, id))
      .limit(1);
    return firstOrNull(rows);
  }

  async function getForDate(date: LocalDate): Promise<MealPlan | null> {
    // Candidates start on or before `date`; the newest one whose window still
    // covers it wins. Plans are short, so a bounded scan is cheaper than a
    // computed end-date column that would have to be kept in sync.
    const candidates = await db.orm
      .select()
      .from(mealPlansTable)
      .where(lte(mealPlansTable.startDate, date))
      .orderBy(desc(mealPlansTable.startDate), desc(mealPlansTable.createdAt))
      .limit(20);
    for (const plan of candidates) {
      if (shiftLocalDate(plan.startDate, plan.days - 1) >= date) return plan;
    }
    return null;
  }

  return {
    async list(options: { limit?: number } = {}): Promise<MealPlan[]> {
      const query = db.orm
        .select()
        .from(mealPlansTable)
        .orderBy(desc(mealPlansTable.startDate), desc(mealPlansTable.createdAt));
      return options.limit !== undefined ? query.limit(options.limit) : query;
    },
    get,
    getForDate,
    async getDayFor(date: LocalDate): Promise<DayPlan | null> {
      const plan = await getForDate(date);
      return plan?.plan.find((day) => day.date === date) ?? null;
    },
    async create(draft: MealPlanDraft): Promise<MealPlan> {
      const plan = [...draft.plan];
      const row: MealPlan = {
        id: db.newId(),
        startDate: draft.startDate,
        days: draft.days ?? plan.length,
        plan,
        constraints: draft.constraints ?? NO_CONSTRAINTS,
        createdAt: db.now(),
      };
      const [inserted] = await db.orm.insert(mealPlansTable).values(row).returning();
      return inserted as MealPlan;
    },
    async update(id: Id, patch: Partial<MealPlanFields>): Promise<MealPlan> {
      const fields = definedOnly(patch);
      if (isEmptyPatch(fields)) {
        const current = await get(id);
        return requireRow(current ?? undefined, 'meal_plans', id);
      }
      const [row] = await db.orm
        .update(mealPlansTable)
        .set(fields)
        .where(eq(mealPlansTable.id, id))
        .returning();
      return requireRow(row as MealPlan | undefined, 'meal_plans', id);
    },
    async remove(id: Id): Promise<void> {
      await db.orm.delete(mealPlansTable).where(eq(mealPlansTable.id, id));
    },
  };
}
