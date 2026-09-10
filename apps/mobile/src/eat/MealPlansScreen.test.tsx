/**
 * Meal plan constraints — the "Plan ahead" form's preset, max cook minutes
 * and exclude-ingredient chips, mapped into the request the coach sees and
 * into the `MealPlanConstraints` a plan is stored with.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DayPlan } from '@vigor/core';
import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';
import type { PlatformAdapters } from '@vigor/platform';

import { createFakePlatform, TEST_DATE } from '../../test/fixtures';
import { AiUnavailableError, type AiGateway, type GenerateMealPlanInput } from '../ai/gateway';
import { AppDataProvider } from '../db/AppDataProvider';
import { MealPlansScreen } from './MealPlansScreen';

const DATE = TEST_DATE;

const FAKE_PLAN: DayPlan[] = [
  {
    date: DATE,
    meals: [
      {
        mealSlot: 'lunch',
        title: 'Chicken and rice',
        items: [
          {
            name: 'Chicken breast',
            quantity: 150,
            unit: 'g',
            kcal: 250,
            proteinG: 40,
            carbsG: 0,
            fatG: 8,
            fiberG: 0,
            confidence: 1,
            savedMealId: null,
          },
        ],
        recipeId: null,
        savedMealId: null,
      },
    ],
    totals: { kcal: 250, proteinG: 40, carbsG: 0, fatG: 8, fiberG: 0 },
  },
];

let db: TestDatabase;
let platform: PlatformAdapters;

beforeEach(async () => {
  db = await createTestDatabase();
  platform = createFakePlatform();
  await db.repos.targets.create({
    effectiveFrom: DATE,
    kcal: 2000,
    proteinG: 150,
    carbsG: 220,
    fatG: 70,
    fiberG: 30,
    source: 'user',
  });
});

afterEach(async () => {
  await db.close();
});

function fakeGateway(calls: GenerateMealPlanInput[]): AiGateway {
  return {
    isAvailable: () => true,
    parseFood: () => Promise.reject(new AiUnavailableError()),
    generateRecipe: () => Promise.reject(new AiUnavailableError()),
    async generateMealPlan(input) {
      calls.push(input);
      return FAKE_PLAN;
    },
  };
}

async function renderScreen(gateway: AiGateway): Promise<void> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  await render(
    <QueryClientProvider client={client}>
      <AppDataProvider override={{ repos: db.repos, platform, aiClient: null }}>
        <MealPlansScreen onNavigate={() => undefined} gateway={gateway} />
      </AppDataProvider>
    </QueryClientProvider>,
  );
}

describe('MealPlansScreen constraints form', () => {
  it('maps preset, max cook minutes and exclusions into the request and the stored plan', async () => {
    const calls: GenerateMealPlanInput[] = [];
    await renderScreen(fakeGateway(calls));

    await waitFor(() => expect(screen.getByText('Build a plan')).toBeTruthy());

    // High protein raises the protein target 20% before the plan is built.
    await fireEvent.press(screen.getByText('High protein'));
    await fireEvent.changeText(screen.getByLabelText('Max cook minutes'), '25');
    await fireEvent.changeText(screen.getByLabelText('Exclude an ingredient'), 'Peanuts');
    await fireEvent.press(screen.getByText('Add exclusion'));
    expect(screen.getByText('Peanuts')).toBeTruthy();

    await fireEvent.press(screen.getByText('Build a plan'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      days: 3,
      targets: expect.objectContaining({ kcal: 2000, proteinG: 180 }),
      excludeIngredients: ['Peanuts'],
      maxCookMinutes: 25,
    });

    await waitFor(async () => {
      const plans = await db.repos.mealPlans.list();
      expect(plans).toHaveLength(1);
    });
    const [plan] = await db.repos.mealPlans.list();
    expect(plan.constraints).toMatchObject({
      kcalPerDay: 2000,
      proteinGPerDay: 180,
      excludeIngredients: ['Peanuts'],
      maxCookMinutes: 25,
      useInventoryFirst: true,
    });
  });

  it('stores the dietary constraints the plan was built against', async () => {
    const calls: GenerateMealPlanInput[] = [];
    await renderScreen(fakeGateway(calls));

    await waitFor(() => expect(screen.getByText('Build a plan')).toBeTruthy());
    await fireEvent.press(screen.getByText('Build a plan'));

    await waitFor(async () => {
      expect(await db.repos.mealPlans.list()).toHaveLength(1);
    });
    const [plan] = await db.repos.mealPlans.list();
    expect(plan.constraints.dietary).toEqual(calls[0].constraints);
  });

  it('removing an exclusion chip drops it from the request', async () => {
    const calls: GenerateMealPlanInput[] = [];
    await renderScreen(fakeGateway(calls));

    await waitFor(() => expect(screen.getByText('Build a plan')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Exclude an ingredient'), 'Shellfish');
    await fireEvent.press(screen.getByText('Add exclusion'));
    expect(screen.getByText('Shellfish')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Remove Shellfish from exclusions'));
    expect(screen.queryByText('Shellfish')).toBeNull();

    await fireEvent.press(screen.getByText('Build a plan'));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].excludeIngredients).toEqual([]);
  });

  it('calorie-controlled trims the kcal target by 15%', async () => {
    const calls: GenerateMealPlanInput[] = [];
    await renderScreen(fakeGateway(calls));

    await waitFor(() => expect(screen.getByText('Build a plan')).toBeTruthy());
    await fireEvent.press(screen.getByText('Calorie-controlled'));
    await fireEvent.press(screen.getByText('Build a plan'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].targets.kcal).toBe(1700);
    expect(calls[0].targets.proteinG).toBe(150);
  });

  it('turning the pantry-first switch off reaches the request, and pantry-first pins it back on', async () => {
    const calls: GenerateMealPlanInput[] = [];
    await renderScreen(fakeGateway(calls));

    await waitFor(() => expect(screen.getByText('Build a plan')).toBeTruthy());
    await fireEvent(screen.getByLabelText('Use pantry inventory first'), 'valueChange', false);
    await fireEvent.press(screen.getByText('Build a plan'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].useInventoryFirst).toBe(false);

    // Pantry-first replaces the switch with a note and forces the flag on.
    await fireEvent.press(screen.getByText('Pantry-first'));
    expect(screen.queryByLabelText('Use pantry inventory first')).toBeNull();
    await fireEvent.press(screen.getByText('Build a plan'));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].useInventoryFirst).toBe(true);
  });

  it('balanced plans against the targets unchanged', async () => {
    const calls: GenerateMealPlanInput[] = [];
    await renderScreen(fakeGateway(calls));

    await waitFor(() => expect(screen.getByText('Build a plan')).toBeTruthy());
    await fireEvent.press(screen.getByText('Build a plan'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].targets.kcal).toBe(2000);
    expect(calls[0].targets.proteinG).toBe(150);
    expect(calls[0].maxCookMinutes).toBeNull();
  });
});
