/**
 * Eat → Saved meals — DESIGN.md §7.1: "day log by meal, saved meals,
 * inventory, recipes, meal plans". Mirrors
 * `apps/mobile/src/eat/SavedMealsScreen.tsx`: the exact repeats idea.md §18
 * promises instead of an external food database, most-logged first
 * (`savedMeals.list` already orders that way), one tap to log into a chosen
 * slot for today, rename, and delete with confirmation.
 */

import type { LocalDate, MealSlot, SavedMeal } from '@vigor/core';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Field, PrimaryButton, SecondaryButton, TextInput } from '../components/form';
import { Card, EmptyState, LinkButton, Pill } from '../components/ui';
import { useDb } from '../db/provider';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { useInvalidate, useLogFood, useSavedMeals } from './data';
import { MEAL_SLOT_LABEL, MEAL_SLOTS } from './mealSlots';

export function SavedMealsPanel({ today }: { today: LocalDate }): ReactNode {
  const meals = useSavedMeals();
  const [slot, setSlot] = useState<MealSlot>('lunch');

  return (
    <div>
      <p style={{ margin: `0 0 ${space.sm}px`, fontSize: fontSize.label, color: themeColor.textMuted }}>
        Log into
      </p>
      <div
        role="group"
        aria-label="Meal slot to log into"
        style={{ display: 'flex', gap: space.xs, flexWrap: 'wrap', marginBottom: space.md }}
      >
        {MEAL_SLOTS.map((option) => (
          <Pill key={option} tone="accent" pressed={slot === option} onClick={() => setSlot(option)}>
            {MEAL_SLOT_LABEL[option]}
          </Pill>
        ))}
      </div>

      <p style={{ margin: `0 0 ${space.lg}px`, color: themeColor.textMuted, lineHeight: 1.5 }}>
        The things you eat again and again, with the macros you already agreed to. Most-logged
        first — one tap repeats it into {MEAL_SLOT_LABEL[slot].toLowerCase()} today.
      </p>

      {meals.isPending && <EmptyState>Loading saved meals…</EmptyState>}
      {meals.data && meals.data.length === 0 && (
        <EmptyState>
          Nothing saved yet. On the day log, save anything you have logged as a meal — it shows up
          here for one-tap repeats.
        </EmptyState>
      )}

      <div style={{ display: 'grid', gap: space.md }}>
        {(meals.data ?? []).map((meal) => (
          <SavedMealRow key={meal.id} meal={meal} slot={slot} today={today} />
        ))}
      </div>
    </div>
  );
}

function SavedMealRow({
  meal,
  slot,
  today,
}: {
  meal: SavedMeal;
  slot: MealSlot;
  today: LocalDate;
}): ReactNode {
  const { repos } = useDb();
  const invalidate = useInvalidate();
  const logFood = useLogFood();
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [name, setName] = useState(meal.name);
  const [showItems, setShowItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function logNow(): Promise<void> {
    setStatus(null);
    await logFood.mutateAsync({
      date: today,
      mealSlot: slot,
      rawText: meal.name,
      source: 'saved_meal',
      savedMealId: meal.id,
      items: meal.items.map((item) => ({ ...item, savedMealId: meal.id })),
    });
    setStatus(`Logged ${meal.name} to ${MEAL_SLOT_LABEL[slot].toLowerCase()}.`);
  }

  async function saveRename(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await repos.savedMeals.update(meal.id, { name: trimmed });
      await invalidate('saveMeal');
      setMode('view');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    setBusy(true);
    try {
      await repos.savedMeals.remove(meal.id);
      await invalidate('saveMeal');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'rename') {
    return (
      <Card>
        <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label={`Rename "${meal.name}"`}>
            <TextInput value={name} onChange={setName} />
          </Field>
          <SecondaryButton onClick={() => void saveRename()} disabled={busy || name.trim().length === 0}>
            Save
          </SecondaryButton>
          <LinkButton
            onClick={() => {
              setName(meal.name);
              setMode('view');
            }}
          >
            Cancel
          </LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: space.md,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, color: themeColor.text, fontSize: fontSize.body }}>{meal.name}</p>
          <p
            className="tabular"
            style={{ margin: `${space.xs}px 0 0`, color: themeColor.textMuted, fontSize: fontSize.caption }}
          >
            {Math.round(meal.kcal)} kcal · {macroBreakdown(meal)} · logged {meal.timesLogged}×
            {meal.lastLoggedAt ? ` · last ${meal.lastLoggedAt.slice(0, 10)}` : ''}
          </p>
        </div>
        <PrimaryButton onClick={() => void logNow()} disabled={logFood.isPending}>
          {logFood.isPending ? 'Logging…' : `Log to ${MEAL_SLOT_LABEL[slot].toLowerCase()}`}
        </PrimaryButton>
      </div>

      {showItems && (
        <ul style={{ margin: `${space.sm}px 0 0`, paddingLeft: space.xl }}>
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
      )}

      <div
        style={{
          display: 'flex',
          gap: space.md,
          alignItems: 'center',
          marginTop: space.sm,
          flexWrap: 'wrap',
        }}
      >
        <LinkButton onClick={() => setShowItems((value) => !value)}>
          {showItems ? 'Hide items' : 'Show items'}
        </LinkButton>
        <LinkButton onClick={() => setMode('rename')}>Rename</LinkButton>
        {mode === 'delete' ? (
          <>
            <span style={{ color: themeColor.bad, fontSize: fontSize.label }}>
              Delete "{meal.name}" permanently?
            </span>
            <LinkButton tone="bad" onClick={() => void confirmDelete()} disabled={busy}>
              Yes, delete
            </LinkButton>
            <LinkButton onClick={() => setMode('view')}>Cancel</LinkButton>
          </>
        ) : (
          <LinkButton tone="bad" onClick={() => setMode('delete')}>
            Delete
          </LinkButton>
        )}
        {status && (
          <span role="status" style={{ color: themeColor.good, fontSize: fontSize.label }}>
            {status}
          </span>
        )}
      </div>
    </Card>
  );
}

function macroBreakdown(meal: SavedMeal): string {
  return (
    `${Math.round(meal.proteinG)} P · ${Math.round(meal.carbsG)} C · ` +
    `${Math.round(meal.fatG)} F · ${Math.round(meal.fiberG)} fib`
  );
}
