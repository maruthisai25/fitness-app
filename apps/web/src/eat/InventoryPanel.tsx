/**
 * Eat → Inventory (the pantry). DESIGN.md §9 phase 5 and §6.4: items with a
 * `useBy` inside two days are surfaced first, because the recipe prompt puts
 * them first too.
 */

import { addDays, daysBetween, type InventoryItem, type LocalDate } from '@vigor/core';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { Field, PrimaryButton, SecondaryButton, TextInput } from '../components/form';
import { Card, EmptyState, LinkButton, Pill, Section } from '../components/ui';
import { useDb } from '../db/provider';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { useInventory, useInvalidate } from './data';

/** DESIGN.md §6.4 — "items with `useBy` in 2 days first". */
export const USE_SOON_DAYS = 2;

export function useSoon(item: InventoryItem, today: LocalDate): boolean {
  return item.useBy != null && item.useBy <= addDays(today, USE_SOON_DAYS);
}

interface ItemDraft {
  name: string;
  quantity: string;
  unit: string;
  category: string;
  useBy: string;
  notes: string;
}

const BLANK: ItemDraft = { name: '', quantity: '1', unit: 'g', category: '', useBy: '', notes: '' };

export function InventoryPanel({ today }: { today: LocalDate }): ReactNode {
  const { repos } = useDb();
  const invalidate = useInvalidate();
  const inventory = useInventory();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ItemDraft>(BLANK);
  const [busy, setBusy] = useState(false);

  const { soon, rest } = useMemo(() => {
    const rows = inventory.data ?? [];
    return {
      soon: rows.filter((item) => useSoon(item, today)),
      rest: rows.filter((item) => !useSoon(item, today)),
    };
  }, [inventory.data, today]);

  async function add(): Promise<void> {
    const name = draft.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      await repos.inventory.add({
        name,
        quantity: Number(draft.quantity) || 0,
        unit: draft.unit.trim() || 'unit',
        category: draft.category.trim() || null,
        useBy: draft.useBy.trim() || null,
        notes: draft.notes.trim() || null,
      });
      await invalidate('updateInventory');
      setDraft(BLANK);
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  if (inventory.isPending) return <EmptyState>Loading your pantry…</EmptyState>;

  return (
    <div>
      <Section
        title="Use soon"
        action={
          !adding ? <SecondaryButton onClick={() => setAdding(true)}>Add an item</SecondaryButton> : null
        }
      >
        {soon.length === 0 ? (
          <EmptyState>Nothing is within {USE_SOON_DAYS} days of its use-by date.</EmptyState>
        ) : (
          soon.map((item) => <ItemCard key={item.id} item={item} today={today} highlight />)
        )}
      </Section>

      {adding && (
        <Card style={{ marginBottom: space.xl }}>
          <Field label="What is it?">
            <TextInput
              value={draft.name}
              onChange={(value) => setDraft({ ...draft, name: value })}
              placeholder="Paneer"
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: space.md }}>
            <Field label="Quantity">
              <TextInput
                value={draft.quantity}
                onChange={(value) => setDraft({ ...draft, quantity: value })}
                inputMode="decimal"
              />
            </Field>
            <Field label="Unit">
              <TextInput
                value={draft.unit}
                onChange={(value) => setDraft({ ...draft, unit: value })}
                placeholder="g, packet, tin"
              />
            </Field>
            <Field label="Category">
              <TextInput
                value={draft.category}
                onChange={(value) => setDraft({ ...draft, category: value })}
                placeholder="dairy, grain, veg"
              />
            </Field>
          </div>
          <Field label="Use by" hint="Leave blank for anything that keeps.">
            <input
              type="date"
              value={draft.useBy}
              onChange={(event) => setDraft({ ...draft, useBy: event.target.value })}
              style={{
                padding: `${space.sm}px ${space.md}px`,
                borderRadius: 6,
                border: `1px solid ${themeColor.border}`,
                background: themeColor.surface,
                color: themeColor.text,
                fontSize: fontSize.body,
              }}
            />
          </Field>
          <div style={{ display: 'flex', gap: space.sm }}>
            <PrimaryButton onClick={() => void add()} disabled={busy || !draft.name.trim()}>
              Add to pantry
            </PrimaryButton>
            <SecondaryButton onClick={() => setAdding(false)}>Cancel</SecondaryButton>
          </div>
        </Card>
      )}

      <Section title="Everything else">
        {rest.length === 0 ? (
          <EmptyState>
            Your pantry is empty. Add what you actually have and “What can I make?” gets a lot more
            useful.
          </EmptyState>
        ) : (
          rest.map((item) => <ItemCard key={item.id} item={item} today={today} />)
        )}
      </Section>
    </div>
  );
}

