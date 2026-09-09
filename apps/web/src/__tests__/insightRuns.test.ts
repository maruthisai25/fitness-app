/**
 * Foreground insight runs — DESIGN.md §5.8, against a real in-memory database.
 *
 * An insight's identity is its detector plus the subject its evidence is about.
 * That is what these tests pin down:
 *
 *  - one detector firing about several subjects in one run writes one row each,
 *    not one row for the whole detector;
 *  - running the detectors again keeps exactly those rows, updated in place;
 *  - a dismissed insight stays dismissed instead of coming back;
 *  - two overlapping calls to the runner write the batch once.
 */

import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DISMISSAL_QUIET_DAYS,
  identityOf,
  runDetectorsOnce,
  dismissInsight,
  subjectOf,
} from '../progress/foreground';

/** A Monday. The test clock starts on this day, so `createdAt` lands on it too. */
const TODAY = '2026-01-05';

let db: TestDatabase;

/** Seven straight days of one under-eaten meal, against real targets. */
async function seedNutrition(): Promise<void> {
  await db.repos.targets.create({
    effectiveFrom: '2025-12-01',
    kcal: 2200,
    proteinG: 150,
    carbsG: 250,
    fatG: 60,
    fiberG: 30,
  });
  const dates = [
    '2025-12-30',
    '2025-12-31',
    '2026-01-01',
    '2026-01-02',
    '2026-01-03',
    '2026-01-04',
    '2026-01-05',
  ];
  for (const date of dates) {
    await db.repos.nutrition.createLog({
      date,
      mealSlot: 'lunch',
      rawText: 'a bowl of dal',
      source: 'manual',
      estimationStatus: 'final',
      items: [
        {
          name: 'Dal',
          quantity: 1,
          unit: 'bowl',
          kcal: 300,
          proteinG: 20,
          carbsG: 40,
          fatG: 8,
          fiberG: 6,
          confidence: 1,
          savedMealId: null,
        },
      ],
    });
  }
}

beforeEach(async () => {
  window.localStorage.clear();
  db = await createTestDatabase({ start: `${TODAY}T08:00:00.000Z` });
  await seedNutrition();
});

afterEach(async () => {
  window.localStorage.clear();
  await db.close();
});

describe('runDetectorsOnce', () => {
  it('writes one row per subject, and rerunning updates them in place', async () => {
    const first = await runDetectorsOnce(db.repos, TODAY);

    // MISSED_TARGET_STREAK fires for every macro missed 5 of 7 days. Those are
    // five findings from one detector over one period: five rows, not one.
    const missed = first.filter((draft) => draft.detector === 'MISSED_TARGET_STREAK');
    expect(missed.length).toBeGreaterThan(1);
    expect(new Set(missed.map((draft) => draft.period.from)).size).toBe(1);

    const afterFirst = await db.repos.insights.list({ includeDismissed: true });
    expect(afterFirst).toHaveLength(first.length);
    // Every row carries its own identity, and no identity is written twice.
    const identities = afterFirst.map((row) => identityOf(row.detector, subjectOf(row) ?? ''));
    expect(new Set(identities).size).toBe(afterFirst.length);
    expect(afterFirst.some((row) => row.detector === 'FREQUENT_FOODS')).toBe(true);

    // A second run finds the same subjects: nothing new, nothing duplicated.
    const second = await runDetectorsOnce(db.repos, TODAY, { force: true });
    expect(second).toHaveLength(0);

    const afterSecond = await db.repos.insights.list({ includeDismissed: true });
    expect(afterSecond).toHaveLength(afterFirst.length);
    expect(afterSecond.map((row) => row.id).sort()).toEqual(afterFirst.map((row) => row.id).sort());
  });

  it('leaves a dismissed insight dismissed instead of writing it again', async () => {
    await runDetectorsOnce(db.repos, TODAY);
    const open = await db.repos.insights.listOpen();
    const target = open.find((row) => row.detector === 'MISSED_TARGET_STREAK');
    expect(target).toBeDefined();
    if (!target) return;

    const identity = identityOf(target.detector, subjectOf(target) ?? '');
    await dismissInsight(db.repos, target, TODAY);

    await runDetectorsOnce(db.repos, TODAY, { force: true });

    const rows = await db.repos.insights.list({ includeDismissed: true });
    const sameIdentity = rows.filter(
      (row) => identityOf(row.detector, subjectOf(row) ?? '') === identity,
    );
    expect(sameIdentity).toHaveLength(1);
    expect(sameIdentity[0].id).toBe(target.id);
    expect(sameIdentity[0].dismissed).toBe(true);
    expect((await db.repos.insights.listOpen()).some((row) => row.id === target.id)).toBe(false);
  });

  it('lets a long-dismissed insight come back once the quiet period is over', async () => {
    await runDetectorsOnce(db.repos, TODAY);
    const target = (await db.repos.insights.listOpen()).find(
      (row) => row.detector === 'MISSED_TARGET_STREAK',
    );
    expect(target).toBeDefined();
    if (!target) return;

    const identity = identityOf(target.detector, subjectOf(target) ?? '');
    // Dismissed well over four weeks ago.
    await dismissInsight(db.repos, target, '2025-11-01');
    expect(DISMISSAL_QUIET_DAYS).toBe(28);

    await runDetectorsOnce(db.repos, TODAY, { force: true });

    const sameIdentity = (await db.repos.insights.list({ includeDismissed: true })).filter(
      (row) => identityOf(row.detector, subjectOf(row) ?? '') === identity,
    );
    expect(sameIdentity).toHaveLength(2);
    expect(sameIdentity.filter((row) => !row.dismissed)).toHaveLength(1);
  });

  it('writes once when two callers race the once-a-day check', async () => {
    const [a, b] = await Promise.all([
      runDetectorsOnce(db.repos, TODAY),
      runDetectorsOnce(db.repos, TODAY),
    ]);

    // Both callers get the one run's answer, and only that run wrote rows.
    expect(b).toEqual(a);
    const rows = await db.repos.insights.list({ includeDismissed: true });
    expect(rows).toHaveLength(a.length);
    expect(rows.length).toBeGreaterThan(0);

    const identities = rows.map((row) => identityOf(row.detector, subjectOf(row) ?? ''));
    expect(new Set(identities).size).toBe(rows.length);
  });
});
