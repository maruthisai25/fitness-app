/**
 * The once-a-day insight run and the weekly review — DESIGN.md §5.8, §5.9, §8.
 *
 * Both run against a real migrated database so the dedupe rules and the
 * idempotent `ai_jobs` id are exercised for real, not mocked.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addDays, type FoodItemDraft, type LocalDate } from '@vigor/core';
import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';

import {
  ensureWeeklyReview,
  resetDetectorGuard,
  runDailyInsights,
  weeklyReviewJobId,
} from './foreground';

const TODAY: LocalDate = '2026-09-10';

const SHORTFALL: FoodItemDraft = {
  name: 'Instant noodles',
  quantity: 1,
  unit: 'pack',
  kcal: 1000,
  proteinG: 40,
  carbsG: 120,
  fatG: 30,
  fiberG: 3,
  confidence: 1,
  savedMealId: null,
};

let db: TestDatabase;

beforeEach(async () => {
  resetDetectorGuard();
  db = await createTestDatabase();
});

afterEach(async () => {
  await db.close();
});

async function seedShortWeeks(days: number): Promise<void> {
  await db.repos.targets.create({
    effectiveFrom: '2026-08-01',
    kcal: 2400,
    proteinG: 150,
    carbsG: 250,
    fatG: 70,
    fiberG: 34,
  });
  for (let index = 0; index < days; index += 1) {
    await db.repos.nutrition.createLog({
      date: addDays(TODAY, -index),
      mealSlot: 'dinner',
      rawText: 'noodles',
      source: 'manual',
      items: [SHORTFALL],
    });
  }
}

describe('runDailyInsights', () => {
  it('writes detector output once and then dedupes it', async () => {
    await seedShortWeeks(7);

    const first = await runDailyInsights(db.repos, TODAY);
    expect(first.ran).toBe(true);
    expect(first.created).toBeGreaterThan(0);

    const stored = await db.repos.insights.list({ includeDismissed: true });
    expect(stored.length).toBe(first.created);
    expect(stored.some((insight) => insight.detector === 'MISSED_TARGET_STREAK')).toBe(true);

    // Same session, same day: the guard stops it.
    const second = await runDailyInsights(db.repos, TODAY);
    expect(second.ran).toBe(false);

    // A cold start loses the in-session guard. The detectors may run again,
    // but every draft matches a stored row, so nothing new is written.
    resetDetectorGuard();
    const third = await runDailyInsights(db.repos, TODAY);
    expect(third.created).toBe(0);
    expect(third.duplicates).toBe(first.created);
    expect(await db.repos.insights.list({ includeDismissed: true })).toHaveLength(first.created);
  });

  it('reports honestly when there is nothing to say', async () => {
    const outcome = await runDailyInsights(db.repos, TODAY);
    expect(outcome.ran).toBe(true);
    expect(outcome.created).toBe(0);
    expect(outcome.reason).toContain('detectors ran');
  });
});

describe('ensureWeeklyReview', () => {
  it('builds the week that just ended and queues the coach summary', async () => {
    await seedShortWeeks(10);

    const outcome = await ensureWeeklyReview(db.repos, TODAY, 1);

    // 10 Sep 2026 is a Thursday, so the completed week began Monday 31 Aug.
    expect(outcome.weekStart).toBe('2026-08-31');
    expect(outcome.queuedSummary).toBe(true);

    const review = await db.repos.reviews.getByWeek('2026-08-31');
    expect(review).not.toBeNull();
    expect(review?.summary).toBeNull();
    expect(review?.nutrition.daysLogged).toBeGreaterThan(0);

    const jobs = await db.repos.aiJobs.list({ kind: 'weekly_review' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(weeklyReviewJobId('2026-08-31'));
    expect(jobs[0].resultRef).toBe(review?.id);
  });

  it('does nothing on a second run', async () => {
    await seedShortWeeks(10);
    await ensureWeeklyReview(db.repos, TODAY, 1);

    const second = await ensureWeeklyReview(db.repos, TODAY, 1);
    expect(second.weekStart).toBeNull();
    expect(second.queuedSummary).toBe(false);
    expect(await db.repos.aiJobs.list({ kind: 'weekly_review' })).toHaveLength(1);
  });
});