function ItemCard({
  item,
  today,
  highlight = false,
}: {
  item: InventoryItem;
  today: LocalDate;
  highlight?: boolean;
}): ReactNode {
  const { repos } = useDb();
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [used, setUsed] = useState('1');
  const [busy, setBusy] = useState(false);

  const daysLeft = item.useBy ? daysBetween(today, item.useBy) : null;

  async function saveQuantity(): Promise<void> {
    setBusy(true);
    try {
      await repos.inventory.update(item.id, { quantity: Number(quantity) || 0 });
      await invalidate('updateInventory');
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  /** "I used this": decrement, and drop the row once it is gone. */
  async function useSome(): Promise<void> {
    const amount = Number(used) || 0;
    const next = Math.max(0, item.quantity - amount);
    setBusy(true);
    try {
      if (next === 0) await repos.inventory.remove(item.id);
      else await repos.inventory.update(item.id, { quantity: next });
      await invalidate('updateInventory');
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    setBusy(true);
    try {
      await repos.inventory.remove(item.id);
      await invalidate('updateInventory');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tone={highlight ? 'accent' : 'surface'} style={{ marginBottom: space.sm }}>
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
          <p style={{ margin: 0, color: themeColor.text, fontSize: fontSize.body }}>{item.name}</p>
          <p
            className="tabular"
            style={{
              margin: `${space.xs}px 0 0`,
              color: themeColor.textMuted,
              fontSize: fontSize.caption,
            }}
          >
            {item.quantity} {item.unit}
            {item.category ? ` · ${item.category}` : ''}
            {item.useBy ? ` · use by ${item.useBy}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          {daysLeft != null && (
            <Pill tone={daysLeft < 0 ? 'bad' : daysLeft <= USE_SOON_DAYS ? 'warn' : 'muted'}>
              {daysLeft < 0
                ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} past`
                : daysLeft === 0
                  ? 'use today'
                  : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
            </Pill>
          )}
          <LinkButton onClick={() => setEditing((value) => !value)} disabled={busy}>
            Edit
          </LinkButton>
          <LinkButton tone="bad" onClick={() => void remove()} disabled={busy}>
            Remove
          </LinkButton>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.sm,
          marginTop: space.md,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ color: themeColor.textMuted, fontSize: fontSize.caption }}>
          I used{' '}
          <input
            value={used}
            onChange={(event) => setUsed(event.target.value)}
            inputMode="decimal"
            aria-label={`Amount of ${item.name} used`}
            className="tabular"
            style={{
              width: 64,
              padding: `2px ${space.xs}px`,
              borderRadius: 6,
              border: `1px solid ${themeColor.border}`,
              background: themeColor.surface,
              color: themeColor.text,
            }}
          />{' '}
          {item.unit}
        </label>
        <SecondaryButton onClick={() => void useSome()} disabled={busy}>
          I used this
        </SecondaryButton>
      </div>

      {editing && (
        <div style={{ marginTop: space.md, display: 'flex', gap: space.sm, alignItems: 'flex-end' }}>
          <Field label="Quantity in stock">
            <TextInput value={quantity} onChange={setQuantity} inputMode="decimal" />
          </Field>
          <PrimaryButton onClick={() => void saveQuantity()} disabled={busy}>
            Save
          </PrimaryButton>
        </div>
      )}
    </Card>
  );
}
