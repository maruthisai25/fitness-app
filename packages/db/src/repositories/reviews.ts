import type {
  Id,
  LocalDate,
  NutritionWeekStats,
  TrainingWeekStats,
  WeeklyReview,
} from '@vigor/core';
import { and, desc, eq, gte, lte } from 'drizzle-orm';

import type { VigorDb } from '../client';
import { weeklyReviews } from '../schema';
import { definedOnly, firstOrNull, isEmptyPatch, requireRow } from './support';

export type WeeklyReviewFields = Omit<WeeklyReview, 'id'>;

/**
 * DESIGN.md §5.9 — the deterministic stats are stored first; the coach summary
 * arrives later through an `ai_job` and fills `summary`/`recommendation`.
 */
export type WeeklyReviewDraft = {
  weekStart: LocalDate;
  training: TrainingWeekStats;
  nutrition: NutritionWeekStats;
  summary?: string | null;
  recommendation?: string | null;
};

export interface ReviewRepository {
  /** Newest week first. */
  list(options?: { limit?: number }): Promise<WeeklyReview[]>;
  get(id: Id): Promise<WeeklyReview | null>;
  getByWeek(weekStart: LocalDate): Promise<WeeklyReview | null>;
  listRange(range: { from: LocalDate; to: LocalDate }): Promise<WeeklyReview[]>;
  /** One review per week: re-running the builder refreshes the stats in place. */
  upsert(draft: WeeklyReviewDraft): Promise<WeeklyReview>;
  update(id: Id, patch: Partial<WeeklyReviewFields>): Promise<WeeklyReview>;
  /** What the `weekly_review` AI job writes back. */
  setSummary(id: Id, prose: { summary: string; recommendation: string }): Promise<WeeklyReview>;
  remove(id: Id): Promise<void>;
}

export function createReviewRepository(db: VigorDb): ReviewRepository {
  async function get(id: Id): Promise<WeeklyReview | null> {
    const rows = await db.orm.select().from(weeklyReviews).where(eq(weeklyReviews.id, id)).limit(1);
    return firstOrNull(rows);
  }

  async function update(id: Id, patch: Partial<WeeklyReviewFields>): Promise<WeeklyReview> {
    const fields = definedOnly(patch);
    if (isEmptyPatch(fields)) {
      const current = await get(id);
      return requireRow(current ?? undefined, 'weekly_reviews', id);
    }
    const [row] = await db.orm
      .update(weeklyReviews)
      .set(fields)
      .where(eq(weeklyReviews.id, id))
      .returning();
    return requireRow(row as WeeklyReview | undefined, 'weekly_reviews', id);
  }

  return {
    async list(options: { limit?: number } = {}): Promise<WeeklyReview[]> {
      const query = db.orm.select().from(weeklyReviews).orderBy(desc(weeklyReviews.weekStart));
      return options.limit !== undefined ? query.limit(options.limit) : query;
    },
    get,
    async getByWeek(weekStart: LocalDate): Promise<WeeklyReview | null> {
      const rows = await db.orm
        .select()
        .from(weeklyReviews)
        .where(eq(weeklyReviews.weekStart, weekStart))
        .limit(1);
      return firstOrNull(rows);
    },
    async listRange(range: { from: LocalDate; to: LocalDate }): Promise<WeeklyReview[]> {
      return db.orm
        .select()
        .from(weeklyReviews)
        .where(
          and(gte(weeklyReviews.weekStart, range.from), lte(weeklyReviews.weekStart, range.to)),
        )
        .orderBy(desc(weeklyReviews.weekStart));
    },
    async upsert(draft: WeeklyReviewDraft): Promise<WeeklyReview> {
      return db.transaction(async (tx) => {
        const existing = await tx.orm
          .select()
          .from(weeklyReviews)
          .where(eq(weeklyReviews.weekStart, draft.weekStart))
          .limit(1);
        const current = firstOrNull(existing);
        const generatedAt = db.now();
        if (current) {
          const [row] = await tx.orm
            .update(weeklyReviews)
            .set({
              training: draft.training,
              nutrition: draft.nutrition,
              summary: draft.summary ?? current.summary,
              recommendation: draft.recommendation ?? current.recommendation,
              generatedAt,
            })
            .where(eq(weeklyReviews.id, current.id))
            .returning();
          return row as WeeklyReview;
        }
        const row: WeeklyReview = {
          id: db.newId(),
          weekStart: draft.weekStart,
          training: draft.training,
          nutrition: draft.nutrition,
          summary: draft.summary ?? null,
          recommendation: draft.recommendation ?? null,
          generatedAt,
        };
        const [inserted] = await tx.orm.insert(weeklyReviews).values(row).returning();
        return inserted as WeeklyReview;
      });
    },
    update,
    setSummary: (id, prose) =>
      update(id, { summary: prose.summary, recommendation: prose.recommendation }),
    async remove(id: Id): Promise<void> {
      await db.orm.delete(weeklyReviews).where(eq(weeklyReviews.id, id));
    },
  };
}
