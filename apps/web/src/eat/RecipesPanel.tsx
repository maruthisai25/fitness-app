/**
 * Eat → Recipes. DESIGN.md §6.4 recipe generation, idea.md §17–18.
 *
 * "What can I make?" hands the coach the pantry, today's remaining macros, the
 * dietary constraints stored as memories and an optional time limit. Nothing is
 * kept unless the user saves it. Saved recipes are ordered by `timesMade`,
 * because the ones you actually cook are the ones you want first.
 */

import { clampMacros, type LocalDate, type Recipe, type RecipeIngredient } from '@vigor/core';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useAiGateway } from '../ai/context';
import { isAiUnavailableError } from '../ai/gateway';
import { Field, PrimaryButton, SecondaryButton, Select, TextInput } from '../components/form';
import { Card, EmptyState, LinkButton, Notice, Pill, Section, Stat } from '../components/ui';
import { useDb } from '../db/provider';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import {
  constraintsFrom,
  preferencesFrom,
  useDayNutrition,
  useInventory,
  useInvalidate,
  useLogFood,
  useNutritionMemories,
  useRecipes,
} from './data';
import { MEAL_SLOT_LABEL, MEAL_SLOTS, defaultSlotForHour } from './mealSlots';

export function RecipesPanel({ today }: { today: LocalDate }): ReactNode {
  const recipes = useRecipes();
  const gateway = useAiGateway();
  const inventory = useInventory();
  const memories = useNutritionMemories();
  const day = useDayNutrition(today);
  const { repos } = useDb();
  const invalidate = useInvalidate();

  const [timeLimit, setTimeLimit] = useState('');
  const [running, setRunning] = useState(false);
  const [suggestion, setSuggestion] = useState<Recipe | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  async function suggest(): Promise<void> {
    setRunning(true);
    setProblem(null);
    setSavedNote(null);
    try {
      const minutes = Number(timeLimit);
      const recipe = await gateway.generateRecipe({
        inventory: inventory.data ?? [],
        remaining: clampMacros(day.data?.remaining ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }),
        constraints: constraintsFrom(memories.data ?? []),
        preferences: preferencesFrom(memories.data ?? []),
        ...(Number.isFinite(minutes) && minutes > 0 ? { timeMinutes: minutes } : {}),
      });
      setSuggestion(recipe);
    } catch (error) {
      setProblem(
        isAiUnavailableError(error)
          ? error.userMessage
          : `That suggestion did not come back: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setRunning(false);
    }
  }

  async function save(recipe: Recipe): Promise<void> {
    const created = await repos.recipes.create({
      title: recipe.title,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      timeMinutes: recipe.timeMinutes,
      servings: recipe.servings,
      perServing: recipe.perServing,
      tags: recipe.tags,
      source: 'ai',
      saved: true,
    });
    await invalidate('saveRecipe');
    setSuggestion(null);
    setSavedNote(`“${created.title}” is in your saved recipes.`);
  }

  const available = gateway.isAvailable();

  return (
    <div>
      <Section title="What can I make?">
        <Card>
          <p style={{ margin: `0 0 ${space.md}px`, color: themeColor.textMuted, lineHeight: 1.5 }}>
            The coach gets your pantry ({inventory.data?.length ?? 0} item
            {(inventory.data?.length ?? 0) === 1 ? '' : 's'}), what is left of today's targets, and
            the {constraintsFrom(memories.data ?? []).length} dietary constraint
            {constraintsFrom(memories.data ?? []).length === 1 ? '' : 's'} you have on record.
            Anything with a near use-by date gets used first.
          </p>
          <Field label="Time I have (minutes)" hint="Leave blank for no limit.">
            <TextInput value={timeLimit} onChange={setTimeLimit} inputMode="numeric" placeholder="25" />
          </Field>
          {!available && (
            <Notice tone="accent">
              The coach is not connected, so no recipe can be generated. Add your Anthropic API key
              in You → Settings. Your saved recipes below still work offline.
            </Notice>
          )}
          <div style={{ marginTop: space.md }}>
            <PrimaryButton onClick={() => void suggest()} disabled={!available || running}>
              {running ? 'Thinking…' : 'Suggest a recipe'}
            </PrimaryButton>
          </div>
          {problem && (
            <p style={{ color: themeColor.warn, fontSize: fontSize.label }} role="status">
              {problem}
            </p>
          )}
          {savedNote && (
            <p style={{ color: themeColor.good, fontSize: fontSize.label }} role="status">
              {savedNote}
            </p>
          )}
        </Card>

        {suggestion && (
          <Card style={{ marginTop: space.md }}>
            <RecipeBody recipe={suggestion} />
            <div style={{ display: 'flex', gap: space.sm, marginTop: space.lg }}>
              <PrimaryButton onClick={() => void save(suggestion)}>Save this recipe</PrimaryButton>
              <SecondaryButton onClick={() => setSuggestion(null)}>Not this one</SecondaryButton>
            </div>
          </Card>
        )}
      </Section>

      <Section title="Saved recipes">
        {recipes.isPending && <EmptyState>Loading your recipes…</EmptyState>}
        {recipes.data && recipes.data.length === 0 && (
          <EmptyState>
            Nothing saved yet. Generate one above, or keep the ones you already cook so they are one
            tap from the day log.
          </EmptyState>
        )}
        {(recipes.data ?? []).map((recipe) => (
          <Card key={recipe.id} style={{ marginBottom: space.sm }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: space.md,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <Link
                  to={`/eat/recipes/${recipe.id}`}
                  style={{ color: themeColor.text, fontSize: fontSize.body, fontWeight: 600 }}
                >
                  {recipe.title}
                </Link>
                <p
                  className="tabular"
                  style={{
                    margin: `${space.xs}px 0 0`,
                    color: themeColor.textMuted,
                    fontSize: fontSize.caption,
                  }}
                >
                  {recipe.timeMinutes} min · {Math.round(recipe.perServing.kcal)} kcal /serving ·{' '}
                  {Math.round(recipe.perServing.proteinG)} g protein · made {recipe.timesMade}×
                </p>
              </div>
              <Pill tone={recipe.source === 'ai' ? 'accent' : 'muted'}>
                {recipe.source === 'ai' ? 'from the coach' : 'yours'}
              </Pill>
            </div>
          </Card>
        ))}
      </Section>
    </div>
  );
}

export function RecipeDetail({ today }: { today: LocalDate }): ReactNode {
  const { recipeId } = useParams();
  const navigate = useNavigate();
  const { repos } = useDb();
  const invalidate = useInvalidate();
  const recipes = useRecipes();
  const logFood = useLogFood();
  const [offerLog, setOfferLog] = useState(false);
  const [slot, setSlot] = useState(() => defaultSlotForHour(new Date().getHours()));
  const [busy, setBusy] = useState(false);

  const recipe = (recipes.data ?? []).find((row) => row.id === recipeId) ?? null;

  if (recipes.isPending) return <EmptyState>Loading…</EmptyState>;
  if (!recipe) {
    return (
      <EmptyState>
        That recipe is not in your saved list.{' '}
        <Link to="/eat/recipes" style={{ color: themeColor.accent }}>
          Back to recipes
        </Link>
      </EmptyState>
    );
  }

  async function madeIt(): Promise<void> {
    if (!recipe) return;
    setBusy(true);
    try {
      await repos.recipes.markMade(recipe.id);
      await invalidate('saveRecipe');
      setOfferLog(true);
    } finally {
      setBusy(false);
    }
  }

  async function logIt(): Promise<void> {
    if (!recipe) return;
    await logFood.mutateAsync({
      date: today,
      mealSlot: slot,
      rawText: recipe.title,
      source: 'manual',
      items: [
        {
          name: `${recipe.title} (1 serving)`,
          quantity: 1,
          unit: 'serving',
          kcal: recipe.perServing.kcal,
          proteinG: recipe.perServing.proteinG,
          carbsG: recipe.perServing.carbsG,
          fatG: recipe.perServing.fatG,
          fiberG: recipe.perServing.fiberG,
          confidence: 1,
          savedMealId: null,
        },
      ],
    });
    setOfferLog(false);
    void navigate('/eat');
  }

  return (
    <div>
      <p style={{ margin: `0 0 ${space.lg}px` }}>
        <Link to="/eat/recipes" style={{ color: themeColor.accent, fontSize: fontSize.label }}>
          ‹ All recipes
        </Link>
      </p>
      <Card>
        <RecipeBody recipe={recipe} />
        <div style={{ display: 'flex', gap: space.sm, marginTop: space.lg, flexWrap: 'wrap' }}>
          <PrimaryButton onClick={() => void madeIt()} disabled={busy}>
            I made this
          </PrimaryButton>
          <LinkButton
            tone="bad"
            onClick={() => {
              void (async () => {
                await repos.recipes.setSaved(recipe.id, false);
                await invalidate('saveRecipe');
                void navigate('/eat/recipes');
              })();
            }}
          >
            Remove from saved
          </LinkButton>
        </div>
        {offerLog && (
          <div style={{ marginTop: space.lg }}>
            <Notice tone="accent">
              Made {recipe.timesMade + 1} time{recipe.timesMade + 1 === 1 ? '' : 's'} now. Log one
              serving to today?
            </Notice>
            <div style={{ display: 'flex', gap: space.sm, alignItems: 'flex-end', marginTop: space.md }}>
              <div style={{ minWidth: 160 }}>
                <Field label="Meal">
                  <Select value={slot} onChange={(value) => setSlot(value as typeof slot)}>
                    {MEAL_SLOTS.map((option) => (
                      <option key={option} value={option}>
                        {MEAL_SLOT_LABEL[option]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <PrimaryButton onClick={() => void logIt()} disabled={logFood.isPending}>
                Log a serving
              </PrimaryButton>
              <SecondaryButton onClick={() => setOfferLog(false)}>Not now</SecondaryButton>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function RecipeBody({ recipe }: { recipe: Recipe }): ReactNode {
  return (
    <div>
      <h3
        style={{
          margin: `0 0 ${space.sm}px`,
          color: themeColor.text,
          fontSize: fontSize.subheading,
        }}
      >
        {recipe.title}
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
          gap: space.lg,
          marginBottom: space.lg,
        }}
      >
        <Stat label="Time" value={String(recipe.timeMinutes)} unit="min" />
        <Stat label="Servings" value={String(recipe.servings)} />
        <Stat label="Per serving" value={String(Math.round(recipe.perServing.kcal))} unit="kcal" />
        <Stat label="Protein" value={String(Math.round(recipe.perServing.proteinG))} unit="g" />
      </div>

      <h4 style={{ margin: `0 0 ${space.xs}px`, color: themeColor.textMuted, fontSize: fontSize.label }}>
        Ingredients
      </h4>
      <ul style={{ margin: `0 0 ${space.lg}px`, paddingLeft: space.xl, color: themeColor.text }}>
        {recipe.ingredients.map((ingredient: RecipeIngredient, index: number) => (
          <li key={`${ingredient.name}-${index}`} style={{ fontSize: fontSize.label, lineHeight: 1.6 }}>
            <span className="tabular">
              {ingredient.quantity} {ingredient.unit}
            </span>{' '}
            {ingredient.name}
            {ingredient.note ? ` — ${ingredient.note}` : ''}
          </li>
        ))}
      </ul>

      <h4 style={{ margin: `0 0 ${space.xs}px`, color: themeColor.textMuted, fontSize: fontSize.label }}>
        Steps
      </h4>
      <ol style={{ margin: 0, paddingLeft: space.xl, color: themeColor.text }}>
        {recipe.steps.map((step: string, index: number) => (
          <li key={index} style={{ fontSize: fontSize.label, lineHeight: 1.6, marginBottom: space.xs }}>
            {step}
          </li>
        ))}
      </ol>

      {recipe.tags.length > 0 && (
        <div style={{ display: 'flex', gap: space.xs, marginTop: space.lg, flexWrap: 'wrap' }}>
          {recipe.tags.map((tag: string) => (
            <Pill key={tag}>{tag}</Pill>
          ))}
        </div>
      )}
    </div>
  );
}
