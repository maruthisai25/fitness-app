/**
 * Eat → Plan. DESIGN.md §6.4: "Meal plan: same inputs, `DayPlan[]`, respects
 * targets per day." One to seven days, stored as a `meal_plans` row, and any
 * planned meal can be logged straight into `food_logs` with one tap.
 */

import {
  activeTargetsFor,
  addDays,
  type DayPlan,
  type DayPlanMeal,
  type LocalDate,
  type MealPlan,
} from '@vigor/core';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { useAiGateway } from '../ai/context';
import { isAiUnavailableError } from '../ai/gateway';
import { Field, PrimaryButton, SecondaryButton, Select } from '../components/form';
import { Card, EmptyState, LinkButton, Notice, Section, Stat } from '../components/ui';
import { useDb } from '../db/provider';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import {
  constraintsFrom,
  useInventory,
  useInvalidate,
  useLogFood,
  useMealPlans,
  useNutritionMemories,
  useNutritionTargets,
} from './data';
import { MEAL_SLOT_LABEL } from './mealSlots';

export function MealPlansPanel({ today }: { today: LocalDate }): ReactNode {
  const gateway = useAiGateway();
  const plans = useMealPlans();
  const inventory = useInventory();
  const memories = useNutritionMemories();
  const targetsQuery = useNutritionTargets();
  const { repos } = useDb();
  const invalidate = useInvalidate();

  const [days, setDays] = useState('3');
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const targets = activeTargetsFor(today, targetsQuery.data ?? []);
  const available = gateway.isAvailable();

  async function generate(): Promise<void> {
    if (!targets) return;
    setRunning(true);
    setProblem(null);
    try {
      const dayCount = Math.min(7, Math.max(1, Number(days) || 1));
      const plan = await gateway.generateMealPlan({
        days: dayCount,
        targets,
        inventory: inventory.data ?? [],
        constraints: constraintsFrom(memories.data ?? []),
      });
      await repos.mealPlans.create({
        startDate: plan[0]?.date ?? today,
        plan,
        days: plan.length,
        constraints: {
          kcalPerDay: targets.kcal,
          proteinGPerDay: targets.proteinG,
          dietary: constraintsFrom(memories.data ?? []),
          excludeIngredients: [],
          maxCookMinutes: null,
          useInventoryFirst: true,
        },
      });
      await invalidate('saveMealPlan');
    } catch (error) {
      setProblem(
        isAiUnavailableError(error)
          ? error.userMessage
          : `The plan did not come back: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <Section title="Plan ahead">
        <Card>
          <p style={{ margin: `0 0 ${space.md}px`, color: themeColor.textMuted, lineHeight: 1.5 }}>
            The coach builds one day at a time against your targets, using what is already in the
            pantry before anything you would have to buy.
          </p>
          <div style={{ maxWidth: 200 }}>
            <Field label="How many days?">
              <Select value={days} onChange={setDays}>
                {[1, 2, 3, 4, 5, 6, 7].map((count) => (
                  <option key={count} value={String(count)}>
                    {count} day{count === 1 ? '' : 's'}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {!targets && (
            <Notice tone="warn">
              A plan needs targets to aim at. Set them in Eat → Targets first.
            </Notice>
          )}
          {targets && !available && (
            <Notice tone="accent">
              The coach is not connected, so no plan can be built. Add your Anthropic API key in
              You → Settings. Plans you already have stay readable offline.
            </Notice>
          )}
          <div style={{ marginTop: space.md }}>
            <PrimaryButton onClick={() => void generate()} disabled={!available || !targets || running}>
              {running ? 'Building the plan…' : 'Build a plan'}
            </PrimaryButton>
          </div>
          {problem && (
            <p style={{ color: themeColor.warn, fontSize: fontSize.label }} role="status">
              {problem}
            </p>
          )}
        </Card>
      </Section>

      <Section title="Your plans">
        {plans.isPending && <EmptyState>Loading…</EmptyState>}
        {plans.data && plans.data.length === 0 && (
          <EmptyState>No plans yet. Build one above when you want the week decided in advance.</EmptyState>
        )}
        {(plans.data ?? []).map((plan) => (
          <PlanCard key={plan.id} plan={plan} today={today} />
        ))}
      </Section>
    </div>
  );
}

function PlanCard({ plan, today }: { plan: MealPlan; today: LocalDate }): ReactNode {
  const { repos } = useDb();
  const invalidate = useInvalidate();
  const [dayIndex, setDayIndex] = useState(() => {
    const index = plan.plan.findIndex((day) => day.date === today);
    return index >= 0 ? index : 0;
  });
  const day: DayPlan | undefined = plan.plan[dayIndex];

  async function remove(): Promise<void> {
    await repos.mealPlans.remove(plan.id);
    await invalidate('saveMealPlan');
  }

  return (
    <Card style={{ marginBottom: space.lg }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: space.md,
          flexWrap: 'wrap',
          marginBottom: space.md,
        }}
      >
        <p className="tabular" style={{ margin: 0, color: themeColor.text, fontSize: fontSize.body }}>
          {plan.days} day{plan.days === 1 ? '' : 's'} from {plan.startDate} to{' '}
          {addDays(plan.startDate, plan.days - 1)}
        </p>
        <LinkButton tone="bad" onClick={() => void remove()}>
          Delete plan
        </LinkButton>
      </div>

      <div style={{ display: 'flex', gap: space.xs, flexWrap: 'wrap', marginBottom: space.lg }}>
        {plan.plan.map((entry, index) => (
          <button
            key={entry.date}
            type="button"
            onClick={() => setDayIndex(index)}
            aria-pressed={index === dayIndex}
            className="tabular"
            style={{
              padding: `${space.xs}px ${space.sm}px`,
              borderRadius: 999,
              border: `1px solid ${index === dayIndex ? themeColor.accent : themeColor.border}`,
              background: index === dayIndex ? themeColor.accent : themeColor.surfaceRaised,
              color: index === dayIndex ? themeColor.textOnAccent : themeColor.textMuted,
              fontSize: fontSize.caption,
              cursor: 'pointer',
            }}
          >
            {entry.date}
          </button>
        ))}
      </div>

      {day == null ? (
        <EmptyState>This plan has no days in it.</EmptyState>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
              gap: space.lg,
              marginBottom: space.lg,
            }}
          >
            <Stat label="Planned" value={String(Math.round(day.totals.kcal))} unit="kcal" />
            <Stat label="Protein" value={String(Math.round(day.totals.proteinG))} unit="g" />
            <Stat label="Carbs" value={String(Math.round(day.totals.carbsG))} unit="g" />
            <Stat label="Fat" value={String(Math.round(day.totals.fatG))} unit="g" />
          </div>
          {day.meals.map((meal, index) => (
            <PlannedMeal key={`${day.date}-${index}`} meal={meal} date={day.date} />
          ))}
        </>
      )}
    </Card>
  );
}

function PlannedMeal({ meal, date }: { meal: DayPlanMeal; date: LocalDate }): ReactNode {
  const logFood = useLogFood();
  const [logged, setLogged] = useState(false);

  async function log(): Promise<void> {
    await logFood.mutateAsync({
      date,
      mealSlot: meal.mealSlot,
      rawText: meal.title,
      source: meal.savedMealId ? 'saved_meal' : 'manual',
      savedMealId: meal.savedMealId,
      items: meal.items,
    });
    setLogged(true);
  }

  return (
    <div
      style={{
        borderTop: `1px solid ${themeColor.border}`,
        paddingTop: space.md,
        marginTop: space.md,
      }}
    >
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
          <p style={{ margin: 0, color: themeColor.textMuted, fontSize: fontSize.caption }}>
            {MEAL_SLOT_LABEL[meal.mealSlot]}
          </p>
          <p style={{ margin: 0, color: themeColor.text, fontSize: fontSize.body }}>{meal.title}</p>
        </div>
        {logged ? (
          <span style={{ color: themeColor.good, fontSize: fontSize.label }}>Logged</span>
        ) : (
          <SecondaryButton onClick={() => void log()} disabled={logFood.isPending}>
            Log this meal
          </SecondaryButton>
        )}
      </div>
      <ul style={{ margin: `${space.xs}px 0 0`, paddingLeft: space.xl }}>
        {meal.items.map((item, index) => (
          <li
            key={`${item.name}-${index}`}
            style={{ color: themeColor.textMuted, fontSize: fontSize.caption, lineHeight: 1.6 }}
          >
            <span className="tabular">
              {item.quantity} {item.unit}
            </span>{' '}
            {item.name} — <span className="tabular">{Math.round(item.kcal)} kcal</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
