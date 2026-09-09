/**
 * Food-text parsing — DESIGN.md §6.4.
 *
 * `fastModel`, structured output to a `FoodItemDraft[]` schema with a
 * confidence per item, and a region hint from `profile.foodRegion` so an Indian
 * roti is not measured as a tortilla. Offline, the caller queues an
 * `estimate_food` job instead and the item shows "estimating…" — see `jobs.ts`.
 */

import type { FoodItemDraft, MealSlot, TokenUsage } from '@vigor/core';
import { z } from 'zod';

import type { AiClient } from '../client';
import type { CoachRefusal } from '../errors';
import { runStructuredTask } from './run';

export const foodItemDraftSchema = z.object({
  name: z.string().min(1).max(80).describe('The dish or ingredient, as the person would name it'),
  quantity: z.number().min(0).max(10000),
  unit: z.string().min(1).max(24).describe('The unit they used: g, ml, roti, cup, plate, piece'),
  kcal: z.number().min(0).max(10000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(2000),
  fatG: z.number().min(0).max(1000),
  fiberG: z.number().min(0).max(300),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('1 when the portion is unambiguous, 0.4 or lower when you are largely guessing'),
});

export const parsedFoodSchema = z.object({
  items: z.array(foodItemDraftSchema).min(1).max(20),
  /** One short line the UI can show under the entry while it is unconfirmed. */
  note: z.string().max(200).nullable(),
});

export type ParsedFood = z.infer<typeof parsedFoodSchema>;

const SYSTEM = [
  'You convert a person\'s own description of a meal into structured food items with estimated macros.',
  '',
  'Rules:',
  '- One item per distinct food. Do not split a composite dish into invented sub-ingredients; "rajma chawal"',
  '  is one or two items, not eight.',
  '- Keep their unit. If they said "two rotis", quantity is 2 and unit is "roti" — do not convert to grams.',
  '- Estimate for the region given. Home-cooked portions, not restaurant ones, unless they said otherwise.',
  '- kcal must be consistent with the macros: protein and carbohydrate are 4 kcal per gram, fat is 9.',
  '- Set confidence honestly. Below 0.6 tells the app to ask them to confirm, which is the right outcome for a',
  '  vague portion.',
  '- Never return an empty list. If you truly cannot tell what was eaten, return one item named after what they',
  '  said, with your best guess and a confidence of 0.2.',
  '- Never add a food they did not mention, and never mention a brand they did not name.',
].join('\n');

export interface ParseFoodOptions {
  client: AiClient;
  /** What the person typed or said, verbatim. */
  text: string;
  /** `profile.foodRegion`, e.g. `IN`. Defaults to `generic`. */
  region?: string;
  /** Helps portion sizing — breakfast portions differ from dinner. */
  mealSlot?: MealSlot;
  /** Overrides `settings.fastModel`. */
  model?: string;
  signal?: AbortSignal;
}

export interface ParseFoodResult {
  items: FoodItemDraft[];
  /** A short note for the UI, or null. */
  note: string | null;
  refusal: CoachRefusal | null;
  usage: TokenUsage;
  model: string;
}

/**
 * Estimates the items in one meal description. Returns `items: []` with a
 * populated `refusal` when the model declines — the caller keeps the raw text
 * on the log either way.
 */
export async function parseFood(options: ParseFoodOptions): Promise<ParseFoodResult> {
  const region = options.region?.trim() || 'generic';
  const user = [
    `Region: ${region}`,
    options.mealSlot == null ? null : `Meal: ${options.mealSlot}`,
    '',
    'What they ate:',
    options.text.trim(),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const result = await runStructuredTask({
    client: options.client,
    kind: 'parse',
    schema: parsedFoodSchema,
    system: SYSTEM,
    user,
    ...(options.model == null ? {} : { model: options.model }),
    ...(options.signal == null ? {} : { signal: options.signal }),
  });

  const items: FoodItemDraft[] = (result.data?.items ?? []).map((item) => ({
    ...item,
    savedMealId: null,
  }));

  return {
    items,
    note: result.data?.note ?? null,
    refusal: result.refusal,
    usage: result.usage,
    model: result.model,
  };
}
