import type { Equipment, EquipmentCategory } from '@vigor/core';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { PrimaryButton, SecondaryButton, Select, TextInput } from '../components/form';
import { useDb } from '../db/provider';
import { themeColor } from '../theme/cssVars';

const CATEGORIES: EquipmentCategory[] = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'band',
  'machine',
  'cable',
  'bodyweight',
  'cardio',
  'other',
];

export function EquipmentPanel(): ReactNode {
  const { repos } = useDb();
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void repos.equipment.list().then((rows) => {
      if (!cancelled) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  if (!items) return <p style={{ color: themeColor.textMuted }}>Loading equipment…</p>;

  async function withBusy(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    try {
      await fn();
      setItems(await repos.equipment.list());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {items.map((item) => (
        <div
          key={item.id}
          style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}
        >
          <TextInput
            value={item.name}
            onChange={(v) => void withBusy(() => repos.equipment.update(item.id, { name: v }))}
            style={{ flex: 1 }}
          />
          <Select
            value={item.category}
            onChange={(v) =>
              void withBusy(() =>
                repos.equipment.update(item.id, { category: v as EquipmentCategory }),
              )
            }
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
          <label
            style={{
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              color: themeColor.text,
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={item.available}
              onChange={(e) =>
                void withBusy(() => repos.equipment.setAvailable(item.id, e.target.checked))
              }
            />
            available
          </label>
          <SecondaryButton
            onClick={() => void withBusy(() => repos.equipment.remove(item.id))}
            disabled={busy}
          >
            Remove
          </SecondaryButton>
        </div>
      ))}
      <PrimaryButton
        onClick={() => void withBusy(() => repos.equipment.create({ name: '', category: 'other' }))}
        disabled={busy}
      >
        Add equipment
      </PrimaryButton>
    </div>
  );
}
