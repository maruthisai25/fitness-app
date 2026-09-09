import type { Id, InventoryItem, LocalDate } from '@vigor/core';
import { and, asc, eq, inArray, isNotNull, lte, type SQL } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { inventoryItems } from '../schema';
import {
  chunk,
  definedOnly,
  firstOrNull,
  isEmptyPatch,
  MAX_BOUND_PARAMS,
  requireRow,
} from './support';

export type InventoryItemFields = Omit<InventoryItem, 'id'>;

export type InventoryItemDraft = Partial<InventoryItemFields> &
  Pick<InventoryItemFields, 'name' | 'quantity' | 'unit'>;

export interface InventoryRepository {
  list(filter?: { category?: string }): Promise<InventoryItem[]>;
  get(id: Id): Promise<InventoryItem | null>;
  getByName(name: string): Promise<InventoryItem | null>;
  /**
   * Items whose `useBy` falls on or before `date`. The recipe prompt puts these
   * first so nothing spoils (DESIGN.md §6.4, idea.md §17).
   */
  listExpiringBy(date: LocalDate): Promise<InventoryItem[]>;
  add(draft: InventoryItemDraft): Promise<InventoryItem>;
  /** The `update_inventory` coach tool's add side (DESIGN.md §6.3). */
  addMany(drafts: readonly InventoryItemDraft[]): Promise<InventoryItem[]>;
  update(id: Id, patch: Partial<InventoryItemFields>): Promise<InventoryItem>;
  remove(id: Id): Promise<void>;
  /** The `update_inventory` coach tool's remove side. */
  removeMany(ids: readonly Id[]): Promise<void>;
  clear(): Promise<void>;
}

export function createInventoryRepository(db: VigorDb): InventoryRepository {
  async function get(id: Id): Promise<InventoryItem | null> {
    const rows = await db.orm
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);
    return firstOrNull(rows);
  }

  function buildRow(draft: InventoryItemDraft): InventoryItem {
    return {
      id: db.newId(),
      category: null,
      useBy: null,
      notes: null,
      addedAt: db.now(),
      ...definedOnly(draft),
      name: draft.name,
      quantity: draft.quantity,
      unit: draft.unit,
    };
  }

  return {
    async list(filter: { category?: string } = {}): Promise<InventoryItem[]> {
      const conditions: SQL[] = [];
      if (filter.category) conditions.push(eq(inventoryItems.category, filter.category));
      return db.orm
        .select()
        .from(inventoryItems)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(inventoryItems.name));
    },
    get,
    async getByName(name: string): Promise<InventoryItem | null> {
      const rows = await db.orm
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.name, name))
        .limit(1);
      return firstOrNull(rows);
    },
    async listExpiringBy(date: LocalDate): Promise<InventoryItem[]> {
      return db.orm
        .select()
        .from(inventoryItems)
        .where(and(isNotNull(inventoryItems.useBy), lte(inventoryItems.useBy, date)))
        .orderBy(asc(inventoryItems.useBy), asc(inventoryItems.name));
    },
    async add(draft: InventoryItemDraft): Promise<InventoryItem> {
      const [row] = await db.orm.insert(inventoryItems).values(buildRow(draft)).returning();
      return row as InventoryItem;
    },
    async addMany(drafts: readonly InventoryItemDraft[]): Promise<InventoryItem[]> {
      if (drafts.length === 0) return [];
      const rows = drafts.map(buildRow);
      await db.orm.insert(inventoryItems).values(rows);
      return rows;
    },
    async update(id: Id, patch: Partial<InventoryItemFields>): Promise<InventoryItem> {
      const fields = definedOnly(patch);
      if (isEmptyPatch(fields)) {
        const current = await get(id);
        return requireRow(current ?? undefined, 'inventory_items', id);
      }
      const [row] = await db.orm
        .update(inventoryItems)
        .set(fields)
        .where(eq(inventoryItems.id, id))
        .returning();
      return requireRow(row as InventoryItem | undefined, 'inventory_items', id);
    },
    async remove(id: Id): Promise<void> {
      await db.orm.delete(inventoryItems).where(eq(inventoryItems.id, id));
    },
    async removeMany(ids: readonly Id[]): Promise<void> {
      for (const batch of chunk(ids, MAX_BOUND_PARAMS)) {
        await db.orm.delete(inventoryItems).where(inArray(inventoryItems.id, batch));
      }
    },
    async clear(): Promise<void> {
      await db.orm.delete(inventoryItems);
    },
  };
}
