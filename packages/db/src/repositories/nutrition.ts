import type {
  DayNutrition,
  FoodItem,
  FoodItemDraft,
  FoodLog,
  FoodLogSource,
  FoodLogWithItems,
  Id,
  LocalDate,
  MacroTotals,
} from '@vigor/core';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { foodItems, foodLogs } from '../schema';
import type { TargetsRepository } from './targets';
import {
  chunk,
  definedOnly,
  firstOrNull,
  groupBy,
  isEmptyPatch,
  MAX_BOUND_PARAMS,
  requireRow,
} from './support';

export type FoodLogFields = Omit<FoodLog, 'id'>;

export type FoodLogDraft = Partial<FoodLogFields> & Pick<FoodLogFields, 'date' | 'mealSlot'>;

export type FoodItemFields = Omit<FoodItem, 'id' | 'foodLogId'>;

const ZERO_MACROS: MacroTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

/** Adds one item's macros into a running total. */
function addMacros(total: MacroTotals, item: FoodItemDraft): MacroTotals {
  return {
    kcal: total.kcal + item.kcal,
    proteinG: total.proteinG + item.proteinG,
    carbsG: total.carbsG + item.carbsG,
    fatG: total.fatG + item.fatG,
    fiberG: total.fiberG + item.fiberG,
  };
}

/** Sums a list of items. Exported because saved meals and recipes need it too. */
export function sumMacros(items: readonly FoodItemDraft[]): MacroTotals {
  return items.reduce(addMacros, ZERO_MACROS);
}

export interface NutritionRepository {
  /**
   * DESIGN.md §4.2, §5.6, idea.md §19 — everything the Today ring and the coach
   * context need for one day. `remaining` is signed: negative means over
   * target, and the UI clamps at 0. With no targets yet it is all zeroes.
   */
  getDay(date: LocalDate): Promise<DayNutrition>;
  /** `getDay` for a range, oldest first. Feeds the weekly review (§5.9). */
  getDays(range: { from: LocalDate; to: LocalDate }): Promise<DayNutrition[]>;

  getLog(id: Id): Promise<FoodLogWithItems | null>;
  listLogs(range: { from: LocalDate; to: LocalDate }): Promise<FoodLogWithItems[]>;
  /** Writes the log and its items in one transaction. */
  createLog(draft: FoodLogDraft & { items?: readonly FoodItemDraft[] }): Promise<FoodLogWithItems>;
  updateLog(id: Id, patch: Partial<FoodLogFields>): Promise<FoodLog>;
  removeLog(id: Id): Promise<void>;

  addItems(logId: Id, items: readonly FoodItemDraft[]): Promise<FoodItem[]>;
  /**
   * Swaps in a fresh item list — how a queued `estimate_food` job lands its
   * result on a log that was showing "estimating…" (DESIGN.md §6.4).
   */
  replaceItems(logId: Id, items: readonly FoodItemDraft[]): Promise<FoodLogWithItems>;
  updateItem(id: Id, patch: Partial<FoodItemFields>): Promise<FoodItem>;
  removeItem(id: Id): Promise<void>;
}

