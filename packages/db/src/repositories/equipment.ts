import type { Equipment, EquipmentCategory, Id } from '@vigor/core';
import { asc, eq, inArray } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { equipment as equipmentTable } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type EquipmentFields = Omit<Equipment, 'id'>;

export type EquipmentDraft = Partial<EquipmentFields> & Pick<EquipmentFields, 'name' | 'category'>;

/**
 * Default smallest load jump per category, in kg — DESIGN.md §5.1. A row may
 * override it (a gym's dumbbells might go up in 2.5 kg steps), which is why the
 * value is stored per equipment row rather than derived at progression time.
 */
export const DEFAULT_LOAD_INCREMENT_KG: Record<EquipmentCategory, number | null> = {
  barbell: 2.5,
  dumbbell: 2,
  kettlebell: 4,
  band: null,
  machine: 5,
  cable: 2.5,
  bodyweight: null,
  cardio: null,
  other: null,
};

export interface EquipmentRepository {
  list(options?: { availableOnly?: boolean }): Promise<Equipment[]>;
  listAvailable(): Promise<Equipment[]>;
  get(id: Id): Promise<Equipment | null>;
  getMany(ids: readonly Id[]): Promise<Equipment[]>;
  create(draft: EquipmentDraft): Promise<Equipment>;
  update(id: Id, patch: Partial<EquipmentFields>): Promise<Equipment>;
  setAvailable(id: Id, available: boolean): Promise<Equipment>;
  remove(id: Id): Promise<void>;
}

export function createEquipmentRepository(db: VigorDb): EquipmentRepository {
  async function list(options: { availableOnly?: boolean } = {}): Promise<Equipment[]> {
    const query = db.orm.select().from(equipmentTable);
    return options.availableOnly
      ? query.where(eq(equipmentTable.available, true)).orderBy(asc(equipmentTable.name))
      : query.orderBy(asc(equipmentTable.name));
  }

  async function get(id: Id): Promise<Equipment | null> {
    const rows = await db.orm
      .select()
      .from(equipmentTable)
      .where(eq(equipmentTable.id, id))
      .limit(1);
    return firstOrNull(rows);
  }

  async function update(id: Id, patch: Partial<EquipmentFields>): Promise<Equipment> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'equipment', id);
    }
    const [row] = await db.orm
      .update(equipmentTable)
      .set(fields)
      .where(eq(equipmentTable.id, id))
      .returning();
    return requireRow(row as Equipment | undefined, 'equipment', id);
  }

  return {
    list,
    listAvailable: () => list({ availableOnly: true }),
    get,
    async getMany(ids: readonly Id[]): Promise<Equipment[]> {
      if (ids.length === 0) return [];
      return db.orm
        .select()
        .from(equipmentTable)
        .where(inArray(equipmentTable.id, [...ids]));
    },
    async create(draft: EquipmentDraft): Promise<Equipment> {
      const row: Equipment = {
        id: db.newId(),
        name: draft.name,
        category: draft.category,
        available: draft.available ?? true,
        loadIncrementKg: draft.loadIncrementKg ?? DEFAULT_LOAD_INCREMENT_KG[draft.category],
        notes: draft.notes ?? null,
      };
      const [inserted] = await db.orm.insert(equipmentTable).values(row).returning();
      return inserted as Equipment;
    },
    update,
    setAvailable: (id, available) => update(id, { available }),
    async remove(id: Id): Promise<void> {
      await db.orm.delete(equipmentTable).where(eq(equipmentTable.id, id));
    },
  };
}
