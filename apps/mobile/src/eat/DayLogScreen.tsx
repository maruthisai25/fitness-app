/**
 * The Eat tab's day view — DESIGN.md §7.1: "day log by meal".
 *
 * A date switcher, the day's meals grouped by slot with their items, per-meal
 * and whole-day totals against the active targets, and the doors to everything
 * else in the tab.
 */
import { useState } from 'react';

import type { FoodLogWithItems, LocalDate } from '@vigor/core';

import { useInvalidator } from '../data/queries';
import { usePlatform, useRepos } from '../db/AppDataProvider';
import {
  Button,
  ErrorBanner,
  LinkRow,
  LoadingScreen,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
  TextField,
} from '../ui/components';
import { DateStepper } from '../ui/DateStepper';
import { Caption, Card, CardTitle, EmptyState, ErrorScreen } from '../ui/primitives';
import { DayTotals } from './DayTotals';
import { FoodLogCard } from './FoodLogCard';
import {
  MEAL_SLOT_LABEL,
  groupByMeal,
  macroBreakdown,
  macroSummary,
  sumDrafts,
  useDayNutrition,
} from './model';

export function DayLogScreen({ onNavigate }: { onNavigate: (path: string) => void }) {
  const repos = useRepos();
  const { clock } = usePlatform();
  const invalidate = useInvalidator();
  const today = clock.today();

  const [date, setDate] = useState<LocalDate>(today);
  const [savingLog, setSavingLog] = useState<FoodLogWithItems | null>(null);
  const [mealName, setMealName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const day = useDayNutrition(repos, date);

  async function saveAsMeal(): Promise<void> {
    if (!savingLog) return;
    const name = mealName.trim();
    if (name.length === 0) {
      setError('Give the meal a name so you can find it in the saved list.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await repos.savedMeals.create({
        name,
        items: savingLog.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          kcal: item.kcal,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          fiberG: item.fiberG,
          confidence: item.confidence,
          savedMealId: null,
        })),
      });
      invalidate('saveMeal');
      setSavingLog(null);
      setMealName('');
      setSaved(`Saved “${name}”. It is one tap to log from now on.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (day.isPending) return <LoadingScreen label="Loading the day…" />;
  if (day.error) return <ErrorScreen message={`Could not load the day: ${day.error.message}`} />;
  if (!day.data) return <ErrorScreen message="The day did not load." />;

  const groups = groupByMeal(day.data.logs);

  return (
    <Screen>
      <ScreenTitle>Eat</ScreenTitle>
      <ScreenBlurb>
        Everything you logged, what is left against your targets, and the pantry, recipes and plans
        behind it.
      </ScreenBlurb>

      <DateStepper date={date} today={today} onChange={setDate} />

      <DayTotals day={day.data} onOpenTargets={() => onNavigate('/eat/targets')} />

      <Button label="Add food" onPress={() => onNavigate('/eat/add')} />

      {error ? <ErrorBanner message={error} /> : null}
      {saved ? <Caption tone="good">{saved}</Caption> : null}

      {savingLog ? (
        <Card>
          <CardTitle>Save this as a meal</CardTitle>
          <Caption>{`${savingLog.items.length} items · ${macroSummary(
            sumDrafts(savingLog.items),
          )}`}</Caption>
          <TextField
            label="Meal name"
            placeholder="Post-gym eggs and toast"
            value={mealName}
            onChangeText={setMealName}
          />
          <Button label="Save meal" onPress={() => void saveAsMeal()} loading={busy} />
          <Button
            label="Not now"
            variant="secondary"
            onPress={() => {
              setSavingLog(null);
              setMealName('');
            }}
          />
        </Card>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState
          title="Nothing logged for this day"
          detail="Add food describes what you ate in plain words, or logs a saved meal in one tap."
        />
      ) : (
        groups.map((group) => (
          <Card key={group.slot}>
            <CardTitle>{MEAL_SLOT_LABEL[group.slot]}</CardTitle>
            <Caption>{`${macroSummary(group.totals)} · ${macroBreakdown(group.totals)}`}</Caption>
            {group.logs.map((log) => (
              <FoodLogCard
                key={log.id}
                repos={repos}
                log={log}
                onSaveAsMeal={(target) => {
                  setSavingLog(target);
                  setMealName(target.rawText);
                  setSaved(null);
                }}
              />
            ))}
          </Card>
        ))
      )}

      <Section title="The rest of Eat">
        <LinkRow
          title="Targets"
          subtitle="What you are aiming for each day"
          onPress={() => onNavigate('/eat/targets')}
        />
        <LinkRow
          title="Saved meals"
          subtitle="One-tap repeats"
          onPress={() => onNavigate('/eat/saved-meals')}
        />
        <LinkRow
          title="Inventory"
          subtitle="What is in the kitchen right now"
          onPress={() => onNavigate('/eat/inventory')}
        />
        <LinkRow
          title="Recipes"
          subtitle="Saved recipes and “what can I make?”"
          onPress={() => onNavigate('/eat/recipes')}
        />
        <LinkRow
          title="Meal plans"
          subtitle="One to seven days at a time"
          onPress={() => onNavigate('/eat/plans')}
        />
      </Section>
    </Screen>
  );
}
