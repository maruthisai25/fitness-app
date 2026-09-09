/**
 * Food-log component tests — DESIGN.md §10.
 *
 * All three ways into the log, each end to end against a real in-memory
 * database: coach estimate → confirm → rows written, manual entry, and a saved
 * meal logged in one tap.
 */

import type { FoodItemDraft } from '@vigor/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/provider', async () => {
  const { useDbFromRef } = await import('../test/dbRef');
  return { useDb: useDbFromRef };
});

import { AiUnavailableError, type AiGateway } from '../ai/gateway';
import { AddFood } from '../eat/AddFood';
import { createHarness, renderWithProviders } from '../test/harness';

const DATE = '2026-09-10';

let harness: Awaited<ReturnType<typeof createHarness>>;

beforeEach(async () => {
  harness = await createHarness();
  await harness.db.repos.profile.save({ displayName: 'Test profile', foodRegion: 'IN' });
});

afterEach(async () => {
  await harness.close();
});

function gatewayReturning(items: FoodItemDraft[]): AiGateway {
  return {
    isAvailable: () => true,
    parseFood: () => Promise.resolve(items),
    generateRecipe: () => Promise.reject(new AiUnavailableError('generateRecipe')),
    generateMealPlan: () => Promise.reject(new AiUnavailableError('generateMealPlan')),
  };
}

const PARSED: FoodItemDraft[] = [
  {
    name: 'Roti',
    quantity: 2,
    unit: 'piece',
    kcal: 240,
    proteinG: 8,
    carbsG: 46,
    fatG: 3,
    fiberG: 4,
    confidence: 0.82,
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
    confidence: 0.64,
    savedMealId: null,
  },
];

describe('Eat → Add food', () => {
  it('parses natural language, shows confidence, and writes rows only on confirmation', async () => {
    const user = userEvent.setup();
    const onLogged = vi.fn();
    renderWithProviders(
      <AddFood date={DATE} initialSlot="lunch" onLogged={onLogged} />,
      { gateway: gatewayReturning(PARSED) },
    );

    await user.type(screen.getByPlaceholderText(/two eggs/i), 'two rotis and a bowl of dal');
    await user.click(screen.getByRole('button', { name: /estimate this/i }));

    // The parse is shown for confirmation with its confidence, and nothing is
    // written yet — DESIGN.md §6.4.
    await screen.findByText(/82 % confident/);
    expect(screen.getByText(/64 % confident/)).toBeTruthy();
    expect(await harness.db.repos.nutrition.listLogs({ from: DATE, to: DATE })).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /log these items/i }));

    await waitFor(() => expect(onLogged).toHaveBeenCalled());
    const logs = await harness.db.repos.nutrition.listLogs({ from: DATE, to: DATE });
    expect(logs).toHaveLength(1);
    expect(logs[0].mealSlot).toBe('lunch');
    expect(logs[0].source).toBe('ai');
    expect(logs[0].estimationStatus).toBe('final');
    expect(logs[0].items.map((item) => item.name)).toEqual(['Roti', 'Dal']);
    expect(logs[0].items[1].confidence).toBeCloseTo(0.64, 5);

    const day = await harness.db.repos.nutrition.getDay(DATE);
    expect(day.consumed.kcal).toBe(420);
    expect(day.consumed.proteinG).toBe(20);
  });

  it('falls back to manual entry when the coach is not connected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddFood date={DATE} initialSlot="breakfast" onLogged={vi.fn()} />);

    // The unavailable gateway is the default, so the degraded state is visible
    // and the estimate button is disabled.
    expect(screen.getByText(/coach is not connected/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /estimate this/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await user.click(screen.getByRole('button', { name: /enter it by hand instead/i }));

    await user.type(screen.getByPlaceholderText(/chicken thigh curry/i), 'Boiled eggs');
    await user.clear(screen.getByLabelText(/^quantity$/i));
    await user.type(screen.getByLabelText(/^quantity$/i), '3');
    await user.clear(screen.getByLabelText(/^unit$/i));
    await user.type(screen.getByLabelText(/^unit$/i), 'egg');
    await user.type(screen.getByLabelText(/calories/i), '234');
    await user.type(screen.getByLabelText(/protein/i), '19');
    await user.type(screen.getByLabelText(/carbs/i), '2');
    await user.type(screen.getByLabelText(/^fat/i), '16');

    await user.click(screen.getByRole('button', { name: /log this item/i }));

    await waitFor(async () => {
      const logs = await harness.db.repos.nutrition.listLogs({ from: DATE, to: DATE });
      expect(logs).toHaveLength(1);
    });
    const logs = await harness.db.repos.nutrition.listLogs({ from: DATE, to: DATE });
    expect(logs[0].source).toBe('manual');
    expect(logs[0].items[0]).toMatchObject({
      name: 'Boiled eggs',
      quantity: 3,
      unit: 'egg',
      kcal: 234,
      proteinG: 19,
      confidence: 1,
    });
  });

  it('logs a saved meal in one tap and counts the use', async () => {
    const user = userEvent.setup();
    const saved = await harness.db.repos.savedMeals.create({
      name: 'Post-gym eggs on toast',
      items: [
        {
          name: 'Eggs on toast',
          quantity: 1,
          unit: 'plate',
          kcal: 430,
          proteinG: 26,
          carbsG: 38,
          fatG: 19,
          fiberG: 5,
          confidence: 1,
          savedMealId: null,
        },
      ],
    });
    expect(saved.timesLogged).toBe(0);

    renderWithProviders(
      <AddFood date={DATE} initialSlot="snack" initialMode="saved" onLogged={vi.fn()} />,
    );

    await user.click(await screen.findByRole('button', { name: /log it/i }));

    await waitFor(async () => {
      const logs = await harness.db.repos.nutrition.listLogs({ from: DATE, to: DATE });
      expect(logs).toHaveLength(1);
    });
    const logs = await harness.db.repos.nutrition.listLogs({ from: DATE, to: DATE });
    expect(logs[0].source).toBe('saved_meal');
    expect(logs[0].rawText).toBe('Post-gym eggs on toast');
    expect(logs[0].items[0].savedMealId).toBe(saved.id);

    const after = await harness.db.repos.savedMeals.get(saved.id);
    expect(after?.timesLogged).toBe(1);
    expect(after?.lastLoggedAt).not.toBeNull();
  });
});
