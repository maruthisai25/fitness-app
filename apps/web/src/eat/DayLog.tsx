/**
 * Eat → Day. DESIGN.md §7.1: "day log by meal", against the active targets
 * (DESIGN.md §5.6).
 *
 * The totals are the nutrition engine's: `buildDayNutrition` produces the
 * signed `remaining` and `clampMacros` is what the screen shows, exactly as
 * DESIGN.md §5.6 requires. Nothing is added up in this component.
 */

import {
  clampMacros,
  sumConsumed,
  type FoodItem,
  type FoodItemDraft,
  type FoodLogWithItems,
  type LocalDate,
  type MacroTotals,
} from '@vigor/core';
import { radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router';

import { MacroBar } from '../components/charts';
import { Field, PrimaryButton, SecondaryButton, TextInput } from '../components/form';
import { Card, DateStepper, EmptyState, LinkButton, Pill, Section, Stat } from '../components/ui';
import { useDb } from '../db/provider';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { useDayNutrition, useInvalidate } from './data';
import { MEAL_SLOT_LABEL, MEAL_SLOTS } from './mealSlots';

export function DayLog({
  date,
  onDateChange,
  today,
}: {
  date: LocalDate;
  onDateChange: (next: LocalDate) => void;
  today: LocalDate;
}): ReactNode {
  const day = useDayNutrition(date);

  if (day.isPending) return <EmptyState>Loading your day…</EmptyState>;
  if (day.isError) {
    return <EmptyState>Your food log could not be read: {String(day.error)}</EmptyState>;
  }

  const nutrition = day.data;
  const remaining = clampMacros(nutrition.remaining);
  const targets = nutrition.targets;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: space.md,
          marginBottom: space.xl,
        }}
      >
        <DateStepper date={date} onChange={onDateChange} today={today} />
        <Link
          to={`/eat/add?date=${date}`}
          style={{
            padding: `${space.sm}px ${space.lg}px`,
            borderRadius: radius.md,
            background: themeColor.accent,
            color: themeColor.textOnAccent,
            textDecoration: 'none',
            fontSize: fontSize.body,
            fontWeight: 600,
          }}
        >
          Add food
        </Link>
      </div>

      <Card style={{ marginBottom: space.xl }}>
        {targets == null ? (
          <div>
            <p style={{ margin: 0, color: themeColor.text }}>
              You have no calorie or macro targets yet, so this day shows what you ate but nothing
              to measure it against.
            </p>
            <p style={{ margin: `${space.sm}px 0 0` }}>
              <Link to="/eat/targets" style={{ color: themeColor.accent }}>
                Set your targets
              </Link>
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: space.lg,
                marginBottom: space.lg,
              }}
            >
              <Stat
                label="Calories left"
                value={String(Math.round(remaining.kcal))}
                unit="kcal"
                tone={remaining.kcal === 0 ? 'warn' : 'accent'}
              />
              <Stat
                label="Protein left"
                value={String(Math.round(remaining.proteinG))}
                unit="g"
                tone={remaining.proteinG === 0 ? 'good' : 'text'}
              />
              <Stat label="Eaten" value={String(Math.round(nutrition.consumed.kcal))} unit="kcal" />
              <Stat
                label="Fiber"
                value={`${Math.round(nutrition.consumed.fiberG)} / ${Math.round(targets.fiberG)}`}
                unit="g"
              />
            </div>
            <MacroBar
              label="Calories"
              consumed={nutrition.consumed.kcal}
              target={targets.kcal}
              unit="kcal"
            />
            <MacroBar
              label="Protein"
              consumed={nutrition.consumed.proteinG}
              target={targets.proteinG}
              unit="g"
            />
            <MacroBar
              label="Carbs"
              consumed={nutrition.consumed.carbsG}
              target={targets.carbsG}
              unit="g"
            />
            <MacroBar
              label="Fat"
              consumed={nutrition.consumed.fatG}
              target={targets.fatG}
              unit="g"
            />
            <MacroBar
              label="Fiber"
              consumed={nutrition.consumed.fiberG}
              target={targets.fiberG}
              unit="g"
            />
          </>
        )}
      </Card>

      {nutrition.logs.length === 0 && (
        <EmptyState>
          Nothing logged for this day yet. Add a meal in your own words, pick a saved meal, or type
          the numbers in by hand.
        </EmptyState>
      )}

      {MEAL_SLOTS.map((slot) => {
        const logs = nutrition.logs.filter((log) => log.mealSlot === slot);
        if (logs.length === 0) return null;
        const totals = sumConsumed(logs);
        return (
          <Section
            key={slot}
            title={MEAL_SLOT_LABEL[slot]}
            action={<MealTotals totals={totals} />}
          >
            {logs.map((log) => (
              <LogCard key={log.id} log={log} date={date} />
            ))}
          </Section>
        );
      })}
    </div>
  );
}

