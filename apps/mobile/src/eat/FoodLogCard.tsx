/**
 * One `food_logs` row and its items.
 *
 * Handles the three estimation states of DESIGN.md §4.1 / §6.4: `final` shows
 * the macros, `pending` shows "estimating…" while the queued job waits for the
 * coach, and `failed` offers manual entry so the log is never a dead end.
 * Any log can be promoted to a saved meal, and any item can be edited or
 * deleted in place.
 */
import { useState } from 'react';
import { View } from 'react-native';

import type { FoodItem, FoodLogWithItems, MacroTotals } from '@vigor/core';

import { useInvalidator } from '../data/queries';
import type { AppRepos } from '../db/AppDataProvider';
import { Button, ErrorBanner, TextField } from '../ui/components';
import { ActionRow, Caption, InlineAction, ItemRow, Note, NumberField } from '../ui/primitives';
import { itemQuantityLabel, macroBreakdown } from './model';

interface ItemDraft {
  name: string;
  quantity: string;
  unit: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
}

function emptyDraft(): ItemDraft {
  return {
    name: '',
    quantity: '1',
    unit: 'serving',
    kcal: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    fiberG: '',
  };
}

function draftFromItem(item: FoodItem): ItemDraft {
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

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function macrosOf(
  draft: ItemDraft,
): MacroTotals & { name: string; quantity: number; unit: string } {
  return {
    name: draft.name.trim(),
    quantity: toNumber(draft.quantity) || 1,
    unit: draft.unit.trim() || 'serving',
    kcal: toNumber(draft.kcal),
    proteinG: toNumber(draft.proteinG),
    carbsG: toNumber(draft.carbsG),
    fatG: toNumber(draft.fatG),
    fiberG: toNumber(draft.fiberG),
  };
}

function ItemEditor({
  draft,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
}: {
  draft: ItemDraft;
  onChange: (next: ItemDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  return (
    <View>
      <TextField
        label="Item"
        value={draft.name}
        onChangeText={(name) => onChange({ ...draft, name })}
      />
      <NumberField
        label="Quantity"
        value={draft.quantity}
        onChangeText={(quantity) => onChange({ ...draft, quantity })}
      />
      <TextField
        label="Unit"
        value={draft.unit}
        onChangeText={(unit) => onChange({ ...draft, unit })}
      />
      <NumberField
        label="Calories"
        suffix="kcal"
        value={draft.kcal}
        onChangeText={(kcal) => onChange({ ...draft, kcal })}
      />
      <NumberField
        label="Protein"
        suffix="g"
        value={draft.proteinG}
        onChangeText={(proteinG) => onChange({ ...draft, proteinG })}
      />
      <NumberField
        label="Carbs"
        suffix="g"
        value={draft.carbsG}
        onChangeText={(carbsG) => onChange({ ...draft, carbsG })}
      />
      <NumberField
        label="Fat"
        suffix="g"
        value={draft.fatG}
        onChangeText={(fatG) => onChange({ ...draft, fatG })}
      />
      <NumberField
        label="Fiber"
        suffix="g"
        value={draft.fiberG}
        onChangeText={(fiberG) => onChange({ ...draft, fiberG })}
      />
      <Button label={submitLabel} onPress={onSubmit} loading={busy} />
      <Button label="Cancel" variant="secondary" onPress={onCancel} />
    </View>
  );
}

export function FoodLogCard({
  repos,
  log,
  onSaveAsMeal,
}: {
  repos: AppRepos;
  log: FoodLogWithItems;
  onSaveAsMeal: (log: FoodLogWithItems) => void;
}) {
  const invalidate = useInvalidator();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(() => emptyDraft());
  const [rescuing, setRescuing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      invalidate('logFood');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const pending = log.estimationStatus === 'pending';
  const failed = log.estimationStatus === 'failed';

  return (
    <View>
      <ItemRow
        title={log.rawText.length > 0 ? log.rawText : 'Logged items'}
        subtitle={
          pending
            ? 'estimating…'
            : failed
              ? 'estimate failed'
              : `${log.items.length} item${log.items.length === 1 ? '' : 's'} · ${log.source === 'saved_meal' ? 'saved meal' : log.source === 'ai' ? 'estimated' : 'entered by hand'}`
        }
        tone={pending ? 'warn' : failed ? 'bad' : 'neutral'}
      />

      {error ? <ErrorBanner message={error} /> : null}

      {pending ? (
        <Note tone="warn">
          The coach has not estimated this yet. It stays queued and fills in on its own the next
          time the coach connects.
        </Note>
      ) : null}

      {failed && !rescuing ? (
        <View>
          <Note tone="bad">
            Estimating this one did not work. Enter the macros yourself and the log is complete.
          </Note>
          <ActionRow>
            <InlineAction
              label="Enter it manually"
              onPress={() => {
                setDraft({ ...emptyDraft(), name: log.rawText });
                setRescuing(true);
              }}
            />
          </ActionRow>
        </View>
      ) : null}

      {rescuing ? (
        <ItemEditor
          draft={draft}
          busy={busy}
          submitLabel="Save these macros"
          onChange={setDraft}
          onCancel={() => setRescuing(false)}
          onSubmit={() =>
            void run(async () => {
              const values = macrosOf(draft);
              await repos.nutrition.replaceItems(log.id, [
                { ...values, confidence: 1, savedMealId: null },
              ]);
              await repos.nutrition.updateLog(log.id, {
                estimationStatus: 'final',
                source: 'manual',
              });
              setRescuing(false);
            })
          }
        />
      ) : null}

      {log.items.map((item) =>
        editingId === item.id ? (
          <ItemEditor
            key={item.id}
            draft={draft}
            busy={busy}
            submitLabel="Save changes"
            onChange={setDraft}
            onCancel={() => setEditingId(null)}
            onSubmit={() =>
              void run(async () => {
                const values = macrosOf(draft);
                await repos.nutrition.updateItem(item.id, values);
                setEditingId(null);
              })
            }
          />
        ) : (
          <View key={item.id}>
            <ItemRow
              title={item.name}
              subtitle={`${itemQuantityLabel(item)} · ${macroBreakdown(item)}`}
              value={`${Math.round(item.kcal)} kcal`}
            />
            {item.confidence < 1 ? (
              <Caption>{`${Math.round(item.confidence * 100)}% confident estimate`}</Caption>
            ) : null}
            <ActionRow>
              <InlineAction
                label="Edit"
                onPress={() => {
                  setDraft(draftFromItem(item));
                  setEditingId(item.id);
                }}
              />
              <InlineAction
                label="Delete item"
                tone="bad"
                onPress={() => void run(() => repos.nutrition.removeItem(item.id))}
              />
            </ActionRow>
          </View>
        ),
      )}

      <ActionRow>
        {log.items.length > 0 ? (
          <InlineAction label="Save as meal" onPress={() => onSaveAsMeal(log)} />
        ) : null}
        <InlineAction
          label="Delete log"
          tone="bad"
          disabled={busy}
          onPress={() => void run(() => repos.nutrition.removeLog(log.id))}
        />
      </ActionRow>
    </View>
  );
}
