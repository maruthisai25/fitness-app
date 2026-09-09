import type { Goal, Id } from '@vigor/core';
import { asc, eq } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { goals as goalsTable } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type GoalFields = Omit<Goal, 'id' | 'createdAt'>;

/** A new goal defaults to active, at the lowest priority the caller does not set. */
export type GoalDraft = Partial<GoalFields> & Pick<GoalFields, 'type'>;

export interface GoalRepository {
  /** Ordered by priority (1 = highest), then creation. */
  list(options?: { includeInactive?: boolean }): Promise<Goal[]>;
  /** Only the goals the engines and the coach should honour. */
  listActive(): Promise<Goal[]>;
  get(id: Id): Promise<Goal | null>;
  create(draft: GoalDraft): Promise<Goal>;
  update(id: Id, patch: Partial<GoalFields>): Promise<Goal>;
  /** Soft state change — the goal stays visible in the You tab. */
  setActive(id: Id, active: boolean): Promise<Goal>;
  remove(id: Id): Promise<void>;
}

export function createGoalRepository(db: VigorDb): GoalRepository {
  async function list(options: { includeInactive?: boolean } = {}): Promise<Goal[]> {
    const query = db.orm.select().from(goalsTable);
    const rows = options.includeInactive
      ? await query.orderBy(asc(goalsTable.priority), asc(goalsTable.createdAt))
      : await query
          .where(eq(goalsTable.active, true))
          .orderBy(asc(goalsTable.priority), asc(goalsTable.createdAt));
    return rows;
  }

  async function get(id: Id): Promise<Goal | null> {
    const rows = await db.orm.select().from(goalsTable).where(eq(goalsTable.id, id)).limit(1);
    return firstOrNull(rows);
  }

  async function create(draft: GoalDraft): Promise<Goal> {
    const row: Goal = {
      id: db.newId(),
      type: draft.type,
      priority: draft.priority ?? 1,
      targetNote: draft.targetNote ?? null,
      active: draft.active ?? true,
      createdAt: db.now(),
    };
    const [inserted] = await db.orm.insert(goalsTable).values(row).returning();
    return inserted as Goal;
  }

  async function update(id: Id, patch: Partial<GoalFields>): Promise<Goal> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'goals', id);
    }
    const [row] = await db.orm
      .update(goalsTable)
      .set(fields)
      .where(eq(goalsTable.id, id))
      .returning();
    return requireRow(row as Goal | undefined, 'goals', id);
  }

  return {
    list,
    listActive: () => list(),
    get,
    create,
    update,
    setActive: (id, active) => update(id, { active }),
    async remove(id: Id): Promise<void> {
      await db.orm.delete(goalsTable).where(eq(goalsTable.id, id));
    },
  };
}
