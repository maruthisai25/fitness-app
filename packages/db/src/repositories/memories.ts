import type {
  EvidenceRef,
  Id,
  IsoTimestamp,
  Memory,
  MemoryDomain,
  MemoryKind,
  MemorySource,
} from '@vigor/core';
import { and, asc, desc, eq, gt, isNull, or, type SQL } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { memories as memoriesTable, memoryForgets } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type MemoryFields = Omit<Memory, 'id' | 'createdAt' | 'updatedAt'>;

export type MemoryDraft = Partial<MemoryFields> & Pick<MemoryFields, 'kind' | 'domain' | 'text'>;

/** DESIGN.md §4.2 — `memories.listActive(filter?)`. */
export interface MemoryFilter {
  kind?: MemoryKind;
  domain?: MemoryDomain;
  source?: MemorySource;
  /** Drops memories whose `expiresAt` is at or before this instant. */
  asOf?: IsoTimestamp;
  /** Most recently updated first, so a limit keeps the freshest (DESIGN.md §6.2). */
  limit?: number;
}

/** One entry of the forget audit trail. */
export interface ForgetRecord {
  id: Id;
  memoryId: Id;
  reason: string | null;
  forgottenAt: IsoTimestamp;
}

export interface MemoryRepository {
  /** DESIGN.md §4.2. Active, unexpired memories, most recently updated first. */
  listActive(filter?: MemoryFilter): Promise<Memory[]>;
  /** Everything, including forgotten rows — the You → Memories screen (§8). */
  list(filter?: MemoryFilter & { includeInactive?: boolean }): Promise<Memory[]>;
  get(id: Id): Promise<Memory | null>;
  create(draft: MemoryDraft): Promise<Memory>;
  update(id: Id, patch: Partial<MemoryFields>): Promise<Memory>;
  /**
   * DESIGN.md §4.2 — soft delete. The row stays so the evidence trail and any
   * derived insight keep resolving; `reason` is recorded for the audit list.
   */
  forget(id: Id, reason?: string): Promise<void>;
  /** Undoes a `forget`, for the "Remembered: …" chip's undo. */
  restore(id: Id): Promise<Memory>;
  /** Why and when each memory was forgotten, newest first. */
  listForgotten(): Promise<ForgetRecord[]>;
  /** Hard delete. DESIGN.md §8: every memory row must be deletable. */
  remove(id: Id): Promise<void>;
}

function buildConditions(filter: MemoryFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.kind) conditions.push(eq(memoriesTable.kind, filter.kind));
  if (filter.domain) conditions.push(eq(memoriesTable.domain, filter.domain));
  if (filter.source) conditions.push(eq(memoriesTable.source, filter.source));
  if (filter.asOf) {
    const unexpired = or(isNull(memoriesTable.expiresAt), gt(memoriesTable.expiresAt, filter.asOf));
    if (unexpired) conditions.push(unexpired);
  }
  return conditions;
}

export function createMemoryRepository(db: VigorDb): MemoryRepository {
  async function get(id: Id): Promise<Memory | null> {
    const rows = await db.orm.select().from(memoriesTable).where(eq(memoriesTable.id, id)).limit(1);
    return firstOrNull(rows);
  }

  async function runList(conditions: SQL[], limit?: number): Promise<Memory[]> {
    const query = db.orm
      .select()
      .from(memoriesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(memoriesTable.updatedAt), desc(memoriesTable.id));
    return limit !== undefined ? query.limit(limit) : query;
  }

  async function update(id: Id, patch: Partial<MemoryFields>): Promise<Memory> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'memories', id);
    }
    const [row] = await db.orm
      .update(memoriesTable)
      .set({ ...fields, updatedAt: db.now() })
      .where(eq(memoriesTable.id, id))
      .returning();
    return requireRow(row as Memory | undefined, 'memories', id);
  }

  return {
    async listActive(filter: MemoryFilter = {}): Promise<Memory[]> {
      const asOf = filter.asOf ?? db.now();
      const conditions = buildConditions({ ...filter, asOf });
      conditions.push(eq(memoriesTable.active, true));
      return runList(conditions, filter.limit);
    },
    async list(filter: MemoryFilter & { includeInactive?: boolean } = {}): Promise<Memory[]> {
      const conditions = buildConditions(filter);
      if (!filter.includeInactive) conditions.push(eq(memoriesTable.active, true));
      return runList(conditions, filter.limit);
    },
    get,
    async create(draft: MemoryDraft): Promise<Memory> {
      const timestamp = db.now();
      const evidence: EvidenceRef[] = draft.evidence ? [...draft.evidence] : [];
      const row: Memory = {
        id: db.newId(),
        kind: draft.kind,
        domain: draft.domain,
        text: draft.text,
        source: draft.source ?? 'user',
        confidence: draft.confidence ?? 1,
        evidence,
        active: draft.active ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
        expiresAt: draft.expiresAt ?? null,
      };
      const [inserted] = await db.orm.insert(memoriesTable).values(row).returning();
      return inserted as Memory;
    },
    update,
    async forget(id: Id, reason?: string): Promise<void> {
      await db.transaction(async (tx) => {
        const forgottenAt = db.now();
        const [row] = await tx.orm
          .update(memoriesTable)
          .set({ active: false, updatedAt: forgottenAt })
          .where(eq(memoriesTable.id, id))
          .returning();
        requireRow(row as Memory | undefined, 'memories', id);
        await tx.orm.insert(memoryForgets).values({
          id: db.newId(),
          memoryId: id,
          reason: reason ?? null,
          forgottenAt,
        });
      });
    },
    restore: (id) => update(id, { active: true }),
    async listForgotten(): Promise<ForgetRecord[]> {
      return db.orm
        .select()
        .from(memoryForgets)
        .orderBy(desc(memoryForgets.forgottenAt), asc(memoryForgets.id));
    },
    async remove(id: Id): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.orm.delete(memoryForgets).where(eq(memoryForgets.memoryId, id));
        await tx.orm.delete(memoriesTable).where(eq(memoriesTable.id, id));
      });
    },
  };
}
