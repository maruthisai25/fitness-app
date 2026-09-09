/**
 * Saved meals — the exact repeats DESIGN.md §1 promises instead of an external
 * food database. Logging one is a single tap and bumps `timesLogged`, which is
 * also the order this list is in.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { queryKeys, type MealSlot } from '@vigor/core';

import { useInvalidator } from '../data/queries';
import { usePlatform, useRepos } from '../db/AppDataProvider';
import { ErrorBanner, LoadingScreen, Screen, ScreenBlurb, ScreenTitle } from '../ui/components';
import {
  ActionRow,
  Caption,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  EmptyState,
  InlineAction,
  ItemRow,
  Note,
  ErrorScreen,
} from '../ui/primitives';
import { MEAL_SLOT_LABEL, MEAL_SLOTS, itemQuantityLabel, macroBreakdown } from './model';

export function SavedMealsScreen() {
  const repos = useRepos();
  const { clock } = usePlatform();
  const invalidate = useInvalidator();

  const [slot, setSlot] = useState<MealSlot>('lunch');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const meals = useQuery({
    queryKey: queryKeys.savedMeals(),
    queryFn: () => repos.savedMeals.list(),
  });

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (meals.isPending) return <LoadingScreen label="Loading saved meals…" />;
  if (meals.error)
    return <ErrorScreen message={`Could not load saved meals: ${meals.error.message}`} />;

  const rows = meals.data ?? [];

  return (
    <Screen>
      <ScreenTitle>Saved meals</ScreenTitle>
      <ScreenBlurb>
        The things you eat again and again, with the macros you already agreed to. Most-logged
        first.
      </ScreenBlurb>

      {error ? <ErrorBanner message={error} /> : null}
      {status ? <Note tone="good">{status}</Note> : null}

      <Caption>Log into</Caption>
      <ChipRow>
        {MEAL_SLOTS.map((option) => (
          <Chip
            key={option}
            label={MEAL_SLOT_LABEL[option]}
            selected={slot === option}
            onPress={() => setSlot(option)}
          />
        ))}
      </ChipRow>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          detail="On the day log, tap “Save as meal” under anything you have logged. It shows up here for one-tap repeats."
        />
      ) : (
        rows.map((meal) => (
          <Card key={meal.id}>
            <CardTitle>{meal.name}</CardTitle>
            <Caption>{`${Math.round(meal.kcal)} kcal · ${macroBreakdown(meal)} · logged ${
              meal.timesLogged
            }×${meal.lastLoggedAt ? ` · last ${meal.lastLoggedAt.slice(0, 10)}` : ''}`}</Caption>

            {openId === meal.id ? (
              <View>
                {meal.items.map((item, index) => (
                  <ItemRow
                    key={`${item.name}-${index}`}
                    title={item.name}
                    subtitle={`${itemQuantityLabel(item)} · ${macroBreakdown(item)}`}
                    value={`${Math.round(item.kcal)} kcal`}
                  />
                ))}
              </View>
            ) : null}

            <ActionRow>
              <InlineAction
                label={`Log to ${MEAL_SLOT_LABEL[slot].toLowerCase()}`}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await repos.nutrition.createLog({
                      date: clock.today(),
                      mealSlot: slot,
                      rawText: meal.name,
                      source: 'saved_meal',
                      estimationStatus: 'final',
                      items: meal.items.map((item) => ({ ...item, savedMealId: meal.id })),
                    });
                    await repos.savedMeals.markLogged(meal.id);
                    invalidate('logFood', 'saveMeal');
                    setStatus(`Logged ${meal.name} to ${MEAL_SLOT_LABEL[slot].toLowerCase()}.`);
                  })
                }
              />
              <InlineAction
                label={openId === meal.id ? 'Hide items' : 'Show items'}
                onPress={() => setOpenId(openId === meal.id ? null : meal.id)}
              />
              <InlineAction
                label="Delete"
                tone="bad"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await repos.savedMeals.remove(meal.id);
                    invalidate('saveMeal');
                    setStatus(`Deleted ${meal.name}.`);
                  })
                }
              />
            </ActionRow>
          </Card>
        ))
      )}
    </Screen>
  );
}