export function createNutritionRepository(
  db: VigorDb,
  targets: TargetsRepository,
): NutritionRepository {
  async function loadItems(logIds: readonly Id[]): Promise<FoodItem[]> {
    const rows: FoodItem[] = [];
    for (const batch of chunk(logIds, MAX_BOUND_PARAMS)) {
      const found = await db.orm
        .select()
        .from(foodItems)
        .where(inArray(foodItems.foodLogId, batch))
        .orderBy(asc(foodItems.foodLogId), asc(foodItems.id));
      rows.push(...found);
    }
    return rows;
  }

  async function attachItems(logs: FoodLog[]): Promise<FoodLogWithItems[]> {
    if (logs.length === 0) return [];
    const items = await loadItems(logs.map((log) => log.id));
    const byLog = groupBy(items, (item) => item.foodLogId);
    return logs.map((log) => ({ ...log, items: byLog.get(log.id) ?? [] }));
  }

  async function listLogRows(range: { from: LocalDate; to: LocalDate }): Promise<FoodLog[]> {
    return db.orm
      .select()
      .from(foodLogs)
      .where(and(gte(foodLogs.date, range.from), lte(foodLogs.date, range.to)))
      .orderBy(asc(foodLogs.date), asc(foodLogs.loggedAt), asc(foodLogs.id));
  }

  function buildDay(
    date: LocalDate,
    logs: FoodLogWithItems[],
    dayTargets: DayNutrition['targets'],
  ): DayNutrition {
    const consumed = sumMacros(logs.flatMap((log) => log.items));
    const remaining: MacroTotals = dayTargets
      ? {
          kcal: dayTargets.kcal - consumed.kcal,
          proteinG: dayTargets.proteinG - consumed.proteinG,
          carbsG: dayTargets.carbsG - consumed.carbsG,
          fatG: dayTargets.fatG - consumed.fatG,
          fiberG: dayTargets.fiberG - consumed.fiberG,
        }
      : { ...ZERO_MACROS };
    return {
      date,
      targets: dayTargets,
      consumed,
      remaining,
      logs,
      mealsLogged: logs.length,
    };
  }

  async function getDay(date: LocalDate): Promise<DayNutrition> {
    const [logs, dayTargets] = await Promise.all([
      listLogRows({ from: date, to: date }).then(attachItems),
      targets.getActive(date),
    ]);
    return buildDay(date, logs, dayTargets);
  }

  function buildItems(logId: Id, drafts: readonly FoodItemDraft[]): FoodItem[] {
    return drafts.map((draft) => ({
      id: db.newId(),
      foodLogId: logId,
      name: draft.name,
      quantity: draft.quantity,
      unit: draft.unit,
      kcal: draft.kcal,
      proteinG: draft.proteinG,
      carbsG: draft.carbsG,
      fatG: draft.fatG,
      fiberG: draft.fiberG,
      confidence: draft.confidence,
      savedMealId: draft.savedMealId,
    }));
  }

  async function getLog(id: Id): Promise<FoodLogWithItems | null> {
    const rows = await db.orm.select().from(foodLogs).where(eq(foodLogs.id, id)).limit(1);
    const log = firstOrNull(rows);
    if (!log) return null;
    const [withItems] = await attachItems([log]);
    return withItems ?? null;
  }

  return {
    getDay,
    async getDays(range: { from: LocalDate; to: LocalDate }): Promise<DayNutrition[]> {
      const logs = await attachItems(await listLogRows(range));
      const byDate = groupBy(logs, (log) => log.date);
      const dates = [...byDate.keys()].sort();
      const days: DayNutrition[] = [];
      for (const date of dates) {
        days.push(buildDay(date, byDate.get(date) ?? [], await targets.getActive(date)));
      }
      return days;
    },
    getLog,
    async listLogs(range: { from: LocalDate; to: LocalDate }): Promise<FoodLogWithItems[]> {
      return attachItems(await listLogRows(range));
    },
    async createLog(
      draft: FoodLogDraft & { items?: readonly FoodItemDraft[] },
    ): Promise<FoodLogWithItems> {
      const loggedAt = draft.loggedAt ?? db.now();
      const source: FoodLogSource = draft.source ?? 'manual';
      const log: FoodLog = {
        id: db.newId(),
        date: draft.date,
        mealSlot: draft.mealSlot,
        rawText: draft.rawText ?? '',
        loggedAt,
        source,
        estimationStatus: draft.estimationStatus ?? 'final',
      };
      const items = buildItems(log.id, draft.items ?? []);
      return db.transaction(async (tx) => {
        await tx.orm.insert(foodLogs).values(log);
        if (items.length > 0) await tx.orm.insert(foodItems).values(items);
        return { ...log, items };
      });
    },
    async updateLog(id: Id, patch: Partial<FoodLogFields>): Promise<FoodLog> {
      const fields = definedOnly(patch);
      if (isEmptyPatch(fields)) {
        const rows = await db.orm.select().from(foodLogs).where(eq(foodLogs.id, id)).limit(1);
        return requireRow(rows[0], 'food_logs', id);
      }
      const [row] = await db.orm
        .update(foodLogs)
        .set(fields)
        .where(eq(foodLogs.id, id))
        .returning();
      return requireRow(row as FoodLog | undefined, 'food_logs', id);
    },
    async removeLog(id: Id): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.orm.delete(foodItems).where(eq(foodItems.foodLogId, id));
        await tx.orm.delete(foodLogs).where(eq(foodLogs.id, id));
      });
    },
    async addItems(logId: Id, items: readonly FoodItemDraft[]): Promise<FoodItem[]> {
      if (items.length === 0) return [];
      const rows = buildItems(logId, items);
      await db.orm.insert(foodItems).values(rows);
      return rows;
    },
    async replaceItems(logId: Id, items: readonly FoodItemDraft[]): Promise<FoodLogWithItems> {
      const rows = buildItems(logId, items);
      await db.transaction(async (tx) => {
        await tx.orm.delete(foodItems).where(eq(foodItems.foodLogId, logId));
        if (rows.length > 0) await tx.orm.insert(foodItems).values(rows);
      });
      const log = await getLog(logId);
      return requireRow(log ?? undefined, 'food_logs', logId);
    },
    async updateItem(id: Id, patch: Partial<FoodItemFields>): Promise<FoodItem> {
      const fields = definedOnly(patch);
      if (isEmptyPatch(fields)) {
        const rows = await db.orm.select().from(foodItems).where(eq(foodItems.id, id)).limit(1);
        return requireRow(rows[0], 'food_items', id);
      }
      const [row] = await db.orm
        .update(foodItems)
        .set(fields)
        .where(eq(foodItems.id, id))
        .returning();
      return requireRow(row as FoodItem | undefined, 'food_items', id);
    },
    async removeItem(id: Id): Promise<void> {
      await db.orm.delete(foodItems).where(eq(foodItems.id, id));
    },
  };
}
