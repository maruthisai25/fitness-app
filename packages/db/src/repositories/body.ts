import type { BodyMetric, Id, LocalDate, ProgressPhoto, ProgressPhotoView } from '@vigor/core';
import { and, asc, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { bodyMetrics, progressPhotos } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type BodyMetricFields = Omit<BodyMetric, 'id'>;

export type BodyMetricDraft = Partial<BodyMetricFields> & Pick<BodyMetricFields, 'date'>;

export type ProgressPhotoFields = Omit<ProgressPhoto, 'id'>;

export type ProgressPhotoDraft = Partial<ProgressPhotoFields> &
  Pick<ProgressPhotoFields, 'date' | 'view' | 'fileRef'>;

export interface BodyRepository {
  /** Oldest first, so the Progress tab can chart straight from the result. */
  listMetrics(range?: { from?: LocalDate; to?: LocalDate }): Promise<BodyMetric[]>;
  getMetric(id: Id): Promise<BodyMetric | null>;
  getMetricByDate(date: LocalDate): Promise<BodyMetric | null>;
  latestMetric(): Promise<BodyMetric | null>;
  /** One entry per day; a second write for the same date merges into it. */
  upsertMetric(draft: BodyMetricDraft): Promise<BodyMetric>;
  updateMetric(id: Id, patch: Partial<BodyMetricFields>): Promise<BodyMetric>;
  removeMetric(id: Id): Promise<void>;

  listPhotos(filter?: {
    from?: LocalDate;
    to?: LocalDate;
    view?: ProgressPhotoView;
  }): Promise<ProgressPhoto[]>;
  getPhoto(id: Id): Promise<ProgressPhoto | null>;
  /** `fileRef` is a path inside the app sandbox, never absolute (DESIGN.md §7.3). */
  addPhoto(draft: ProgressPhotoDraft): Promise<ProgressPhoto>;
  updatePhoto(id: Id, patch: Partial<ProgressPhotoFields>): Promise<ProgressPhoto>;
  /** Removes the row only. Deleting the file is the platform FileStore's job. */
  removePhoto(id: Id): Promise<void>;
}

export function createBodyRepository(db: VigorDb): BodyRepository {
  async function getMetric(id: Id): Promise<BodyMetric | null> {
    const rows = await db.orm.select().from(bodyMetrics).where(eq(bodyMetrics.id, id)).limit(1);
    return firstOrNull(rows);
  }

  async function getMetricByDate(date: LocalDate): Promise<BodyMetric | null> {
    const rows = await db.orm
      .select()
      .from(bodyMetrics)
      .where(eq(bodyMetrics.date, date))
      .orderBy(asc(bodyMetrics.id))
      .limit(1);
    return firstOrNull(rows);
  }

  async function updateMetric(id: Id, patch: Partial<BodyMetricFields>): Promise<BodyMetric> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await getMetric(id);
      return requireRow(current ?? undefined, 'body_metrics', id);
    }
    const [row] = await db.orm
      .update(bodyMetrics)
      .set(fields)
      .where(eq(bodyMetrics.id, id))
      .returning();
    return requireRow(row as BodyMetric | undefined, 'body_metrics', id);
  }

  async function getPhoto(id: Id): Promise<ProgressPhoto | null> {
    const rows = await db.orm
      .select()
      .from(progressPhotos)
      .where(eq(progressPhotos.id, id))
      .limit(1);
    return firstOrNull(rows);
  }

  return {
    async listMetrics(range: { from?: LocalDate; to?: LocalDate } = {}): Promise<BodyMetric[]> {
      const conditions: SQL[] = [];
      if (range.from) conditions.push(gte(bodyMetrics.date, range.from));
      if (range.to) conditions.push(lte(bodyMetrics.date, range.to));
      return db.orm
        .select()
        .from(bodyMetrics)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(bodyMetrics.date), asc(bodyMetrics.id));
    },
    getMetric,
    getMetricByDate,
    async latestMetric(): Promise<BodyMetric | null> {
      const rows = await db.orm
        .select()
        .from(bodyMetrics)
        .orderBy(desc(bodyMetrics.date), desc(bodyMetrics.id))
        .limit(1);
      return firstOrNull(rows);
    },
    async upsertMetric(draft: BodyMetricDraft): Promise<BodyMetric> {
      return db.transaction(async (tx) => {
        const existing = await tx.orm
          .select()
          .from(bodyMetrics)
          .where(eq(bodyMetrics.date, draft.date))
          .limit(1);
        const current = firstOrNull(existing);
        const fields = definedOnly(draft);
        if (current) {
          const [row] = await tx.orm
            .update(bodyMetrics)
            .set(fields)
            .where(eq(bodyMetrics.id, current.id))
            .returning();
          return row as BodyMetric;
        }
        const row: BodyMetric = {
          id: db.newId(),
          weightKg: null,
          waistCm: null,
          measurements: {},
          notes: null,
          ...fields,
          date: draft.date,
        };
        const [inserted] = await tx.orm.insert(bodyMetrics).values(row).returning();
        return inserted as BodyMetric;
      });
    },
    updateMetric,
    async removeMetric(id: Id): Promise<void> {
      await db.orm.delete(bodyMetrics).where(eq(bodyMetrics.id, id));
    },

    async listPhotos(
      filter: { from?: LocalDate; to?: LocalDate; view?: ProgressPhotoView } = {},
    ): Promise<ProgressPhoto[]> {
      const conditions: SQL[] = [];
      if (filter.from) conditions.push(gte(progressPhotos.date, filter.from));
      if (filter.to) conditions.push(lte(progressPhotos.date, filter.to));
      if (filter.view) conditions.push(eq(progressPhotos.view, filter.view));
      return db.orm
        .select()
        .from(progressPhotos)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(progressPhotos.date), asc(progressPhotos.view));
    },
    getPhoto,
    async addPhoto(draft: ProgressPhotoDraft): Promise<ProgressPhoto> {
      const row: ProgressPhoto = {
        id: db.newId(),
        date: draft.date,
        view: draft.view,
        fileRef: draft.fileRef,
        note: draft.note ?? null,
      };
      const [inserted] = await db.orm.insert(progressPhotos).values(row).returning();
      return inserted as ProgressPhoto;
    },
    async updatePhoto(id: Id, patch: Partial<ProgressPhotoFields>): Promise<ProgressPhoto> {
      const fields = definedOnly(patch);
      if (isEmptyPatch(fields)) {
        const current = await getPhoto(id);
        return requireRow(current ?? undefined, 'progress_photos', id);
      }
      const [row] = await db.orm
        .update(progressPhotos)
        .set(fields)
        .where(eq(progressPhotos.id, id))
        .returning();
      return requireRow(row as ProgressPhoto | undefined, 'progress_photos', id);
    },
    async removePhoto(id: Id): Promise<void> {
      await db.orm.delete(progressPhotos).where(eq(progressPhotos.id, id));
    },
  };
}
