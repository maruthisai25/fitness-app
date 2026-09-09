/**
 * The nutrition card Today shows — DESIGN.md §7.1: "nutrition ring with
 * remaining macros".
 *
 * Driven against a real migrated in-memory database through the same
 * `AppDataProvider` the app uses, so a passing test means the remaining numbers
 * came out of `buildDayNutrition` (DESIGN.md §5.6) rather than out of the
 * component.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';
import type { PlatformAdapters } from '@vigor/platform';

import { createFakePlatform, TEST_DATE } from '../../test/fixtures';
import { AppDataProvider } from '../db/AppDataProvider';
import { TodayNutritionCard } from './TodayNutritionCard';

const DATE = TEST_DATE;

let db: TestDatabase;
let platform: PlatformAdapters;

beforeEach(async () => {
  db = await createTestDatabase();
  platform = createFakePlatform();
});

afterEach(async () => {
  await db.close();
});

async function renderCard(onOpenEat: () => void): Promise<void> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  await render(
    <QueryClientProvider client={client}>
      <AppDataProvider override={{ repos: db.repos, platform, aiClient: null }}>
        <TodayNutritionCard date={DATE} onOpenEat={onOpenEat} />
      </AppDataProvider>
    </QueryClientProvider>,
  );
}

describe('TodayNutritionCard', () => {
  it('shows what is left of the day’s targets', async () => {
    await db.repos.targets.create({
      effectiveFrom: '2026-09-01',
      kcal: 2400,
      proteinG: 150,
      carbsG: 260,
      fatG: 80,
      fiberG: 34,
      source: 'user',
    });
    await db.repos.nutrition.createLog({
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

    const onOpenEat = vi.fn();
    await renderCard(onOpenEat);

    // 2400 − 400 kcal and 150 − 20 g protein.
    expect(await screen.findByText('2000')).toBeTruthy();
    expect(screen.getByText('of 2400 kcal')).toBeTruthy();
    expect(screen.getByText('130')).toBeTruthy();
    expect(screen.getByText('of 150 g')).toBeTruthy();
    expect(screen.getByText('1 meal logged · 28 g fiber still to go')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Open the Eat tab'));
    expect(onOpenEat).toHaveBeenCalledTimes(1);
  });

  it('asks for targets rather than counting down from nothing', async () => {
    await renderCard(vi.fn());

    expect(await screen.findByText(/Set targets in Eat/)).toBeTruthy();
  });
});
