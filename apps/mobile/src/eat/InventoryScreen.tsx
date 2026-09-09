/**
 * The pantry — DESIGN.md §7.1 "Eat", §6.4 (recipes put items with a `useBy`
 * inside two days first).
 *
 * Quantities, units, categories and use-by dates, with anything due within two
 * days flagged as "use soon", and a one-tap decrement for when you cook with
 * something.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { addDays, queryKeys, type InventoryItem } from '@vigor/core';

import { useInvalidator } from '../data/queries';
import { usePlatform, useRepos } from '../db/AppDataProvider';
import {
  Button,
  ErrorBanner,
  LoadingScreen,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  TextField,
} from '../ui/components';
import {
  ActionRow,
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

/** DESIGN.md §6.4 — "items with `useBy` in 2 days first". */
export const USE_SOON_DAYS = 2;

interface ItemForm {
  name: string;
  quantity: string;
  unit: string;
  category: string;
  useBy: string;
  notes: string;
}

const EMPTY_FORM: ItemForm = {
  name: '',
  quantity: '1',
  unit: 'unit',
  category: '',
  useBy: '',
  notes: '',
};

function formOf(item: InventoryItem): ItemForm {
  return {
    name: item.name,
    quantity: String(item.quantity),
    unit: item.unit,
    category: item.category ?? '',
    useBy: item.useBy ?? '',
    notes: item.notes ?? '',
  };
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function InventoryScreen() {
  const repos = useRepos();
  const { clock } = usePlatform();
  const invalidate = useInvalidator();
  const today = clock.today();
  const soonCutoff = addDays(today, USE_SOON_DAYS);

  const [form, setForm] = useState<ItemForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = useQuery({
    queryKey: queryKeys.inventory(),
    queryFn: () => repos.inventory.list(),
  });

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      invalidate('updateInventory');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submit(): Promise<void> {
    if (!form) return;
    const name = form.name.trim();
    if (name.length === 0) {
      setError('Name the item so it can be matched to a recipe.');
      return;
    }
    if (form.useBy.length > 0 && !DATE_PATTERN.test(form.useBy)) {
      setError('Use-by needs to look like 2026-09-12.');
      return;
    }
    const fields = {
      name,
      quantity: toNumber(form.quantity),
      unit: form.unit.trim() || 'unit',
      category: form.category.trim() || null,
      useBy: form.useBy.length > 0 ? form.useBy : null,
      notes: form.notes.trim() || null,
    };
    await run(async () => {
      if (editingId) await repos.inventory.update(editingId, fields);
      else await repos.inventory.add(fields);
      setForm(null);
      setEditingId(null);
    });
  }

  async function useOne(item: InventoryItem): Promise<void> {
    await run(async () => {
      const next = Math.max(0, Math.round((item.quantity - 1) * 100) / 100);
      if (next === 0) await repos.inventory.remove(item.id);
      else await repos.inventory.update(item.id, { quantity: next });
    });
  }

  if (items.isPending) return <LoadingScreen label="Loading the pantry…" />;
  if (items.error)
    return <ErrorScreen message={`Could not load the pantry: ${items.error.message}`} />;

  const rows = items.data ?? [];
  const useSoon = rows.filter((item) => item.useBy != null && item.useBy <= soonCutoff);

  return (
    <Screen>
      <ScreenTitle>Inventory</ScreenTitle>
      <ScreenBlurb>
        What is in the kitchen. Recipes are built from this list, and anything close to its use-by
        date gets used first.
      </ScreenBlurb>

      {error ? <ErrorBanner message={error} /> : null}

      {useSoon.length > 0 ? (
        <Card>
          <CardTitle>Use soon</CardTitle>
          <Caption>{`Within ${USE_SOON_DAYS} days of the use-by date.`}</Caption>
          {useSoon.map((item) => (
            <ItemRow
              key={item.id}
              title={item.name}
              subtitle={`${item.quantity} ${item.unit}`}
              value={item.useBy ?? ''}
              tone={item.useBy != null && item.useBy < today ? 'bad' : 'warn'}
            />
          ))}
        </Card>
      ) : null}

      {form ? (
        <Card>
          <CardTitle>{editingId ? 'Edit item' : 'Add to the pantry'}</CardTitle>
          <TextField
            label="Item"
            placeholder="Paneer"
            value={form.name}
            onChangeText={(name) => setForm({ ...form, name })}
          />
          <NumberField
            label="Quantity"
            value={form.quantity}
            onChangeText={(quantity) => setForm({ ...form, quantity })}
          />
          <TextField
            label="Unit"
            placeholder="g"
            value={form.unit}
            onChangeText={(unit) => setForm({ ...form, unit })}
          />
          <TextField
            label="Category"
            placeholder="Dairy"
            value={form.category}
            onChangeText={(category) => setForm({ ...form, category })}
          />
          <TextField
            label="Use by"
            placeholder="2026-09-12"
            hint="Leave blank if it does not spoil."
            value={form.useBy}
            onChangeText={(useBy) => setForm({ ...form, useBy })}
          />
          <TextField
            label="Notes"
            placeholder="Half a block left"
            value={form.notes}
            onChangeText={(notes) => setForm({ ...form, notes })}
          />
          <Button
            label={editingId ? 'Save item' : 'Add item'}
            onPress={() => void submit()}
            loading={busy}
          />
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => {
              setForm(null);
              setEditingId(null);
            }}
          />
        </Card>
      ) : (
        <Button label="Add an item" onPress={() => setForm(EMPTY_FORM)} />
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="The pantry is empty"
          detail="Add what you actually have and “What can I make?” starts from real ingredients instead of guesses."
        />
      ) : (
        <Card>
          <CardTitle>{`${rows.length} item${rows.length === 1 ? '' : 's'}`}</CardTitle>
          {rows.map((item) => {
            const soon = item.useBy != null && item.useBy <= soonCutoff;
            return (
              <View key={item.id}>
                <ItemRow
                  title={item.name}
                  subtitle={[
                    `${item.quantity} ${item.unit}`,
                    item.category,
                    item.useBy ? `use by ${item.useBy}` : null,
                    item.notes,
                  ]
                    .filter((part): part is string => Boolean(part))
                    .join(' · ')}
                  tone={soon ? 'warn' : 'neutral'}
                  value={soon ? 'use soon' : undefined}
                />
                <ActionRow>
                  <InlineAction
                    label="I used this"
                    disabled={busy}
                    onPress={() => void useOne(item)}
                  />
                  <InlineAction
                    label="Edit"
                    onPress={() => {
                      setForm(formOf(item));
                      setEditingId(item.id);
                    }}
                  />
                  <InlineAction
                    label="Remove"
                    tone="bad"
                    disabled={busy}
                    onPress={() => void run(() => repos.inventory.remove(item.id))}
                  />
                </ActionRow>
              </View>
            );
          })}
          <Note>
            “I used this” takes one off the count and drops the row when it reaches zero, so the
            pantry stays honest without a separate stock-take.
          </Note>
        </Card>
      )}
    </Screen>
  );
}
