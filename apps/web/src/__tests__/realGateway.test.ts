/**
 * The real AI gateway — DESIGN.md §6.4.
 *
 * These drive `realGateway` against a scripted `@vigor/ai` client, so a passing
 * test means the structured output the model returns actually arrives at the
 * Eat screens as the shapes they render: `FoodItemDraft[]`, a `Recipe`, a
 * `DayPlan[]`. Nothing here reaches the network.
 */

import { createFakeAiClient, jsonTurn, refusalTurn } from '@vigor/ai/testing';
import type { InventoryItem, LocalDate, NutritionTargets } from '@vigor/core';
import { describe, expect, it } from 'vitest';

import { isAiUnavailableError } from '../ai/gateway';
import { realGateway } from '../ai/realGateway';

const SETTINGS = { region: 'IN', online: true, today: () => '2026-09-10' as const };

/** What `parseFood`'s structured output looks like coming off the wire. */
const PARSED_FOOD = {
  items: [
    {
      name: 'Roti',
      quantity: 2,
      unit: 'roti',
      kcal: 240,
      proteinG: 8,
      carbsG: 46,
      fatG: 2,
      fiberG: 4,
      confidence: 0.8,
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
      confidence: 0.55,
    },
  ],
  note: 'Home-cooked portions assumed.',
};

const GENERATED_RECIPE = {
  title: 'Rajma with rice',
  ingredients: [{ name: 'Rajma', quantity: 200, unit: 'g', note: null }],
  steps: ['Soak the rajma overnight.', 'Pressure cook with onion and tomato.'],
  timeMinutes: 45,
  servings: 2,
  perServing: { kcal: 520, proteinG: 22, carbsG: 84, fatG: 10, fiberG: 14 },
  tags: ['vegetarian', 'north-indian'],
  usesFromPantry: ['Rajma'],
  why: 'Uses the rajma that needs eating and lands inside your remaining protein.',
};

const GENERATED_PLAN = {
  days: [
    {
      date: '2026-09-10',
      meals: [
        {
          mealSlot: 'breakfast' as const,
          title: 'Poha',
          items: [
            {
              name: 'Poha',
              quantity: 1,
              unit: 'plate',
              kcal: 350,
              proteinG: 8,
              carbsG: 60,
              fatG: 9,
              fiberG: 4,
              confidence: 0.8,
            },
          ],
        },
      ],
      totals: { kcal: 350, proteinG: 8, carbsG: 60, fatG: 9, fiberG: 4 },
    },
  ],
  summary: 'One light day built around what is already in the pantry.',
};

const INVENTORY: InventoryItem[] = [
  {
    id: 'inv-1',
    name: 'Rajma',
    quantity: 500,
    unit: 'g',
    category: 'pantry',
    addedAt: '2026-09-01T08:00:00.000Z',
    useBy: '2026-09-20',
    notes: null,
  },
];

const TARGETS: NutritionTargets = {
  id: 'target-1',
  effectiveFrom: '2026-09-01',
  kcal: 2400,
  proteinG: 150,
  carbsG: 260,
  fatG: 80,
  fiberG: 34,
  source: 'user',
};

describe('realGateway', () => {
  it('maps a fake client’s structured output into FoodItemDraft[]', async () => {
    const fake = createFakeAiClient({ responses: [jsonTurn(PARSED_FOOD)] });
    const gateway = realGateway(fake.client, SETTINGS);

    expect(gateway.isAvailable()).toBe(true);
    const items = await gateway.parseFood({ text: 'two rotis and a bowl of dal', region: 'IN' });

    // The shape the Eat screens write straight into `food_items`, including the
    // `savedMealId` the task fills in and the confidence per item.
    expect(items).toEqual([
      { ...PARSED_FOOD.items[0], savedMealId: null },
      { ...PARSED_FOOD.items[1], savedMealId: null },
    ]);

    // The region hint actually reached the prompt (DESIGN.md §6.4).
    const sent = fake.createRequests[0];
    expect(JSON.stringify(sent.messages)).toContain('Region: IN');
  });

  it('maps a generated recipe into a renderable Recipe', async () => {
    const fake = createFakeAiClient({ responses: [jsonTurn(GENERATED_RECIPE)] });
    const gateway = realGateway(fake.client, SETTINGS);

    const recipe = await gateway.generateRecipe({
      inventory: INVENTORY,
      remaining: { kcal: 900, proteinG: 60, carbsG: 90, fatG: 25, fiberG: 12 },
      constraints: ['vegetarian'],
      preferences: ['likes spice'],
      timeMinutes: 60,
    });

    expect(recipe.title).toBe('Rajma with rice');
    expect(recipe.source).toBe('ai');
    expect(recipe.saved).toBe(false);
    expect(recipe.timesMade).toBe(0);
    expect(recipe.lastMadeAt).toBeNull();
    expect(recipe.perServing).toEqual(GENERATED_RECIPE.perServing);
  });

  it('maps a generated meal plan into DayPlan[]', async () => {
    const fake = createFakeAiClient({ responses: [jsonTurn(GENERATED_PLAN)] });
    const gateway = realGateway(fake.client, SETTINGS);

    const plan = await gateway.generateMealPlan({
      days: 1,
      targets: TARGETS,
      inventory: INVENTORY,
      constraints: ['vegetarian'],
    });

    expect(plan).toHaveLength(1);
    expect(plan[0].date).toBe('2026-09-10');
    expect(plan[0].meals[0].items[0].savedMealId).toBeNull();
    expect(plan[0].meals[0].recipeId).toBeNull();
  });

  it('reads the clock when the plan runs, not when the gateway is built', async () => {
    const fake = createFakeAiClient({ responses: [jsonTurn(GENERATED_PLAN)] });
    // A tab open across midnight: the gateway was built yesterday.
    let today: LocalDate = '2026-09-09';
    const gateway = realGateway(fake.client, { ...SETTINGS, today: () => today });
    today = '2026-09-10';

    await gateway.generateMealPlan({
      days: 1,
      targets: TARGETS,
      inventory: INVENTORY,
      constraints: [],
    });

    expect(JSON.stringify(fake.createRequests[0].messages)).toContain('2026-09-10');
  });

  it('is unavailable with no client and when the device is offline', async () => {
    expect(realGateway(null, SETTINGS).isAvailable()).toBe(false);

    const fake = createFakeAiClient({ responses: [jsonTurn(PARSED_FOOD)] });
    const offline = realGateway(fake.client, { ...SETTINGS, online: false });
    expect(offline.isAvailable()).toBe(false);
    await expect(offline.parseFood({ text: 'dal', region: 'IN' })).rejects.toSatisfy(
      isAiUnavailableError,
    );
    // Nothing was sent while offline.
    expect(fake.createRequests).toHaveLength(0);
  });

  it('turns a refusal into the same unavailable state the screens handle', async () => {
    const fake = createFakeAiClient({ responses: [refusalTurn()] });
    const gateway = realGateway(fake.client, SETTINGS);

    await expect(gateway.parseFood({ text: 'dal', region: 'IN' })).rejects.toSatisfy(
      isAiUnavailableError,
    );
  });
});
