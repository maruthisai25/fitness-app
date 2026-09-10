/**
 * Meal plans — DESIGN.md §6.4 "meal plan", phase 5 of §9.
 *
 * One to seven days, generated against the active targets and the pantry, then
 * stored so the plan survives going offline. Any planned meal can be logged
 * into the day with a single tap, which writes a normal `food_logs` row.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  buildMealPlanRequest,
  presetPinsInventoryFirst,
  queryKeys,
  type DayPlan,
  type DayPlanMeal,
  type MealPlan,
  type MealPlanPreset,
} from '@vigor/core';

import { isAiUnavailable, type AiGateway } from '../ai/gateway';
import { useAiGateway } from '../ai/useAiGateway';
import { useInvalidator } from '../data/queries';
import { usePlatform, useRepos } from '../db/AppDataProvider';
import { useReminderResync } from '../progress/useProgressForeground';
import {
  Button,
  ChoiceRow,
  ErrorBanner,
  LoadingScreen,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  TextField,
  ToggleRow,
} from '../ui/components';
import {
  ActionRow,
  Body,
  Caption,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  EmptyState,
  InlineAction,
  ItemRow,
  NumberField,
  Note,
  ErrorScreen,
} from '../ui/primitives';
import { color, fontSize, radius, space, TEXT_ACTION_HIT_SLOP } from '../ui/tokens';
import { formatShortDate } from '../ui/DateStepper';
import {
  MEAL_PLAN_PRESET_OPTIONS,
  MEAL_SLOT_LABEL,
  itemQuantityLabel,
  loadFoodContext,
  macroBreakdown,
} from './model';

const DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7] as const;

/** One excluded ingredient, removable by tapping it. */
function ExcludedIngredientChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Remove ${name} from exclusions`}
      hitSlop={TEXT_ACTION_HIT_SLOP}
      onPress={onRemove}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: color.borderStrong,
        paddingVertical: space.xs,
        paddingHorizontal: space.md,
      }}
    >
      <Text style={{ color: color.text, fontSize: fontSize.label }}>{name}</Text>
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ color: color.textMuted, fontSize: fontSize.label }}
      >
        ✕
      </Text>
    </Pressable>
  );
}

export function MealPlansScreen({
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
  const resyncReminders = useReminderResync();
  const today = clock.today();

  const [days, setDays] = useState<number>(3);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [preset, setPreset] = useState<MealPlanPreset>('balanced');
  const [maxCookMinutesText, setMaxCookMinutesText] = useState('');
  const [excludeIngredients, setExcludeIngredients] = useState<string[]>([]);
  const [excludeDraft, setExcludeDraft] = useState('');
  // Pantry-first pins the constraint on; the other presets leave the choice
  // here, and it starts on because shopping for a plan you cannot cook today
  // is the worse default.
  const [inventoryFirstChoice, setInventoryFirstChoice] = useState(true);
  const inventoryFirstPinned = presetPinsInventoryFirst(preset);
  const useInventoryFirst = inventoryFirstPinned || inventoryFirstChoice;

  const plans = useQuery({
    queryKey: queryKeys.mealPlans(),
    queryFn: () => repos.mealPlans.list(),
  });

  function addExcludedIngredient(): void {
    const value = excludeDraft.trim();
    if (value.length === 0) return;
    setExcludeIngredients((current) =>
      current.some((item) => item.toLowerCase() === value.toLowerCase())
        ? current
        : [...current, value],
    );
    setExcludeDraft('');
  }

  function removeExcludedIngredient(name: string): void {
    setExcludeIngredients((current) => current.filter((item) => item !== name));
  }

  /** A half-typed "12" survives; only a genuine number becomes a limit. */
  function parsedMaxCookMinutes(): number | null {
    const trimmed = maxCookMinutesText.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }

  async function create(): Promise<void> {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const baseTargets = await repos.targets.getActive(today);
      if (!baseTargets) {
        setError('Set daily targets first — a plan without them has nothing to aim at.');
        return;
      }
      const context = await loadFoodContext(repos);
      const request = buildMealPlanRequest({
        targets: baseTargets,
        preset,
        dietary: context.constraints,
        excludeIngredients,
        maxCookMinutes: parsedMaxCookMinutes(),
        useInventoryFirst,
      });
      const plan = await gateway.generateMealPlan({
        days,
        targets: request.targets,
        inventory: context.inventory,
        constraints: context.constraints,
        excludeIngredients: request.constraints.excludeIngredients,
        maxCookMinutes: request.constraints.maxCookMinutes,
        useInventoryFirst: request.useInventoryFirst,
      });
      await repos.mealPlans.create({
        startDate: plan[0]?.date ?? today,
        days: plan.length || days,
        plan,
        constraints: request.constraints,
      });
      invalidate('saveMealPlan');
      setStatus(`Planned ${plan.length} day${plan.length === 1 ? '' : 's'}.`);
    } catch (caught) {
      setError(
        isAiUnavailable(caught)
          ? caught.message
          : `Could not build a plan: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function logPlannedMeal(day: DayPlan, meal: DayPlanMeal): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await repos.nutrition.createLog({
        date: day.date,
        mealSlot: meal.mealSlot,
        rawText: meal.title,
        source: 'manual',
        estimationStatus: 'final',
        items: meal.items.map((item) => ({ ...item, savedMealId: meal.savedMealId })),
      });
      invalidate('logFood');
      resyncReminders();
      setStatus(`Logged ${meal.title} to ${day.date}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (plans.isPending) return <LoadingScreen label="Loading meal plans…" />;
  if (plans.error) return <ErrorScreen message={`Could not load plans: ${plans.error.message}`} />;

  const rows: MealPlan[] = plans.data ?? [];

  return (
    <Screen>
      <ScreenTitle>Meal plans</ScreenTitle>
      <ScreenBlurb>
        A few days at a time, built against your targets and what is already in the kitchen. Nothing
        is logged until you say so.
      </ScreenBlurb>

      {error ? <ErrorBanner message={error} /> : null}
      {status ? <Note tone="good">{status}</Note> : null}

      <Card>
        <CardTitle>Plan ahead</CardTitle>
        {gateway.isAvailable() ? (
          <View>
            <Caption>How many days?</Caption>
            <ChipRow>
              {DAY_CHOICES.map((choice) => (
                <Chip
                  key={choice}
                  label={`${choice}`}
                  selected={days === choice}
                  onPress={() => setDays(choice)}
                />
              ))}
            </ChipRow>

            <View style={{ marginTop: space.lg }}>
              <Caption>Preset</Caption>
              <ChoiceRow value={preset} options={MEAL_PLAN_PRESET_OPTIONS} onChange={setPreset} />
            </View>

            <View style={{ marginTop: space.lg }}>
              <NumberField
                label="Max cook minutes"
                testID="meal-plan-max-cook-minutes"
                value={maxCookMinutesText}
                onChangeText={setMaxCookMinutesText}
                suffix="min"
                hint="Longest a single meal may take, prep included. Leave blank for no limit."
                placeholder="e.g. 30"
              />
            </View>

            <View style={{ marginTop: space.lg }}>
              <TextField
                label="Exclude an ingredient"
                testID="meal-plan-exclude-input"
                value={excludeDraft}
                onChangeText={setExcludeDraft}
                placeholder="e.g. peanuts"
                onSubmitEditing={addExcludedIngredient}
                returnKeyType="done"
              />
              <Button
                label="Add exclusion"
                testID="meal-plan-exclude-add"
                variant="secondary"
                onPress={addExcludedIngredient}
                disabled={excludeDraft.trim().length === 0}
              />
              {excludeIngredients.length > 0 ? (
                <ChipRow>
                  {excludeIngredients.map((name) => (
                    <ExcludedIngredientChip
                      key={name}
                      name={name}
                      onRemove={() => removeExcludedIngredient(name)}
                    />
                  ))}
                </ChipRow>
              ) : null}
            </View>

            <View style={{ marginTop: space.lg }}>
              {inventoryFirstPinned ? (
                <Note>Pantry-first always plans around what is already in the kitchen.</Note>
              ) : (
                <ToggleRow
                  label="Use pantry inventory first"
                  hint="Plan around what you already have before anything you would have to buy."
                  value={inventoryFirstChoice}
                  onValueChange={setInventoryFirstChoice}
                />
              )}
            </View>

            <View style={{ marginTop: space.lg }}>
              <Button
                label="Build a plan"
                testID="meal-plan-build"
                onPress={() => void create()}
                loading={busy}
              />
            </View>
          </View>
        ) : (
          <View>
            <Note tone="warn">
              Planning needs the coach. Connect it in You → Settings. Plans you have already built
              stay readable and loggable without it.
            </Note>
            <ActionRow>
              <InlineAction label="Open settings" onPress={() => onNavigate('/you/settings')} />
            </ActionRow>
          </View>
        )}
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="No plans yet"
          detail="A plan is a suggestion, not a commitment — every meal is still logged by hand, so a day that goes differently costs nothing."
        />
      ) : (
        rows.map((plan) => (
          <Card key={plan.id}>
            <CardTitle>{`${formatShortDate(plan.startDate)} · ${plan.days} day${
              plan.days === 1 ? '' : 's'
            }`}</CardTitle>
            <Caption>{`Built ${plan.createdAt.slice(0, 10)}${
              plan.constraints.dietary.length > 0
                ? ` · respecting ${plan.constraints.dietary.length} constraint${
                    plan.constraints.dietary.length === 1 ? '' : 's'
                  }`
                : ''
            }`}</Caption>

            <ActionRow>
              <InlineAction
                label={openId === plan.id ? 'Hide days' : 'Show days'}
                onPress={() => setOpenId(openId === plan.id ? null : plan.id)}
              />
              <InlineAction
                label="Delete plan"
                tone="bad"
                disabled={busy}
                onPress={() =>
                  void (async () => {
                    await repos.mealPlans.remove(plan.id);
                    invalidate('saveMealPlan');
                  })()
                }
              />
            </ActionRow>

            {openId === plan.id
              ? plan.plan.map((day) => (
                  <View key={day.date}>
                    <Body tone="accent">{`${formatShortDate(day.date)} — ${Math.round(
                      day.totals.kcal,
                    )} kcal · ${macroBreakdown(day.totals)}`}</Body>
                    {day.meals.map((meal, index) => (
                      <View key={`${day.date}-${meal.mealSlot}-${index}`}>
                        <ItemRow
                          title={`${MEAL_SLOT_LABEL[meal.mealSlot]}: ${meal.title}`}
                          subtitle={meal.items
                            .map((item) => `${item.name} ${itemQuantityLabel(item)}`)
                            .join(', ')}
                        />
                        <ActionRow>
                          <InlineAction
                            label="Log this meal"
                            disabled={busy}
                            onPress={() => void logPlannedMeal(day, meal)}
                          />
                        </ActionRow>
                      </View>
                    ))}
                  </View>
                ))
              : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
