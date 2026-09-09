import type { Id, LocalDate, PersonalRecord, PersonalRecordKind } from '@vigor/core';
import { and, asc, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { personalRecords } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type PersonalRecordFields = Omit<PersonalRecord, 'id'>;

export type PersonalRecordDraft = Partial<PersonalRecordFields> &
  Pick<PersonalRecordFields, 'exerciseId' | 'kind' | 'value' | 'date'>;

export interface RecordRepository {
  /** Newest first. */
  listForExercise(
    exerciseId: Id,
    options?: { kind?: PersonalRecordKind; limit?: number },
  ): Promise<PersonalRecord[]>;
  /** The highest `value` of that kind, or `null` if the exercise has none. */
  getBest(exerciseId: Id, kind: PersonalRecordKind): Promise<PersonalRecord | null>;
  get(id: Id): Promise<PersonalRecord | null>;
  listRange(range: { from: LocalDate; to: LocalDate }): Promise<PersonalRecord[]>;
  listRecent(options?: { limit?: number }): Promise<PersonalRecord[]>;
  /**
   * Stores a record. The PR engine (DESIGN.md §5.7) decides whether a set beats
   * the previous best; this repository only persists what it decided.
   */
  create(draft: PersonalRecordDraft): Promise<PersonalRecord>;
  update(id: Id, patch: Partial<PersonalRecordFields>): Promise<PersonalRecord>;
  remove(id: Id): Promise<void>;
  /** Used when a set is edited or deleted and its record no longer stands. */
  removeForSet(setId: Id): Promise<void>;
}

export function createRecordRepository(db: VigorDb): RecordRepository {
  async function get(id: Id): Promise<PersonalRecord | null> {
    const rows = await db.orm
      .select()
      .from(personalRecords)
      .where(eq(personalRecords.id, id))
      .limit(1);
    return firstOrNull(rows);
  }

  return {
    async listForExercise(
      exerciseId: Id,
      options: { kind?: PersonalRecordKind; limit?: number } = {},
    ): Promise<PersonalRecord[]> {
      const conditions: SQL[] = [eq(personalRecords.exerciseId, exerciseId)];
      if (options.kind) conditions.push(eq(personalRecords.kind, options.kind));
      const query = db.orm
        .select()
        .from(personalRecords)
        .where(and(...conditions))
        .orderBy(desc(personalRecords.date), desc(personalRecords.id));
      return options.limit !== undefined ? query.limit(options.limit) : query;
    },
    async getBest(exerciseId: Id, kind: PersonalRecordKind): Promise<PersonalRecord | null> {
      const rows = await db.orm
        .select()
        .from(personalRecords)
        .where(and(eq(personalRecords.exerciseId, exerciseId), eq(personalRecords.kind, kind)))
        .orderBy(desc(personalRecords.value), desc(personalRecords.date))
        .limit(1);
      return firstOrNull(rows);
    },
    get,
    async listRange(range: { from: LocalDate; to: LocalDate }): Promise<PersonalRecord[]> {
      return db.orm
        .select()
        .from(personalRecords)
        .where(and(gte(personalRecords.date, range.from), lte(personalRecords.date, range.to)))
        .orderBy(asc(personalRecords.date), asc(personalRecords.id));
    },
    async listRecent(options: { limit?: number } = {}): Promise<PersonalRecord[]> {
      return db.orm
        .select()
        .from(personalRecords)
        .orderBy(desc(personalRecords.date), desc(personalRecords.id))
        .limit(options.limit ?? 20);
    },
    async create(draft: PersonalRecordDraft): Promise<PersonalRecord> {
      const row: PersonalRecord = {
        id: db.newId(),
        exerciseId: draft.exerciseId,
        kind: draft.kind,
        value: draft.value,
        loadKg: draft.loadKg ?? null,
        reps: draft.reps ?? null,
        setId: draft.setId ?? null,
        date: draft.date,
      };
      const [inserted] = await db.orm.insert(personalRecords).values(row).returning();
      return inserted as PersonalRecord;
    },
    async update(id: Id, patch: Partial<PersonalRecordFields>): Promise<PersonalRecord> {
      const fields = definedOnly(patch);
      if (isEmptyPatch(fields)) {
        const current = await get(id);
        return requireRow(current ?? undefined, 'personal_records', id);
      }
      const [row] = await db.orm
        .update(personalRecords)
        .set(fields)
        .where(eq(personalRecords.id, id))
        .returning();
      return requireRow(row as PersonalRecord | undefined, 'personal_records', id);
    },
    async remove(id: Id): Promise<void> {
      await db.orm.delete(personalRecords).where(eq(personalRecords.id, id));
    },
    async removeForSet(setId: Id): Promise<void> {
      await db.orm.delete(personalRecords).where(eq(personalRecords.setId, setId));
    },
  };
}
