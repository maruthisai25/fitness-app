import type { InventoryItem, WeeklyReviewStats } from '@vigor/core';
import { describe, expect, it } from 'vitest';

import { AiError } from './errors';
import {
  extractMemories,
  generateMealPlan,
  generateRecipe,
  parseFood,
  phraseInsights,
  toRecipeDraft,
  writeWeeklyReview,
} from './tasks';
import { createFakeAiClient, jsonTurn, refusalTurn } from './testing';

const PANTRY: InventoryItem[] = [
  {
    id: 'inv-1',
    name: 'Paneer',
    quantity: 200,
    unit: 'g',
    category: 'dairy',
    addedAt: '2026-09-08T09:00:00.000Z',
    useBy: '2026-09-11',
    notes: null,
  },
  {
    id: 'inv-2',
    name: 'Basmati rice',
    quantity: 1,
    unit: 'kg',
    category: 'grains',
    addedAt: '2026-08-01T09:00:00.000Z',
    useBy: null,
    notes: null,
  },
];

describe('parseFood', () => {
  it('returns FoodItemDraft rows and runs on the fast model at low effort', async () => {
    const fake = createFakeAiClient({
      responses: [
        jsonTurn({
          items: [
            { name: 'Roti', quantity: 2, unit: 'roti', kcal: 240, proteinG: 8, carbsG: 46, fatG: 3, fiberG: 4, confidence: 0.8 },
            { name: 'Rajma', quantity: 1, unit: 'bowl', kcal: 260, proteinG: 14, carbsG: 40, fatG: 5, fiberG: 11, confidence: 0.65 },
          ],
          note: 'Portion sizes assumed home-cooked.',
        }),
      ],
    });

    const result = await parseFood({
      client: fake.client,
      text: 'two rotis and a bowl of rajma',
      region: 'IN',
      mealSlot: 'lunch',
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ name: 'Roti', quantity: 2, unit: 'roti', savedMealId: null });
    expect(result.note).toContain('home-cooked');
    expect(result.refusal).toBeNull();

    const request = fake.createRequests[0];
    expect(request.model).toBe('claude-haiku-4-5');
    expect(request.output_config?.effort).toBe('low');
    expect(request.thinking).toBeUndefined();
    expect(request.output_config?.format).toMatchObject({ type: 'json_schema' });
    expect(String((request.messages[0] as { content: string }).content)).toContain('Region: IN');
  });

  it('returns an empty list and a refusal rather than throwing', async () => {
    const fake = createFakeAiClient({ responses: [refusalTurn()] });
    const result = await parseFood({ client: fake.client, text: 'something' });
    expect(result.items).toEqual([]);
    expect(result.refusal?.message.length).toBeGreaterThan(10);
  });

  it('rejects a reply that is not the schema', async () => {
    const fake = createFakeAiClient({ responses: [jsonTurn({ items: [{ name: 'Roti' }], note: null })] });
    await expect(parseFood({ client: fake.client, text: 'roti' })).rejects.toBeInstanceOf(AiError);
  });

  it('rejects a reply that is not JSON at all', async () => {
    const fake = createFakeAiClient({ responses: [{ text: 'Two rotis, roughly 240 kcal.' }] });
    await expect(parseFood({ client: fake.client, text: 'roti' })).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });
});

describe('generateRecipe', () => {
  it('sends the pantry soonest-use-by first and returns a storable recipe', async () => {
    const fake = createFakeAiClient({
      responses: [
        jsonTurn({
          title: 'Paneer and rice bowl',
          ingredients: [
            { name: 'Paneer', quantity: 200, unit: 'g', note: null },
            { name: 'Basmati rice', quantity: 120, unit: 'g', note: 'Uncooked weight' },
          ],
          steps: ['Cook the rice.', 'Sear the paneer.', 'Combine and season.'],
          timeMinutes: 25,
          servings: 2,
          perServing: { kcal: 520, proteinG: 28, carbsG: 58, fatG: 19, fiberG: 4 },
          tags: ['vegetarian', 'quick'],
          usesFromPantry: ['Paneer', 'Basmati rice'],
          why: 'The paneer needs using by Friday and this fits the protein you still have left.',
        }),
      ],
    });

    const result = await generateRecipe({
      client: fake.client,
      inventory: PANTRY,
      remaining: { kcal: 1100, proteinG: 70, carbsG: 120, fatG: 30, fiberG: 14 },
      constraints: { dietary: ['vegetarian'], excludeIngredients: [], useInventoryFirst: true },
      region: 'IN',
      timeMinutes: 30,
    });

    expect(result.recipe?.title).toBe('Paneer and rice bowl');
    const prompt = String((fake.createRequests[0].messages[0] as { content: string }).content);
    expect(prompt.indexOf('Paneer')).toBeLessThan(prompt.indexOf('Basmati rice'));
    expect(prompt).toContain('use by 2026-09-11');
    expect(fake.createRequests[0].model).toBe('claude-opus-5');
    expect(fake.createRequests[0].output_config?.effort).toBe('medium');

    const draft = toRecipeDraft(result.recipe!);
    expect(draft.source).toBe('ai');
    expect(draft.saved).toBe(false);
    expect(draft.perServing.kcal).toBe(520);
  });
});