function MealTotals({ totals }: { totals: MacroTotals }): ReactNode {
  return (
    <span className="tabular" style={{ color: themeColor.textMuted, fontSize: fontSize.label }}>
      {Math.round(totals.kcal)} kcal · {Math.round(totals.proteinG)} g protein
    </span>
  );
}

function LogCard({ log, date }: { log: FoodLogWithItems; date: LocalDate }): ReactNode {
  const { repos } = useDb();
  const invalidate = useInvalidate();
  const [savingMeal, setSavingMeal] = useState(false);
  const [mealName, setMealName] = useState(log.rawText.slice(0, 60));
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function removeLog(): Promise<void> {
    setBusy(true);
    try {
      await repos.nutrition.removeLog(log.id);
      await invalidate('deleteFoodLog');
    } finally {
      setBusy(false);
    }
  }

  async function saveAsMeal(): Promise<void> {
    const name = mealName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const items: FoodItemDraft[] = log.items.map((item) => ({
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
      }));
      await repos.savedMeals.create({ name, items });
      await invalidate('saveMeal');
      setSavingMeal(false);
      setSavedNote(`Saved as "${name}" — it is one tap away next time.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ marginBottom: space.md }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: space.md,
          alignItems: 'flex-start',
          marginBottom: space.sm,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, color: themeColor.text, fontSize: fontSize.body }}>
            {log.rawText || 'Logged by hand'}
          </p>
          <div style={{ display: 'flex', gap: space.xs, marginTop: space.xs, flexWrap: 'wrap' }}>
            <Pill tone={log.source === 'ai' ? 'accent' : 'muted'}>
              {log.source === 'ai'
                ? 'estimated by the coach'
                : log.source === 'saved_meal'
                  ? 'saved meal'
                  : 'entered by hand'}
            </Pill>
            {log.estimationStatus === 'pending' && <Pill tone="warn">estimating…</Pill>}
            {log.estimationStatus === 'failed' && <Pill tone="bad">estimate failed</Pill>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: space.md, flexShrink: 0 }}>
          {log.items.length > 0 && (
            <LinkButton onClick={() => setSavingMeal((value) => !value)} disabled={busy}>
              Save as meal
            </LinkButton>
          )}
          <LinkButton tone="bad" onClick={() => void removeLog()} disabled={busy}>
            Delete
          </LinkButton>
        </div>
      </div>

      {log.estimationStatus === 'pending' && (
        <p style={{ color: themeColor.textMuted, fontSize: fontSize.label, margin: 0 }}>
          The coach is still estimating this one. It will fill in on its own; the totals above skip
          it until then.
        </p>
      )}

      {log.estimationStatus === 'failed' && (
        <FailedEstimate log={log} date={date} />
      )}

      {savingMeal && (
        <div style={{ marginTop: space.md }}>
          <Field label="Name this meal">
            <TextInput value={mealName} onChange={setMealName} placeholder="Post-gym eggs on toast" />
          </Field>
          <div style={{ display: 'flex', gap: space.sm }}>
            <PrimaryButton onClick={() => void saveAsMeal()} disabled={busy || !mealName.trim()}>
              Save meal
            </PrimaryButton>
            <SecondaryButton onClick={() => setSavingMeal(false)}>Cancel</SecondaryButton>
          </div>
        </div>
      )}

      {savedNote && (
        <p style={{ color: themeColor.good, fontSize: fontSize.label, margin: `${space.sm}px 0 0` }}>
          {savedNote}
        </p>
      )}

      {log.items.length > 0 && (
        <ul style={{ listStyle: 'none', margin: `${space.md}px 0 0`, padding: 0 }}>
          {log.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function FailedEstimate({ log, date }: { log: FoodLogWithItems; date: LocalDate }): ReactNode {
  return (
    <p style={{ color: themeColor.textMuted, fontSize: fontSize.label, margin: 0 }}>
      The coach could not estimate “{log.rawText}”.{' '}
      <Link
        to={`/eat/add?date=${date}&slot=${log.mealSlot}&text=${encodeURIComponent(log.rawText)}&mode=manual`}
        style={{ color: themeColor.accent }}
      >
        Enter the numbers yourself
      </Link>{' '}
      and delete this entry.
    </p>
  );
}

function ItemRow({ item }: { item: FoodItem }): ReactNode {
  const { repos } = useDb();
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toEditable(item));
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    setBusy(true);
    try {
      await repos.nutrition.updateItem(item.id, {
        name: draft.name.trim() || item.name,
        quantity: Number(draft.quantity) || 0,
        unit: draft.unit.trim() || item.unit,
        kcal: Number(draft.kcal) || 0,
        proteinG: Number(draft.proteinG) || 0,
        carbsG: Number(draft.carbsG) || 0,
        fatG: Number(draft.fatG) || 0,
        fiberG: Number(draft.fiberG) || 0,
      });
      await invalidate('logFood');
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    setBusy(true);
    try {
      await repos.nutrition.removeItem(item.id);
      await invalidate('logFood');
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li
        style={{
          padding: space.md,
          borderRadius: radius.sm,
          background: themeColor.surfaceRaised,
          marginBottom: space.sm,
        }}
      >
        <ItemFields draft={draft} onChange={setDraft} />
        <div style={{ display: 'flex', gap: space.sm }}>
          <PrimaryButton onClick={() => void save()} disabled={busy}>
            Save changes
          </PrimaryButton>
          <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
        </div>
      </li>
    );
  }

  return (
    <li
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: space.md,
        padding: `${space.sm}px 0`,
        borderTop: `1px solid ${themeColor.border}`,
      }}
    >
      <span style={{ color: themeColor.text, fontSize: fontSize.label, minWidth: 0 }}>
        <span className="tabular">
          {item.quantity} {item.unit}
        </span>{' '}
        {item.name}
        {item.confidence < 0.6 && (
          <>
            {' '}
            <Pill tone="warn">low confidence</Pill>
          </>
        )}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: space.md, flexShrink: 0 }}>
        <span
          className="tabular"
          style={{ color: themeColor.textMuted, fontSize: fontSize.caption }}
        >
          {Math.round(item.kcal)} kcal · {Math.round(item.proteinG)} P ·{' '}
          {Math.round(item.carbsG)} C · {Math.round(item.fatG)} F
        </span>
        <LinkButton onClick={() => setEditing(true)} disabled={busy}>
          Edit
        </LinkButton>
        <LinkButton tone="bad" onClick={() => void remove()} disabled={busy}>
          Remove
        </LinkButton>
      </span>
    </li>
  );
}

export interface EditableItem {
  name: string;
  quantity: string;
  unit: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
}

export function toEditable(item: FoodItemDraft): EditableItem {
  return {
    name: item.name,
    quantity: String(item.quantity),
    unit: item.unit,
    kcal: String(item.kcal),
    proteinG: String(item.proteinG),
    carbsG: String(item.carbsG),
    fatG: String(item.fatG),
    fiberG: String(item.fiberG),
  };
}

export function fromEditable(draft: EditableItem): FoodItemDraft {
  return {
    name: draft.name.trim(),
    quantity: Number(draft.quantity) || 0,
    unit: draft.unit.trim() || 'serving',
    kcal: Number(draft.kcal) || 0,
    proteinG: Number(draft.proteinG) || 0,
    carbsG: Number(draft.carbsG) || 0,
    fatG: Number(draft.fatG) || 0,
    fiberG: Number(draft.fiberG) || 0,
    confidence: 1,
    savedMealId: null,
  };
}

/** The manual macro fields, shared by the item editor and the manual add form. */
export function ItemFields({
  draft,
  onChange,
}: {
  draft: EditableItem;
  onChange: (next: EditableItem) => void;
}): ReactNode {
  const set = (key: keyof EditableItem) => (value: string) =>
    onChange({ ...draft, [key]: value });
  return (
    <>
      <Field label="Food">
        <TextInput value={draft.name} onChange={set('name')} placeholder="Chicken thigh curry" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.md }}>
        <Field label="Quantity">
          <TextInput value={draft.quantity} onChange={set('quantity')} inputMode="decimal" />
        </Field>
        <Field label="Unit">
          <TextInput value={draft.unit} onChange={set('unit')} placeholder="g, bowl, roti" />
        </Field>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
          gap: space.md,
        }}
      >
        <Field label="Calories (kcal)">
          <TextInput value={draft.kcal} onChange={set('kcal')} inputMode="decimal" />
        </Field>
        <Field label="Protein (g)">
          <TextInput value={draft.proteinG} onChange={set('proteinG')} inputMode="decimal" />
        </Field>
        <Field label="Carbs (g)">
          <TextInput value={draft.carbsG} onChange={set('carbsG')} inputMode="decimal" />
        </Field>
        <Field label="Fat (g)">
          <TextInput value={draft.fatG} onChange={set('fatG')} inputMode="decimal" />
        </Field>
        <Field label="Fiber (g)">
          <TextInput value={draft.fiberG} onChange={set('fiberG')} inputMode="decimal" />
        </Field>
      </div>
    </>
  );
}
