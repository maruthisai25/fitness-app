/**
 * Meal plan constraints form — DESIGN.md §6.4: the form fills a
 * `MealPlanConstraints` instead of the hardcoded values, and a preset adjusts
 * the targets sent to `generateMealPlan`.
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AiGateway, GenerateMealPlanInput } from '../ai/gateway';
import { createHarness, renderWithProviders, TEST_DATE, type Harness } from '../testing/harness';
import { MealPlansPanel } from './MealPlansPanel';

let harness: Harness;

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await harness.db.close();
});

function fakeGateway(): { gateway: AiGateway; calls: GenerateMealPlanInput[] } {
  const calls: GenerateMealPlanInput[] = [];
  const gateway: AiGateway = {
    isAvailable: () => true,
    parseFood: () => Promise.reject(new Error('not used')),
    generateRecipe: () => Promise.reject(new Error('not used')),
    generateMealPlan: (input) => {
      calls.push(input);
      return Promise.resolve([
        {
          date: TEST_DATE,
          meals: [],
          totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
        },
      ]);
    },
  };
  return { gateway, calls };
}

describe('MealPlansPanel constraints form', () => {
  it('maps the preset, cook time and exclusions onto the generateMealPlan request and the saved plan', async () => {
    await harness.repos.targets.create({
      effectiveFrom: TEST_DATE,
      kcal: 2000,
      proteinG: 150,
      carbsG: 220,
      fatG: 60,
      fiberG: 30,
    });
    const { gateway, calls } = fakeGateway();

    renderWithProviders(harness, <MealPlansPanel today={TEST_DATE} />, { gateway });
    await screen.findByRole('button', { name: 'Build a plan' });

    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'high_protein' } });
    fireEvent.change(screen.getByLabelText('Max cook minutes'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Ingredient to exclude'), {
      target: { value: 'peanuts' },
    });
    // Enter adds the chip, the same as the button next to it.
    fireEvent.keyDown(screen.getByLabelText('Ingredient to exclude'), { key: 'Enter' });
    expect(screen.getByText('peanuts')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Build a plan' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    const [request] = calls;
    // High protein: +20%, kcal untouched.
    expect(request.targets.proteinG).toBeCloseTo(180);
    expect(request.targets.kcal).toBe(2000);
    expect(request.maxCookMinutes).toBe(20);
    expect(request.excludeIngredients).toEqual(['peanuts']);
    expect(request.useInventoryFirst).toBe(true);

    await waitFor(async () => {
      expect(await harness.repos.mealPlans.list()).toHaveLength(1);
    });
    const [saved] = await harness.repos.mealPlans.list();
    expect(saved.constraints.proteinGPerDay).toBeCloseTo(180);
    expect(saved.constraints.kcalPerDay).toBe(2000);
    expect(saved.constraints.maxCookMinutes).toBe(20);
    expect(saved.constraints.excludeIngredients).toEqual(['peanuts']);
    expect(saved.constraints.useInventoryFirst).toBe(true);
  });

  it('calorie-controlled cuts the kcal target by 15%, protein untouched', async () => {
    await harness.repos.targets.create({
      effectiveFrom: TEST_DATE,
      kcal: 2000,
      proteinG: 150,
      carbsG: 220,
      fatG: 60,
      fiberG: 30,
    });
    const { gateway, calls } = fakeGateway();

    renderWithProviders(harness, <MealPlansPanel today={TEST_DATE} />, { gateway });
    await screen.findByRole('button', { name: 'Build a plan' });

    fireEvent.change(screen.getByLabelText('Preset'), {
      target: { value: 'calorie_controlled' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build a plan' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    const [request] = calls;
    expect(request.targets.kcal).toBeCloseTo(1700);
    expect(request.targets.proteinG).toBe(150);
  });

  it('pantry-first pins the inventory-first flag on and disables the toggle', async () => {
    await harness.repos.targets.create({
      effectiveFrom: TEST_DATE,
      kcal: 2000,
      proteinG: 150,
      carbsG: 220,
      fatG: 60,
      fiberG: 30,
    });
    const { gateway, calls } = fakeGateway();

    renderWithProviders(harness, <MealPlansPanel today={TEST_DATE} />, { gateway });
    await screen.findByRole('button', { name: 'Build a plan' });

    // Off by hand first, so pinning it back on is provably the preset's doing.
    fireEvent.click(screen.getByLabelText('Use pantry inventory first'));
    const toggle = screen.getByLabelText('Use pantry inventory first') as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'pantry_first' } });
    expect(toggle.checked).toBe(true);
    expect(toggle.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Build a plan' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.useInventoryFirst).toBe(true);
  });
});
