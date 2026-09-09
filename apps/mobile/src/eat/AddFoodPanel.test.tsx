/**
 * Food log component tests — DESIGN.md §10 ("component tests for ... food
 * log").
 *
 * Each one drives the real `AddFoodPanel` against a real migrated in-memory
 * SQLite database from `@vigor/db/testing`, then reads the rows back through
 * the repositories, so a passing test means `food_logs` and `food_items` were
 * actually written.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FoodItemDraft } from '@vigor/core';
import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';

import { AiUnavailableError, type AiGateway } from '../ai/gateway';
import { renderWithProviders } from '../testing/renderWithProviders';
import { AddFoodPanel } from './AddFoodPanel';

const DATE = '2026-09-10';

const PARSED: FoodItemDraft[] = [
  {
    name: 'Roti',
    quantity: 2,
    unit: 'piece',
    kcal: 240,
    proteinG: 8,
    carbsG: 46,
    fatG: 2,
    fiberG: 4,
    confidence: 0.8,
    savedMealId: null,
  },
  {
    name: 'Dal',
    quantity: 1,
    unit: 'bowl',
    kcal: 180,
    proteinG: 12,
    carbsG: 24,
    fatG: 4,
    fiberG: 7,
    confidence: 0.6,
    savedMealId: null,
  },
];

interface ParseCall {
  text: string;
  region: string;
}

function fakeGateway(calls: ParseCall[]): AiGateway {
  return {
    isAvailable: () => true,
    parseFood: async (input) => {
      calls.push(input);
      return PARSED;
    },
    generateRecipe: () => Promise.reject(new AiUnavailableError()),
    generateMealPlan: () => Promise.reject(new AiUnavailableError()),
  };
}

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
});

afterEach(async () => {
  await db.close();
});

describe('AddFoodPanel', () => {
  it('parses a description, waits for confirmation, then writes the rows', async () => {
    const calls: ParseCall[] = [];
    await renderWithProviders(
      <AddFoodPanel repos={db.repos} date={DATE} region="IN" gateway={fakeGateway(calls)} />,
    );

    await fireEvent.changeText(
      screen.getByPlaceholderText('Two rotis, dal, a bowl of curd'),
      'two rotis and dal',
    );
    await fireEvent.press(screen.getByText('Estimate macros'));

    await waitFor(() => expect(screen.getByText('Confirm what gets logged')).toBeTruthy());

    // The region hint comes from the profile and reaches the parser.
    expect(calls).toEqual([{ text: 'two rotis and dal', region: 'IN' }]);

    // Confidence is shown before anything is written…
    expect(screen.getByText(/80% confident/)).toBeTruthy();
    expect(screen.getByText(/60% confident/)).toBeTruthy();
    // …and nothing is written yet.
    expect((await db.repos.nutrition.getDay(DATE)).logs).toHaveLength(0);

    await fireEvent.press(screen.getByText('Log 2 items'));

    await waitFor(async () => {
      const day = await db.repos.nutrition.getDay(DATE);
      expect(day.logs).toHaveLength(1);
    });

    const day = await db.repos.nutrition.getDay(DATE);
    const log = day.logs[0];
    expect(log.source).toBe('ai');
    expect(log.estimationStatus).toBe('final');
    expect(log.mealSlot).toBe('breakfast');
    expect(log.rawText).toBe('two rotis and dal');
    expect(log.items.map((item) => item.name)).toEqual(['Roti', 'Dal']);
    expect(day.consumed.kcal).toBe(420);
    expect(day.consumed.proteinG).toBe(20);
  });

  it('leaves an item out when it is deselected before confirming', async () => {
    await renderWithProviders(
      <AddFoodPanel repos={db.repos} date={DATE} region="IN" gateway={fakeGateway([])} />,
    );

    await fireEvent.changeText(
      screen.getByPlaceholderText('Two rotis, dal, a bowl of curd'),
      'two rotis and dal',
    );
    await fireEvent.press(screen.getByText('Estimate macros'));
    await waitFor(() => expect(screen.getByText('Confirm what gets logged')).toBeTruthy());

    await fireEvent.press(screen.getByText('Dal'));
    await fireEvent.press(screen.getByText('Log 1 items'));

    await waitFor(async () => {
      const day = await db.repos.nutrition.getDay(DATE);
      expect(day.logs).toHaveLength(1);
    });

    const day = await db.repos.nutrition.getDay(DATE);
    expect(day.logs[0].items.map((item) => item.name)).toEqual(['Roti']);
    expect(day.consumed.kcal).toBe(240);
  });

  it('writes a manually entered item with full confidence', async () => {
    await renderWithProviders(
      <AddFoodPanel repos={db.repos} date={DATE} region="generic" gateway={fakeGateway([])} />,
    );

    await fireEvent.press(screen.getByText('Enter by hand'));
    await fireEvent.press(screen.getByText('Lunch'));

    await fireEvent.changeText(screen.getByPlaceholderText('Paneer bhurji'), 'Paneer bhurji');
    await fireEvent.changeText(screen.getByLabelText('Calories'), '320');
    await fireEvent.changeText(screen.getByLabelText('Protein'), '24');
    await fireEvent.changeText(screen.getByLabelText('Fiber'), '3');

    await fireEvent.press(screen.getByText('Add item'));

    await waitFor(async () => {
      const day = await db.repos.nutrition.getDay(DATE);
      expect(day.logs).toHaveLength(1);
    });

    const day = await db.repos.nutrition.getDay(DATE);
    const log = day.logs[0];
    expect(log.source).toBe('manual');
    expect(log.mealSlot).toBe('lunch');
    expect(log.items[0]).toMatchObject({
      name: 'Paneer bhurji',
      kcal: 320,
      proteinG: 24,
      fiberG: 3,
      confidence: 1,
    });
  });

  it('logs a saved meal in one tap and counts the use', async () => {
    const meal = await db.repos.savedMeals.create({
      name: 'Post-gym eggs and toast',
      items: [
        {
          name: 'Eggs',
          quantity: 3,
          unit: 'egg',
          kcal: 210,
          proteinG: 18,
          carbsG: 2,
          fatG: 15,
          fiberG: 0,
          confidence: 1,
          savedMealId: null,
        },
        {
          name: 'Toast',
          quantity: 2,
          unit: 'slice',
          kcal: 160,
          proteinG: 6,
          carbsG: 30,
          fatG: 2,
          fiberG: 4,
          confidence: 1,
          savedMealId: null,
        },
      ],
    });

    await renderWithProviders(
      <AddFoodPanel repos={db.repos} date={DATE} region="generic" gateway={fakeGateway([])} />,
    );

    await fireEvent.press(screen.getByText('Saved meals'));
    await waitFor(() => expect(screen.getByText('Post-gym eggs and toast')).toBeTruthy());

    await fireEvent.press(screen.getByText('Log it'));

    await waitFor(async () => {
      const day = await db.repos.nutrition.getDay(DATE);
      expect(day.logs).toHaveLength(1);
    });

    const day = await db.repos.nutrition.getDay(DATE);
    const log = day.logs[0];
    expect(log.source).toBe('saved_meal');
    expect(log.items).toHaveLength(2);
    expect(log.items.every((item) => item.savedMealId === meal.id)).toBe(true);
    expect(day.consumed.kcal).toBe(370);

    const reloaded = await db.repos.savedMeals.get(meal.id);
    expect(reloaded?.timesLogged).toBe(1);
    expect(reloaded?.lastLoggedAt).not.toBeNull();
  });

  it('queues the description for the coach when the gateway is unavailable', async () => {
    const offline: AiGateway = {
      isAvailable: () => false,
      parseFood: () => Promise.reject(new AiUnavailableError()),
      generateRecipe: () => Promise.reject(new AiUnavailableError()),
      generateMealPlan: () => Promise.reject(new AiUnavailableError()),
    };

    await renderWithProviders(
      <AddFoodPanel repos={db.repos} date={DATE} region="IN" gateway={offline} />,
    );

    expect(screen.queryByText('Estimate macros')).toBeNull();

    await fireEvent.changeText(
      screen.getByPlaceholderText('Two rotis, dal, a bowl of curd'),
      'khichdi and curd',
    );
    await fireEvent.press(screen.getByText('Save it for the coach'));

    await waitFor(async () => {
      const day = await db.repos.nutrition.getDay(DATE);
      expect(day.logs).toHaveLength(1);
    });

    const day = await db.repos.nutrition.getDay(DATE);
    expect(day.logs[0].estimationStatus).toBe('pending');
    expect(day.logs[0].items).toHaveLength(0);

    const jobs = await db.repos.aiJobs.list({ kind: 'estimate_food' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('queued');
    expect(jobs[0].payload).toMatchObject({ text: 'khichdi and curd', region: 'IN' });
  });
});