describe('generateMealPlan', () => {
  it('returns DayPlan rows ready for the meal_plans repository', async () => {
    const fake = createFakeAiClient({
      responses: [
        jsonTurn({
          days: [
            {
              date: '2026-09-11',
              meals: [
                {
                  mealSlot: 'breakfast',
                  title: 'Poha with peanuts',
                  items: [
                    { name: 'Poha', quantity: 1, unit: 'plate', kcal: 380, proteinG: 9, carbsG: 62, fatG: 11, fiberG: 4, confidence: 0.7 },
                  ],
                },
              ],
              totals: { kcal: 380, proteinG: 9, carbsG: 62, fatG: 11, fiberG: 4 },
            },
          ],
          summary: 'One cooking session on Sunday covers breakfast for the first three days.',
        }),
      ],
    });

    const result = await generateMealPlan({
      client: fake.client,
      startDate: '2026-09-11',
      days: 1,
      targets: { kcal: 2600, proteinG: 150, carbsG: 280, fatG: 72, fiberG: 36 },
      inventory: PANTRY,
    });

    expect(result.plan).toHaveLength(1);
    expect(result.plan[0].date).toBe('2026-09-11');
    expect(result.plan[0].meals[0].items[0].savedMealId).toBeNull();
    expect(result.plan[0].meals[0].recipeId).toBeNull();
    expect(result.summary).toContain('Sunday');
  });
});

describe('writeWeeklyReview', () => {
  const stats: WeeklyReviewStats = {
    weekStart: '2026-09-01',
    weekEnd: '2026-09-07',
    period: { from: '2026-09-01', to: '2026-09-07' },
    training: {
      workoutsCompleted: 3,
      workoutsPlanned: 4,
      completionRate: 0.75,
      totalSets: 52,
      totalVolumeKg: 21400,
      volumeByMuscleGroup: [{ muscle: 'chest', sets: 14, volumeKg: 6200 }],
      personalRecords: [
        { exerciseId: 'ex-1', exerciseName: 'Barbell Bench Press', kind: 'e1rm', value: 82.5, date: '2026-09-04' },
      ],
      missedSessions: 1,
      averageRpe: 8.1,
      averageDurationMin: 47,
    },
    nutrition: {
      daysLogged: 6,
      averageKcal: 2410,
      averageProteinG: 132,
      averageCarbsG: 260,
      averageFatG: 70,
      averageFiberG: 24,
      targetHitRate: { kcal: 0.66, proteinG: 0.33, carbsG: 0.83, fatG: 0.83, fiberG: 0.16 },
      missedTargets: ['proteinG', 'fiberG'],
    },
    topInsights: [],
    rationale: { codes: [], facts: {}, summary: 'Week computed from logged rows.' },
  };

  it('asks the coach model for prose and hands back both fields', async () => {
    const fake = createFakeAiClient({
      responses: [
        jsonTurn({
          summary: 'Three of four sessions done and a new bench estimate at 82.5 kg. Protein averaged 132 g against a 150 g target on six logged days.',
          recommendation: 'Add a protein source to breakfast on the days you train.',
        }),
      ],
    });

    const result = await writeWeeklyReview({ client: fake.client, stats, unitSystem: 'metric' });
    expect(result.prose?.recommendation).toContain('breakfast');
    const prompt = String((fake.createRequests[0].messages[0] as { content: string }).content);
    expect(prompt).toContain('sessions completed 3 of 4');
    expect(prompt).toContain('Barbell Bench Press e1rm 82.5');
  });
});

describe('extractMemories', () => {
  it('proposes durable memories and passes the existing ones in', async () => {
    const fake = createFakeAiClient({
      responses: [
        jsonTurn({
          memories: [
            { kind: 'dislike', domain: 'training', text: 'Dislikes barbell back squats because of a stiff ankle', confidence: 0.9 },
          ],
        }),
      ],
    });

    const result = await extractMemories({
      client: fake.client,
      userText: 'I really do not enjoy back squats, my ankle never lets me sit down properly.',
      existing: ['Trains before work on weekdays'],
    });

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].kind).toBe('dislike');
    expect(fake.createRequests[0].model).toBe('claude-haiku-4-5');
    const prompt = String((fake.createRequests[0].messages[0] as { content: string }).content);
    expect(prompt).toContain('Trains before work on weekdays');
  });

  it('accepts an empty list as a correct answer', async () => {
    const fake = createFakeAiClient({ responses: [jsonTurn({ memories: [] })] });
    const result = await extractMemories({ client: fake.client, userText: 'What should I do today?' });
    expect(result.memories).toEqual([]);
  });
});

describe('phraseInsights', () => {
  it('rewrites detector output and keeps the ids', async () => {
    const fake = createFakeAiClient({
      responses: [
        jsonTurn({
          insights: [
            {
              id: 'insight-1',
              headline: 'Pulling volume trails pushing',
              detail: 'Across four weeks you logged 46 pushing sets and 28 pulling sets.',
            },
          ],
        }),
      ],
    });

    const result = await phraseInsights({
      client: fake.client,
      insights: [
        {
          id: 'insight-1',
          detector: 'PUSH_PULL_BALANCE',
          period: { from: '2026-08-13', to: '2026-09-10' },
          headline: 'push:pull 1.64',
          detail: '46 push sets vs 28 pull sets',
          evidence: [],
          severity: 'notice',
          dismissed: false,
          dismissedAt: null,
          createdAt: '2026-09-10T07:00:00.000Z',
        },
      ],
    });

    expect(result.insights[0].id).toBe('insight-1');
    expect(result.insights[0].headline).toContain('Pulling volume');
  });
});
