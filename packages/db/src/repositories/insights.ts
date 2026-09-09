import type { DateRange, EvidenceRef, Id, Insight, InsightSeverity } from '@vigor/core';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { insights as insightsTable } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type InsightFields = Omit<Insight, 'id' | 'createdAt'>;

export type InsightDraft = Partial<InsightFields> &
  Pick<InsightFields, 'detector' | 'period' | 'headline'>;

export interface InsightFilter {
  /** Detector code, e.g. `PLATEAU` or `PROTEIN_GAP_BY_DAY` (DESIGN.md §5.8). */
  detector?: string;
  severity?: InsightSeverity;
  includeDismissed?: boolean;
  /** Matches insights created on or after this calendar day. */
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
}

export interface InsightRepository {
  /** Undismissed insights, newest first — what the Today tab shows. */
  listOpen(options?: { limit?: number }): Promise<Insight[]>;
  list(filter?: InsightFilter): Promise<Insight[]>;
  get(id: Id): Promise<Insight | null>;
  create(draft: InsightDraft): Promise<Insight>;
  /** One detector run writes its whole batch in a single transaction. */
  createMany(drafts: readonly InsightDraft[]): Promise<Insight[]>;
  update(id: Id, patch: Partial<InsightFields>): Promise<Insight>;
  dismiss(id: Id): Promise<Insight>;
  remove(id: Id): Promise<void>;
  /** Clears a detector's previous output before it writes a fresh batch. */
  removeByDetector(detector: string): Promise<void>;
}

export function createInsightRepository(db: VigorDb): InsightRepository {
  function buildRow(draft: InsightDraft): Insight {
    const evidence: EvidenceRef[] = draft.evidence ? [...draft.evidence] : [];
    const period: DateRange = draft.period;
    return {
      id: db.newId(),
      detector: draft.detector,
      period,
      headline: draft.headline,
      detail: draft.detail ?? '',
      evidence,
      severity: draft.severity ?? 'info',
      dismissed: draft.dismissed ?? false,
      dismissedAt: draft.dismissedAt ?? null,
      createdAt: db.now(),
    };
  }

  async function get(id: Id): Promise<Insight | null> {
    const rows = await db.orm.select().from(insightsTable).where(eq(insightsTable.id, id)).limit(1);
    return firstOrNull(rows);
  }

  async function update(id: Id, patch: Partial<InsightFields>): Promise<Insight> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'insights', id);
    }
    const [row] = await db.orm
      .update(insightsTable)
      .set(fields)
      .where(eq(insightsTable.id, id))
      .returning();
    return requireRow(row as Insight | undefined, 'insights', id);
  }

  async function list(filter: InsightFilter = {}): Promise<Insight[]> {
    const conditions: SQL[] = [];
    if (!filter.includeDismissed) conditions.push(eq(insightsTable.dismissed, false));
    if (filter.detector) conditions.push(eq(insightsTable.detector, filter.detector));
    if (filter.severity) conditions.push(eq(insightsTable.severity, filter.severity));
    if (filter.createdFrom) conditions.push(gte(insightsTable.createdAt, filter.createdFrom));
    if (filter.createdTo) conditions.push(lte(insightsTable.createdAt, filter.createdTo));
    const query = db.orm
      .select()
      .from(insightsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(insightsTable.createdAt), desc(insightsTable.id));
    return filter.limit !== undefined ? query.limit(filter.limit) : query;
  }

  return {
    listOpen: (options = {}) => list({ limit: options.limit }),
    list,
    get,
    async create(draft: InsightDraft): Promise<Insight> {
      const [row] = await db.orm.insert(insightsTable).values(buildRow(draft)).returning();
      return row as Insight;
    },
    async createMany(drafts: readonly InsightDraft[]): Promise<Insight[]> {
      if (drafts.length === 0) return [];
      const rows = drafts.map(buildRow);
      await db.orm.insert(insightsTable).values(rows);
      return rows;
    },
    update,
    /** Stamps the moment as well as the flag, so "when" survives the write. */
    dismiss: (id) => update(id, { dismissed: true, dismissedAt: db.now() }),
    async remove(id: Id): Promise<void> {
      await db.orm.delete(insightsTable).where(eq(insightsTable.id, id));
    },
    async removeByDetector(detector: string): Promise<void> {
      await db.orm.delete(insightsTable).where(eq(insightsTable.detector, detector));
    },
  };
}
