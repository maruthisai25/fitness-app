import type { Id, LocalDate, Readiness } from '@vigor/core';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { readiness as readinessTable } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type ReadinessFields = Omit<Readiness, 'id'>;

export type ReadinessDraft = Partial<ReadinessFields>;

const READINESS_DEFAULTS: Omit<ReadinessFields, 'date'> = {
  sleepHours: null,
  sleepQuality: null,
  energy: null,
  soreness: null,
  fatigue: null,
  stress: null,
  painReported: false,
  painNote: null,
  score: null,
  notes: null,
};

export interface ReadinessRepository {
  /** The check-in for one day. At most one row per date. */
  getByDate(date: LocalDate): Promise<Readiness | null>;
  get(id: Id): Promise<Readiness | null>;
  /** The most recent check-in on or before `date`. */
  latest(date?: LocalDate): Promise<Readiness | null>;
  listRange(range: { from: LocalDate; to: LocalDate }): Promise<Readiness[]>;
  /**
   * Creates or patches the row for `date`. The check-in is progressive — the
   * user answers sleep now and energy later — so partial writes must merge.
   */
  upsertForDate(date: LocalDate, draft: ReadinessDraft): Promise<Readiness>;
  update(id: Id, patch: Partial<ReadinessFields>): Promise<Readiness>;
  /** Stores the 0–100 score the readiness engine computed (DESIGN.md §5.2). */
  setScore(id: Id, score: number): Promise<Readiness>;
  remove(id: Id): Promise<void>;
}

export function createReadinessRepository(db: VigorDb): ReadinessRepository {
  async function getByDate(date: LocalDate): Promise<Readiness | null> {
    const rows = await db.orm
      .select()
      .from(readinessTable)
      .where(eq(readinessTable.date, date))
      .limit(1);
    return firstOrNull(rows);
  }

  async function get(id: Id): Promise<Readiness | null> {
    const rows = await db.orm
      .select()
      .from(readinessTable)
      .where(eq(readinessTable.id, id))
      .limit(1);
    return firstOrNull(rows);
  }

  async function update(id: Id, patch: Partial<ReadinessFields>): Promise<Readiness> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'readiness', id);
    }
    const [row] = await db.orm
      .update(readinessTable)
      .set(fields)
      .where(eq(readinessTable.id, id))
      .returning();
    return requireRow(row as Readiness | undefined, 'readiness', id);
  }

  return {
    getByDate,
    get,
    async latest(date?: LocalDate): Promise<Readiness | null> {
      const query = db.orm.select().from(readinessTable);
      const rows = date
        ? await query
            .where(lte(readinessTable.date, date))
            .orderBy(desc(readinessTable.date))
            .limit(1)
        : await query.orderBy(desc(readinessTable.date)).limit(1);
      return firstOrNull(rows);
    },
    async listRange(range: { from: LocalDate; to: LocalDate }): Promise<Readiness[]> {
      return db.orm
        .select()
        .from(readinessTable)
        .where(and(gte(readinessTable.date, range.from), lte(readinessTable.date, range.to)))
        .orderBy(asc(readinessTable.date));
    },
    async upsertForDate(date: LocalDate, draft: ReadinessDraft): Promise<Readiness> {
      return db.transaction(async (tx) => {
        const existing = await tx.orm
          .select()
          .from(readinessTable)
          .where(eq(readinessTable.date, date))
          .limit(1);
        const current = firstOrNull(existing);
        const fields = definedOnly(draft);
        if (current) {
          if (isEmptyPatch(fields)) return current;
          const [row] = await tx.orm
            .update(readinessTable)
            .set(fields)
            .where(eq(readinessTable.id, current.id))
            .returning();
          return row as Readiness;
        }
        const row: Readiness = {
          id: db.newId(),
          ...READINESS_DEFAULTS,
          ...fields,
          date,
        };
        const [inserted] = await tx.orm.insert(readinessTable).values(row).returning();
        return inserted as Readiness;
      });
    },
    update,
    setScore: (id, score) => update(id, { score }),
    async remove(id: Id): Promise<void> {
      await db.orm.delete(readinessTable).where(eq(readinessTable.id, id));
    },
  };
}
