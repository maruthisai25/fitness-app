import type { FoodItemDraft } from '@vigor/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '../testing';

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
});

afterEach(async () => {
  await db.close();
});

function item(name: string, macros: Partial<FoodItemDraft>): FoodItemDraft {
  return {
    name,
    quantity: 1,
    unit: 'serving',
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    confidence: 0.8,
    savedMealId: null,
    ...macros,
  };
}

describe('nutrition.getDay', () => {
  it('sums every item across every log for the day', async () => {
    await db.repos.nutrition.createLog({
      date: '2026-03-10',
      mealSlot: 'breakfast',
      rawText: 'two eggs and a roti',
      source: 'ai',
      items: [
        item('eggs', { quantity: 2, unit: 'egg', kcal: 140, proteinG: 12, fatG: 10 }),
        item('roti', { kcal: 120, proteinG: 3, carbsG: 22, fiberG: 3 }),
      ],
    });
    await db.repos.nutrition.createLog({
      date: '2026-03-10',
      mealSlot: 'lunch',
      rawText: '200g chicken and rice',
      source: 'ai',
      items: [
        item('chicken breast', { quantity: 200, unit: 'g', kcal: 330, proteinG: 62, fatG: 7 }),
        item('rice', { quantity: 150, unit: 'g', kcal: 195, proteinG: 4, carbsG: 42, fiberG: 1 }),
      ],
    });
    // A different day must not leak into the total.
    await db.repos.nutrition.createLog({
      date: '2026-03-11',
      mealSlot: 'dinner',
      rawText: 'paneer',
      items: [item('paneer', { kcal: 400, proteinG: 25 })],
    });

    const day = await db.repos.nutrition.getDay('2026-03-10');

    expect(day.date).toBe('2026-03-10');
    expect(day.mealsLogged).toBe(2);
    expect(day.logs).toHaveLength(2);
    expect(day.logs.flatMap((log) => log.items)).toHaveLength(4);
    expect(day.consumed).toEqual({
      kcal: 785,
      proteinG: 81,
      carbsG: 64,
      fatG: 17,
      fiberG: 4,
    });
  });

  it('reports remaining against the targets in force on that day, signed', async () => {
    await db.repos.targets.create({
      effectiveFrom: '2026-01-01',
      kcal: 2000,
      proteinG: 150,
      carbsG: 200,
      fatG: 60,
      fiberG: 30,
      source: 'computed',
    });
    await db.repos.targets.create({
      effectiveFrom: '2026-03-01',
      kcal: 2400,
      proteinG: 170,
      carbsG: 240,
      fatG: 70,
      fiberG: 34,
      source: 'user',
    });

    await db.repos.nutrition.createLog({
      date: '2026-03-10',
      mealSlot: 'dinner',
      rawText: 'big dinner',
      items: [item('dinner', { kcal: 2500, proteinG: 100, carbsG: 250, fatG: 80, fiberG: 10 })],
    });

    const day = await db.repos.nutrition.getDay('2026-03-10');

    expect(day.targets?.kcal).toBe(2400);
    expect(day.targets?.source).toBe('user');
    // Signed: over target is negative and the UI clamps, not the repository.
    expect(day.remaining).toEqual({
      kcal: -100,
      proteinG: 70,
      carbsG: -10,
      fatG: -10,
      fiberG: 24,
    });
  });

  it('returns an empty day with zero remaining before any targets exist', async () => {
    const day = await db.repos.nutrition.getDay('2026-03-12');

    expect(day.targets).toBeNull();
    expect(day.logs).toEqual([]);
    expect(day.mealsLogged).toBe(0);
    expect(day.consumed).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 });
    expect(day.remaining).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 });
  });

  it('picks up items a queued estimate job fills in later', async () => {
    const log = await db.repos.nutrition.createLog({
      date: '2026-03-13',
      mealSlot: 'snack',
      rawText: 'a handful of almonds',
      source: 'ai',
      estimationStatus: 'pending',
    });
    expect((await db.repos.nutrition.getDay('2026-03-13')).consumed.kcal).toBe(0);

    await db.repos.nutrition.replaceItems(log.id, [
      item('almonds', { quantity: 30, unit: 'g', kcal: 174, proteinG: 6, fatG: 15, fiberG: 4 }),
    ]);
    await db.repos.nutrition.updateLog(log.id, { estimationStatus: 'final' });

    const day = await db.repos.nutrition.getDay('2026-03-13');
    expect(day.consumed.kcal).toBe(174);
    expect(day.logs[0]?.estimationStatus).toBe('final');
    expect(day.logs[0]?.items).toHaveLength(1);
  });
});

describe('nutrition log CRUD', () => {
  it('creates, reads, updates and removes a log with its items', async () => {
    const created = await db.repos.nutrition.createLog({
      date: '2026-03-14',
      mealSlot: 'lunch',
      rawText: 'dal and rice',
      items: [item('dal', { kcal: 180, proteinG: 12 })],
    });
    expect(created.items).toHaveLength(1);
    expect(created.source).toBe('manual');
    expect(created.estimationStatus).toBe('final');

    const read = await db.repos.nutrition.getLog(created.id);
    expect(read).toEqual(created);

    const updated = await db.repos.nutrition.updateLog(created.id, { mealSlot: 'dinner' });
    expect(updated.mealSlot).toBe('dinner');

    const itemId = created.items[0]!.id;
    const patchedItem = await db.repos.nutrition.updateItem(itemId, { kcal: 200 });
    expect(patchedItem.kcal).toBe(200);

    await db.repos.nutrition.removeLog(created.id);
    expect(await db.repos.nutrition.getLog(created.id)).toBeNull();
    expect((await db.repos.nutrition.getDay('2026-03-14')).consumed.kcal).toBe(0);
  });

  it('aggregates a range one day at a time', async () => {
    await db.repos.nutrition.createLog({
      date: '2026-03-16',
      mealSlot: 'breakfast',
      rawText: 'oats',
      items: [item('oats', { kcal: 300, proteinG: 10 })],
    });
    await db.repos.nutrition.createLog({
      date: '2026-03-17',
      mealSlot: 'breakfast',
      rawText: 'eggs',
      items: [item('eggs', { kcal: 200, proteinG: 18 })],
    });

    const days = await db.repos.nutrition.getDays({ from: '2026-03-15', to: '2026-03-18' });
    expect(days.map((day) => day.date)).toEqual(['2026-03-16', '2026-03-17']);
    expect(days.map((day) => day.consumed.kcal)).toEqual([300, 200]);
  });
});
