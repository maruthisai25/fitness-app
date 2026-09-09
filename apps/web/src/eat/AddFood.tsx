/**
 * Eat → Add. Three ways in, DESIGN.md §6.4 and idea.md §18:
 *
 *  1. natural language, parsed by the coach, confirmed before anything is
 *     written (`food_logs` + `food_items`);
 *  2. a manual item form, which is also the fallback whenever the coach is not
 *     connected or a parse fails;
 *  3. saved meals, logged in one tap, bumping `timesLogged`.
 */

import type { FoodItemDraft, LocalDate, MealSlot, SavedMeal } from '@vigor/core';
import { radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { isAiUnavailableError, type AiGateway } from '../ai/gateway';
import { useAiGateway } from '../ai/context';
import { Field, PrimaryButton, SecondaryButton, Select, TextInput } from '../components/form';
import { Card, EmptyState, LinkButton, Notice, Pill, Section } from '../components/ui';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import {
  fromEditable,
  ItemFields,
  toEditable,
  type EditableItem,
} from './DayLog';
import { useLogFood, useProfile, useSavedMeals } from './data';
import { MEAL_SLOT_LABEL, MEAL_SLOTS } from './mealSlots';

const BLANK_ITEM: EditableItem = {
  name: '',
  quantity: '1',
  unit: 'serving',
  kcal: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
  fiberG: '',
};

export function AddFood({
  date,
  initialSlot,
  initialText = '',
  initialMode = 'describe',
  onLogged,
}: {
  date: LocalDate;
  initialSlot: MealSlot;
  initialText?: string;
  initialMode?: 'describe' | 'manual' | 'saved';
  onLogged: () => void;
}): ReactNode {
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [mode, setMode] = useState<'describe' | 'manual' | 'saved'>(initialMode);
  const gateway = useAiGateway();

  return (
    <div>
      <Field label="Which meal is this?">
        <Select value={slot} onChange={(value) => setSlot(value as MealSlot)}>
          {MEAL_SLOTS.map((option) => (
            <option key={option} value={option}>
              {MEAL_SLOT_LABEL[option]}
            </option>
          ))}
        </Select>
      </Field>

      <div style={{ display: 'flex', gap: space.xs, marginBottom: space.xl, flexWrap: 'wrap' }}>
        <ModeButton active={mode === 'describe'} onClick={() => setMode('describe')}>
          Describe it
        </ModeButton>
        <ModeButton active={mode === 'manual'} onClick={() => setMode('manual')}>
          Type the numbers
        </ModeButton>
        <ModeButton active={mode === 'saved'} onClick={() => setMode('saved')}>
          Saved meals
        </ModeButton>
      </div>

      {mode === 'describe' && (
        <DescribeFood
          date={date}
          slot={slot}
          gateway={gateway}
          initialText={initialText}
          onLogged={onLogged}
          onFallbackToManual={() => setMode('manual')}
        />
      )}
      {mode === 'manual' && (
        <ManualEntry date={date} slot={slot} initialName={initialText} onLogged={onLogged} />
      )}
      {mode === 'saved' && <SavedMealPicker date={date} slot={slot} onLogged={onLogged} />}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: `${space.xs}px ${space.md}px`,
        borderRadius: radius.pill,
        border: `1px solid ${active ? themeColor.accent : themeColor.border}`,
        background: active ? themeColor.accent : themeColor.surfaceRaised,
        color: active ? themeColor.textOnAccent : themeColor.textMuted,
        fontSize: fontSize.label,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 1 — natural language
// ---------------------------------------------------------------------------

function DescribeFood({
  date,
  slot,
  gateway,
  initialText,
  onLogged,
  onFallbackToManual,
}: {
  date: LocalDate;
  slot: MealSlot;
  gateway: AiGateway;
  initialText: string;
  onLogged: () => void;
  onFallbackToManual: () => void;
}): ReactNode {
  const profile = useProfile();
  const logFood = useLogFood();
  const [text, setText] = useState(initialText);
  const [parsing, setParsing] = useState(false);
  const [drafts, setDrafts] = useState<EditableItem[] | null>(null);
  const [confidences, setConfidences] = useState<number[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const region = profile.data?.foodRegion ?? 'generic';
  const available = gateway.isAvailable();

  async function parse(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    setParsing(true);
    setProblem(null);
    try {
      const parsed = await gateway.parseFood({ text: trimmed, region });
      if (parsed.length === 0) {
        setProblem('The coach could not find any food in that. Try naming the dish and a portion.');
        return;
      }
      setDrafts(parsed.map(toEditable));
      setConfidences(parsed.map((item) => item.confidence));
    } catch (error) {
      setProblem(
        isAiUnavailableError(error)
          ? error.userMessage
          : `That estimate did not come back: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setParsing(false);
    }
  }

  async function confirm(): Promise<void> {
    if (!drafts) return;
    const items: FoodItemDraft[] = drafts.map((draft, index) => ({
      ...fromEditable(draft),
      confidence: confidences[index] ?? 1,
    }));
    await logFood.mutateAsync({
      date,
      mealSlot: slot,
      rawText: text.trim(),
      source: 'ai',
      items,
    });
    setDrafts(null);
    setText('');
    onLogged();
  }

  return (
    <div>
      <Field
        label="What did you eat?"
        hint={`Plain words are fine — "two rotis, dal and a bowl of curd". Portions are estimated for ${region === 'generic' ? 'a generic region' : region}.`}
      >
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder="Two eggs, two slices of toast and a black coffee"
          style={{
            width: '100%',
            padding: space.md,
            borderRadius: radius.sm,
            border: `1px solid ${themeColor.border}`,
            background: themeColor.surface,
            color: themeColor.text,
            fontSize: fontSize.body,
            resize: 'vertical',
          }}
        />
      </Field>

      {!available && (
        <Notice tone="accent">
          The coach is not connected, so nothing can be estimated from words yet. Add your Anthropic
          API key in You → Settings, or{' '}
          <LinkButton tone="accent" onClick={onFallbackToManual}>
            type the numbers in yourself
          </LinkButton>
          .
        </Notice>
      )}

      <div style={{ display: 'flex', gap: space.sm, marginTop: space.md }}>
        <PrimaryButton onClick={() => void parse()} disabled={!available || parsing || !text.trim()}>
          {parsing ? 'Estimating…' : 'Estimate this'}
        </PrimaryButton>
        <SecondaryButton onClick={onFallbackToManual}>Enter it by hand instead</SecondaryButton>
      </div>

      {problem && (
        <div style={{ marginTop: space.md }}>
          <Notice tone="warn">
            {problem}{' '}
            <LinkButton tone="accent" onClick={onFallbackToManual}>
              Enter it by hand
            </LinkButton>
          </Notice>
        </div>
      )}

      {drafts && (
        <Section title="Check this before it is logged" style={{ marginTop: space.xl }}>
          <p style={{ color: themeColor.textMuted, fontSize: fontSize.label, marginTop: 0 }}>
            These are estimates. Fix anything that looks wrong — nothing is written until you
            confirm.
          </p>
          {drafts.map((draft, index) => (
            <Card key={index} style={{ marginBottom: space.md }}>
              <div style={{ display: 'flex', gap: space.sm, marginBottom: space.sm }}>
                <Pill tone={confidenceTone(confidences[index] ?? 1)}>
                  {Math.round((confidences[index] ?? 1) * 100)} % confident
                </Pill>
                <LinkButton
                  tone="bad"
                  onClick={() => {
                    setDrafts(drafts.filter((_, i) => i !== index));
                    setConfidences(confidences.filter((_, i) => i !== index));
                  }}
                >
                  Drop this item
                </LinkButton>
              </div>
              <ItemFields
                draft={draft}
                onChange={(next) =>
                  setDrafts(drafts.map((current, i) => (i === index ? next : current)))
                }
              />
            </Card>
          ))}
          <div style={{ display: 'flex', gap: space.sm }}>
            <PrimaryButton
              onClick={() => void confirm()}
              disabled={logFood.isPending || drafts.length === 0}
            >
              {logFood.isPending ? 'Logging…' : 'Log these items'}
            </PrimaryButton>
            <SecondaryButton onClick={() => setDrafts(null)}>Discard the estimate</SecondaryButton>
          </div>
        </Section>
      )}
    </div>
  );
}

function confidenceTone(confidence: number): 'good' | 'warn' | 'bad' {
  if (confidence >= 0.8) return 'good';
  if (confidence >= 0.5) return 'warn';
  return 'bad';
}

// ---------------------------------------------------------------------------
// 2 — manual
// ---------------------------------------------------------------------------

function ManualEntry({
  date,
  slot,
  initialName,
  onLogged,
}: {
  date: LocalDate;
  slot: MealSlot;
  initialName: string;
  onLogged: () => void;
}): ReactNode {
  const logFood = useLogFood();
  const [draft, setDraft] = useState<EditableItem>({ ...BLANK_ITEM, name: initialName });

  const ready = draft.name.trim().length > 0 && draft.kcal.trim().length > 0;

  async function submit(): Promise<void> {
    await logFood.mutateAsync({
      date,
      mealSlot: slot,
      rawText: `${draft.quantity} ${draft.unit} ${draft.name}`.trim(),
      source: 'manual',
      items: [fromEditable(draft)],
    });
    setDraft(BLANK_ITEM);
    onLogged();
  }

  return (
    <div>
      <p style={{ color: themeColor.textMuted, fontSize: fontSize.label, marginTop: 0 }}>
        Exact numbers, no estimate involved. This path always works, coach or no coach.
      </p>
      <ItemFields draft={draft} onChange={setDraft} />
      <PrimaryButton onClick={() => void submit()} disabled={!ready || logFood.isPending}>
        {logFood.isPending ? 'Logging…' : 'Log this item'}
      </PrimaryButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 — saved meals
// ---------------------------------------------------------------------------

function SavedMealPicker({
  date,
  slot,
  onLogged,
}: {
  date: LocalDate;
  slot: MealSlot;
  onLogged: () => void;
}): ReactNode {
  const meals = useSavedMeals();
  const logFood = useLogFood();
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const rows = meals.data ?? [];
    return needle ? rows.filter((meal) => meal.name.toLowerCase().includes(needle)) : rows;
  }, [meals.data, filter]);

  async function log(meal: SavedMeal): Promise<void> {
    await logFood.mutateAsync({
      date,
      mealSlot: slot,
      rawText: meal.name,
      source: 'saved_meal',
      savedMealId: meal.id,
      items: meal.items.map((item) => ({ ...item, savedMealId: meal.id })),
    });
    onLogged();
  }

  if (meals.isPending) return <EmptyState>Loading your saved meals…</EmptyState>;

  return (
    <div>
      <Field label="Find a saved meal">
        <TextInput value={filter} onChange={setFilter} placeholder="Search by name" />
      </Field>
      {visible.length === 0 && (
        <EmptyState>
          {meals.data && meals.data.length === 0
            ? 'No saved meals yet. Log something, then use “Save as meal” on the day view — after that it is one tap.'
            : 'No saved meal matches that name.'}
        </EmptyState>
      )}
      {visible.map((meal) => (
        <Card key={meal.id} style={{ marginBottom: space.sm }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: space.md,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <p style={{ margin: 0, color: themeColor.text, fontSize: fontSize.body }}>
                {meal.name}
              </p>
              <p
                className="tabular"
                style={{
                  margin: `${space.xs}px 0 0`,
                  color: themeColor.textMuted,
                  fontSize: fontSize.caption,
                }}
              >
                {Math.round(meal.kcal)} kcal · {Math.round(meal.proteinG)} g protein ·{' '}
                {meal.items.length} item{meal.items.length === 1 ? '' : 's'} · logged{' '}
                {meal.timesLogged}×
              </p>
            </div>
            <PrimaryButton onClick={() => void log(meal)} disabled={logFood.isPending}>
              Log it
            </PrimaryButton>
          </div>
        </Card>
      ))}
    </div>
  );
}
