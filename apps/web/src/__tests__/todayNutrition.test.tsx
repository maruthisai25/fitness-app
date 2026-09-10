/**
 * Today shows the nutrition ring — DESIGN.md §7.1: "nutrition ring with
 * remaining macros".
 *
 * The whole Today section renders against a real in-memory database, so a
 * passing test means the card the Eat module exports is actually placed on
 * Today and is counting down from the same `buildDayNutrition` output the Eat
 * tab uses (DESIGN.md §5.6).
 */

import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as LocalDateModule from '../lib/localDate';

// Today is pinned so the assertions below are about the numbers, not the date
// the suite happens to run on.
vi.mock('../lib/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof LocalDateModule>();
  return { ...actual, todayLocalDate: () => '2026-09-10' };
});

import { createHarness, renderWithProviders } from '../testing/harness';
import { TodaySection } from '../today/TodaySection';

const DATE = '2026-09-10';

let harness: Awaited<ReturnType<typeof createHarness>>;

beforeEach(async () => {
  harness = await createHarness();
  await harness.db.repos.profile.save({ displayName: 'Test profile', foodRegion: 'IN' });
});

afterEach(async () => {
  await harness.close();
});

describe('Today — nutrition card', () => {
  it('renders the remaining calories and protein against the day’s targets', async () => {
    const repos = harness.db.repos;
    await repos.targets.create({
      effectiveFrom: '2026-09-01',
      kcal: 2400,
      proteinG: 150,
      carbsG: 260,
      fatG: 80,
      fiberG: 34,
      source: 'user',
    });
    await repos.nutrition.createLog({
      date: DATE,
      mealSlot: 'lunch',
      rawText: 'two rotis and a bowl of dal',
      source: 'manual',
      estimationStatus: 'final',
      items: [
        {
          name: 'Roti',
          quantity: 2,
          unit: 'roti',
          kcal: 400,
          proteinG: 20,
          carbsG: 60,
          fatG: 8,
          fiberG: 6,
          confidence: 1,
          savedMealId: null,
        },
      ],
    });

    renderWithProviders(harness, <TodaySection />);

    // 2400 − 400 kcal and 150 − 20 g protein, straight from `buildDayNutrition`.
    const calories = await screen.findByLabelText('Calories: 2000 kcal left of 2400');
    expect(calories).toBeDefined();
    await waitFor(() => {
      expect(screen.getByLabelText('Protein: 130 g left of 150')).toBeDefined();
    });

    // And the card is a way into Eat, not a dead end.
    expect(screen.getByLabelText('Open the Eat tab')).toBeDefined();
    // "Quick log" (DESIGN.md §7.1) means the add-food form for today, in one
    // navigation — not the day list with the form another tap away.
    expect(screen.getByRole('link', { name: /log food/i }).getAttribute('href')).toBe(
      `/eat/add?date=${DATE}`,
    );
  });

  it('says what to do instead when there are no targets yet', async () => {
    renderWithProviders(harness, <TodaySection />);

    expect(await screen.findByText(/No targets set yet/)).toBeDefined();
    expect(screen.getByText(/Eat → Targets/)).toBeDefined();
  });
});
