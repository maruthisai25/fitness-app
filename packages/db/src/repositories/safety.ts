import type { Id, IsoTimestamp, LocalDate, SafetyEvent } from '@vigor/core';
import { and, asc, desc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { localDateFromTimestamp } from '../dates';
import { safetyEvents } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type SafetyEventFields = Omit<SafetyEvent, 'id'>;

export type SafetyEventDraft = Partial<SafetyEventFields> &
  Pick<SafetyEventFields, 'kind' | 'text' | 'source'>;

export interface SafetyRepository {
  /**
   * Unresolved events, newest first. DESIGN.md §6.5: while this is non-empty
   * the safety state is active — engines hold, the planner drops the affected
   * pattern group, and the UI shows a banner.
   */
  listOpen(): Promise<SafetyEvent[]>;
  /** True while any event is unresolved. */
  isActive(): Promise<boolean>;
  list(filter?: {
    from?: LocalDate;
    to?: LocalDate;
    includeResolved?: boolean;
  }): Promise<SafetyEvent[]>;
  get(id: Id): Promise<SafetyEvent | null>;
  /** The `report_safety` tool and the readiness check-in's `painReported` both land here. */
  create(draft: SafetyEventDraft): Promise<SafetyEvent>;
  update(id: Id, patch: Partial<SafetyEventFields>): Promise<SafetyEvent>;
  /** Clears the event; safety state lifts once nothing is left open. */
  resolve(id: Id, note?: string, at?: IsoTimestamp): Promise<SafetyEvent>;
  reopen(id: Id): Promise<SafetyEvent>;
  remove(id: Id): Promise<void>;
}

export function createSafetyRepository(db: VigorDb): SafetyRepository {
  async function get(id: Id): Promise<SafetyEvent | null> {
    const rows = await db.orm.select().from(safetyEvents).where(eq(safetyEvents.id, id)).limit(1);
    return firstOrNull(rows);
  }

  async function listOpen(): Promise<SafetyEvent[]> {
    return db.orm
      .select()
      .from(safetyEvents)
      .where(isNull(safetyEvents.resolvedAt))
      .orderBy(desc(safetyEvents.date), desc(safetyEvents.id));
  }

  async function update(id: Id, patch: Partial<SafetyEventFields>): Promise<SafetyEvent> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'safety_events', id);
    }
    const [row] = await db.orm
      .update(safetyEvents)
      .set(fields)
      .where(eq(safetyEvents.id, id))
      .returning();
    return requireRow(row as SafetyEvent | undefined, 'safety_events', id);
  }

  return {
    listOpen,
    async isActive(): Promise<boolean> {
      const rows = await db.orm
        .select({ id: safetyEvents.id })
        .from(safetyEvents)
        .where(isNull(safetyEvents.resolvedAt))
        .limit(1);
      return rows.length > 0;
    },
    async list(
      filter: { from?: LocalDate; to?: LocalDate; includeResolved?: boolean } = {},
    ): Promise<SafetyEvent[]> {
      const conditions: SQL[] = [];
      if (!filter.includeResolved) conditions.push(isNull(safetyEvents.resolvedAt));
      if (filter.from) conditions.push(gte(safetyEvents.date, filter.from));
      if (filter.to) conditions.push(lte(safetyEvents.date, filter.to));
      return db.orm
        .select()
        .from(safetyEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(safetyEvents.date), asc(safetyEvents.id));
    },
    get,
    async create(draft: SafetyEventDraft): Promise<SafetyEvent> {
      const row: SafetyEvent = {
        id: db.newId(),
        date: draft.date ?? localDateFromTimestamp(db.now()),
        kind: draft.kind,
        text: draft.text,
        source: draft.source,
        resolvedAt: draft.resolvedAt ?? null,
        note: draft.note ?? null,
      };
      const [inserted] = await db.orm.insert(safetyEvents).values(row).returning();
      return inserted as SafetyEvent;
    },
    update,
    resolve: (id, note, at) =>
      update(id, { resolvedAt: at ?? db.now(), ...(note === undefined ? {} : { note }) }),
    reopen: (id) => update(id, { resolvedAt: null }),
    async remove(id: Id): Promise<void> {
      await db.orm.delete(safetyEvents).where(eq(safetyEvents.id, id));
    },
  };
}
