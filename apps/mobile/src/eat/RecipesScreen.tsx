/**
 * Recipes — DESIGN.md §6.4 "recipe generation", phase 5 of §9.
 *
 * The saved list is ordered by how often you actually make each one. "What can
 * I make?" hands the coach the pantry, today's remaining macros, your dietary
 * constraints and an optional time limit; with no coach connected the screen
 * says so and the saved list still works.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { clampMacros, queryKeys, type Recipe, type RecipeIngredient } from '@vigor/core';

import { isAiUnavailable, type AiGateway } from '../ai/gateway';
import { useAiGateway } from '../ai/useAiGateway';
import { useInvalidator } from '../data/queries';
import { usePlatform, useRepos } from '../db/AppDataProvider';
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
  EmptyState,
  InlineAction,
  ItemRow,
  Note,
  NumberField,
  ErrorScreen,
} from '../ui/primitives';
import { loadFoodContext, macroBreakdown, useDayNutrition } from './model';

export function ingredientLine(ingredient: RecipeIngredient): string {
  const quantity = Number.isInteger(ingredient.quantity)
    ? String(ingredient.quantity)
    : String(Math.round(ingredient.quantity * 100) / 100);
  return [`${quantity} ${ingredient.unit}`.trim(), ingredient.name, ingredient.note]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

export function RecipesScreen({
  onNavigate,
  gateway: gatewayOverride,
}: {
  onNavigate: (path: string) => void;
  gateway?: AiGateway;
}) {
  const repos = useRepos();
  const { clock } = usePlatform();
  const installed = useAiGateway();
  const gateway = gatewayOverride ?? installed;
  const invalidate = useInvalidator();
  const today = clock.today();

  const [timeLimit, setTimeLimit] = useState('');
  const [suggestion, setSuggestion] = useState<Recipe | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const day = useDayNutrition(repos, today);
  const recipes = useQuery({
    queryKey: queryKeys.recipes(),
    queryFn: () => repos.recipes.list({ savedOnly: true }),
  });

  async function suggest(): Promise<void> {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const context = await loadFoodContext(repos);
      const minutes = Number.parseInt(timeLimit, 10);
      const recipe = await gateway.generateRecipe({
        inventory: context.inventory,
        remaining: clampMacros(
          day.data?.remaining ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
        ),
        constraints: context.constraints,
        preferences: context.preferences,
        timeMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : undefined,
      });
      setSuggestion(recipe);
    } catch (caught) {
      setError(
        isAiUnavailable(caught)
          ? caught.message
          : `Could not build a recipe: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function save(recipe: Recipe): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await repos.recipes.create({
        title: recipe.title,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        perServing: recipe.perServing,
        timeMinutes: recipe.timeMinutes,
        servings: recipe.servings,
        tags: recipe.tags,
        source: 'ai',
        saved: true,
      });
      invalidate('saveRecipe');
      setSuggestion(null);
      setStatus(`Saved “${recipe.title}”.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (recipes.isPending) return <LoadingScreen label="Loading recipes…" />;
  if (recipes.error)
    return <ErrorScreen message={`Could not load recipes: ${recipes.error.message}`} />;

  const saved = recipes.data ?? [];

  return (
    <Screen>
      <ScreenTitle>Recipes</ScreenTitle>
      <ScreenBlurb>
        What you can actually cook, ordered by what you actually cook. Suggestions start from the
        pantry and what is left of today&apos;s targets.
      </ScreenBlurb>

      {error ? <ErrorBanner message={error} /> : null}
      {status ? <Note tone="good">{status}</Note> : null}

      <Card>
        <CardTitle>What can I make?</CardTitle>
        {gateway.isAvailable() ? (
          <View>
            <Body>
              Uses the pantry, today&apos;s remaining macros and anything you have told the coach
              you will not eat. Items close to their use-by date get used first.
            </Body>
            <NumberField
              label="Time limit"
              suffix="min"
              placeholder="30"
              hint="Optional — leave blank if you are not in a hurry."
              value={timeLimit}
              onChangeText={setTimeLimit}
            />
            <Button label="Suggest a recipe" onPress={() => void suggest()} loading={busy} />
          </View>
        ) : (
          <View>
            <Note tone="warn">
              Recipe suggestions need the coach. Connect it in You → Settings; your saved recipes
              below work either way.
            </Note>
            <ActionRow>
              <InlineAction label="Open settings" onPress={() => onNavigate('/you/settings')} />
              <InlineAction label="Open inventory" onPress={() => onNavigate('/eat/inventory')} />
            </ActionRow>
          </View>
        )}
      </Card>

      {suggestion ? (
        <Card>
          <CardTitle>{suggestion.title}</CardTitle>
          <Caption>{`${suggestion.timeMinutes} min · serves ${suggestion.servings} · per serving ${Math.round(
            suggestion.perServing.kcal,
          )} kcal · ${macroBreakdown(suggestion.perServing)}`}</Caption>
          {suggestion.ingredients.map((ingredient, index) => (
            <ItemRow key={`${ingredient.name}-${index}`} title={ingredientLine(ingredient)} />
          ))}
          {suggestion.steps.map((step, index) => (
            <Body key={`step-${index}`}>{`${index + 1}. ${step}`}</Body>
          ))}
          <ActionRow>
            <InlineAction
              label="Save recipe"
              disabled={busy}
              onPress={() => void save(suggestion)}
            />
            <InlineAction label="Discard" tone="bad" onPress={() => setSuggestion(null)} />
          </ActionRow>
        </Card>
      ) : null}

      {saved.length === 0 ? (
        <EmptyState
          title="No saved recipes"
          detail="Save a suggestion, or add your own from a plan. Recipes you make often float to the top of this list."
        />
      ) : (
        <Card>
          <CardTitle>Saved</CardTitle>
          <Caption>Ordered by how many times you have made each one.</Caption>
          {saved.map((recipe) => (
            <ItemRow
              key={recipe.id}
              title={recipe.title}
              subtitle={`${recipe.timeMinutes} min · ${Math.round(
                recipe.perServing.kcal,
              )} kcal per serving${recipe.timesMade > 0 ? ` · made ${recipe.timesMade}×` : ''}`}
              value={'›'}
              onPress={() => onNavigate(`/eat/recipe/${recipe.id}`)}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
