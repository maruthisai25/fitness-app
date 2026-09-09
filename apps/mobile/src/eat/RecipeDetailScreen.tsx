/**
 * One recipe in full, and the two things you do with it: make it, and log it.
 *
 * "I made this" bumps `timesMade` (idea.md §18 — VigorEngine learns which
 * recipes you actually make) and then offers to log a serving as a meal, which
 * writes the per-serving macros straight into the day.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { queryKeys, type Id, type MealSlot } from '@vigor/core';

import { useInvalidator } from '../data/queries';
import { usePlatform, useRepos } from '../db/AppDataProvider';
import { useReminderResync } from '../progress/useProgressForeground';
import {
  Button,
  ErrorBanner,
  LoadingScreen,
  Screen,
  ScreenBlurb,
  ScreenTitle,
} from '../ui/components';
import {
  ActionRow,
  Body,
  Caption,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  DataRow,
  InlineAction,
  ItemRow,
  Note,
  ErrorScreen,
} from '../ui/primitives';
import { MEAL_SLOT_LABEL, MEAL_SLOTS } from './model';
import { ingredientLine } from './RecipesScreen';

export function RecipeDetailScreen({ recipeId }: { recipeId: Id }) {
  const repos = useRepos();
  const { clock } = usePlatform();
  const invalidate = useInvalidator();
  const resyncReminders = useReminderResync();

  const [slot, setSlot] = useState<MealSlot>('dinner');
  const [offerLog, setOfferLog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const recipe = useQuery({
    queryKey: queryKeys.recipe(recipeId),
    queryFn: () => repos.recipes.get(recipeId),
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

  if (recipe.isPending) return <LoadingScreen label="Loading the recipe…" />;
  if (recipe.error)
    return <ErrorScreen message={`Could not load the recipe: ${recipe.error.message}`} />;
  if (!recipe.data) return <ErrorScreen message="That recipe is no longer saved." />;

  const row = recipe.data;

  return (
    <Screen>
      <ScreenTitle>{row.title}</ScreenTitle>
      <ScreenBlurb>
        {`${row.timeMinutes} minutes · serves ${row.servings} · ${
          row.source === 'ai' ? 'suggested by the coach' : 'your own recipe'
        }`}
      </ScreenBlurb>

      {error ? <ErrorBanner message={error} /> : null}
      {status ? <Note tone="good">{status}</Note> : null}

      <Card>
        <CardTitle>Per serving</CardTitle>
        <DataRow label="Calories" value={`${Math.round(row.perServing.kcal)} kcal`} />
        <DataRow label="Protein" value={`${Math.round(row.perServing.proteinG)} g`} />
        <DataRow label="Carbs" value={`${Math.round(row.perServing.carbsG)} g`} />
        <DataRow label="Fat" value={`${Math.round(row.perServing.fatG)} g`} />
        <DataRow label="Fiber" value={`${Math.round(row.perServing.fiberG)} g`} />
      </Card>

      <Card>
        <CardTitle>Ingredients</CardTitle>
        {row.ingredients.map((ingredient, index) => (
          <ItemRow key={`${ingredient.name}-${index}`} title={ingredientLine(ingredient)} />
        ))}
      </Card>

      <Card>
        <CardTitle>Method</CardTitle>
        {row.steps.map((step, index) => (
          <Body key={`step-${index}`}>{`${index + 1}. ${step}`}</Body>
        ))}
      </Card>

      <Card>
        <CardTitle>{`Made ${row.timesMade} time${row.timesMade === 1 ? '' : 's'}`}</CardTitle>
        {row.lastMadeAt ? <Caption>{`Last made ${row.lastMadeAt.slice(0, 10)}`}</Caption> : null}
        <Button
          label="I made this"
          loading={busy}
          onPress={() =>
            void run(async () => {
              await repos.recipes.markMade(row.id);
              invalidate('saveRecipe');
              setOfferLog(true);
              setStatus('Counted. Log a serving against today?');
            })
          }
        />

        {offerLog ? (
          <View>
            <Caption>Log one serving into</Caption>
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
            <ActionRow>
              <InlineAction
                label="Log a serving"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await repos.nutrition.createLog({
                      date: clock.today(),
                      mealSlot: slot,
                      rawText: row.title,
                      source: 'manual',
                      estimationStatus: 'final',
                      items: [
                        {
                          name: `${row.title} (1 serving)`,
                          quantity: 1,
                          unit: 'serving',
                          ...row.perServing,
                          confidence: 1,
                          savedMealId: null,
                        },
                      ],
                    });
                    invalidate('logFood');
                    resyncReminders();
                    setOfferLog(false);
                    setStatus(`Logged one serving to ${MEAL_SLOT_LABEL[slot].toLowerCase()}.`);
                  })
                }
              />
              <InlineAction label="Not now" tone="neutral" onPress={() => setOfferLog(false)} />
            </ActionRow>
          </View>
        ) : null}
      </Card>

      <Card>
        <CardTitle>Keep or drop</CardTitle>
        <ActionRow>
          <InlineAction
            label={row.saved ? 'Remove from saved' : 'Save this recipe'}
            tone={row.saved ? 'bad' : 'accent'}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await repos.recipes.setSaved(row.id, !row.saved);
                invalidate('saveRecipe');
                setStatus(row.saved ? 'Removed from the saved list.' : 'Saved.');
              })
            }
          />
        </ActionRow>
        <Caption>Macros come from the stored recipe, never recomputed in this screen.</Caption>
      </Card>
    </Screen>
  );
}
