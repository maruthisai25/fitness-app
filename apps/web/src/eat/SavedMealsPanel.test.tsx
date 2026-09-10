/**
 * Saved meals tab component tests — DESIGN.md §7.1 "saved meals"; mirrors
 * `apps/mobile/src/eat/SavedMealsScreen.tsx`'s one-tap log, rename and
 * delete-with-confirmation.
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHarness, renderWithProviders, TEST_DATE, type Harness } from '../testing/harness';
import { SavedMealsPanel } from './SavedMealsPanel';

let harness: Harness;

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await harness.db.close();
});

describe('SavedMealsPanel', () => {
  it('logs a saved meal into the chosen slot for today with one tap', async () => {
    const meal = await harness.repos.savedMeals.create({
      name: 'Chicken and rice',
      items: [
        {
          name: 'Chicken breast',
          quantity: 200,
          unit: 'g',
          kcal: 330,
          proteinG: 62,
          carbsG: 0,
          fatG: 7,
          fiberG: 0,
          confidence: 1,
          savedMealId: null,
        },
      ],
    });

    renderWithProviders(harness, <SavedMealsPanel today={TEST_DATE} />);
    await screen.findByText('Chicken and rice');

    // Default slot is lunch; pick it explicitly then log.
    fireEvent.click(screen.getByRole('button', { name: 'Lunch' }));
    fireEvent.click(screen.getByRole('button', { name: /Log to lunch/i }));

    await waitFor(async () => {
      const logs = await harness.repos.nutrition.listLogs({ from: TEST_DATE, to: TEST_DATE });
      expect(logs).toHaveLength(1);
    });

    const [log] = await harness.repos.nutrition.listLogs({ from: TEST_DATE, to: TEST_DATE });
    expect(log.mealSlot).toBe('lunch');
    expect(log.source).toBe('saved_meal');

    const updated = await harness.repos.savedMeals.get(meal.id);
    expect(updated?.timesLogged).toBe(1);
    expect(updated?.lastLoggedAt).not.toBeNull();

    await screen.findByText(/Logged Chicken and rice to lunch\./);
  });

  it('renames and deletes a saved meal, with a confirmation step before delete', async () => {
    await harness.repos.savedMeals.create({
      name: 'Oats bowl',
      items: [
        {
          name: 'Oats',
          quantity: 50,
          unit: 'g',
          kcal: 190,
          proteinG: 7,
          carbsG: 33,
          fatG: 3,
          fiberG: 5,
          confidence: 1,
          savedMealId: null,
        },
      ],
    });

    renderWithProviders(harness, <SavedMealsPanel today={TEST_DATE} />);
    await screen.findByText('Oats bowl');

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Rename "Oats bowl"'), {
      target: { value: 'Morning oats' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Morning oats');
    const renamed = await harness.repos.savedMeals.list();
    expect(renamed[0]?.name).toBe('Morning oats');

    // Delete asks for confirmation before it writes anything.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await harness.repos.savedMeals.list()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

    await waitFor(async () => {
      expect(await harness.repos.savedMeals.list()).toHaveLength(0);
    });
  });
});
