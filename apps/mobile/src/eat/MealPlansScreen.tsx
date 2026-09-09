/**
 * Meal plans — DESIGN.md §6.4 "meal plan", phase 5 of §9.
 *
 * One to seven days, generated against the active targets and the pantry, then
 * stored so the plan survives going offline. Any planned meal can be logged
 * into the day with a single tap, which writes a normal `food_logs` row.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { queryKeys, type DayPlan, type DayPlanMeal, type MealPlan } from '@vigor/core';

import { isAiUnavailable, type AiGateway } from '../ai/gateway';
import { useAiGateway } from '../ai/useAiGateway';
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
  EmptyState,
  InlineAction,
  ItemRow,
  Note,
  ErrorScreen,
} from '../ui/primitives';
import { formatShortDate } from '../ui/DateStepper';
import { MEAL_SLOT_LABEL, itemQuantityLabel, loadFoodContext, macroBreakdown } from './model';

const DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7] as const;

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

  const plans = useQuery({
    queryKey: queryKeys.mealPlans(),
    queryFn: () => repos.mealPlans.list(),
  });

  async function create(): Promise<void> {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const targets = await repos.targets.getActive(today);
      if (!targets) {
        setError('Set daily targets first — a plan without them has nothing to aim at.');
        return;
      }
      const context = await loadFoodContext(repos);
      const plan = await gateway.generateMealPlan({
        days,
        targets,
        inventory: context.inventory,
        constraints: context.constraints,
      });
      await repos.mealPlans.create({
        startDate: plan[0]?.date ?? today,
        days: plan.length || days,
        plan,
        constraints: {
          kcalPerDay: targets.kcal,
          proteinGPerDay: targets.proteinG,
          dietary: context.constraints,
          excludeIngredients: [],
          maxCookMinutes: null,
          useInventoryFirst: true,
        },
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
            <Button label="Build a plan" onPress={() => void create()} loading={busy} />
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
