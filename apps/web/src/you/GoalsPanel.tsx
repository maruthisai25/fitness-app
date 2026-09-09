import type { Goal, GoalType } from '@vigor/core';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { PrimaryButton, SecondaryButton, Select, TextInput } from '../components/form';
import { useDb } from '../db/provider';
import { themeColor } from '../theme/cssVars';

const GOAL_TYPES: GoalType[] = [
  'strength',
  'hypertrophy',
  'fat_loss',
  'general',
  'endurance',
  'mobility',
  'conditioning',
  'consistency',
];

export function GoalsPanel(): ReactNode {
  const { repos } = useDb();
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void repos.goals.list({ includeInactive: true }).then((rows) => {
      if (!cancelled) setGoals(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  if (!goals) return <p style={{ color: themeColor.textMuted }}>Loading goals…</p>;

  async function withBusy(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    try {
      await fn();
      setGoals(await repos.goals.list({ includeInactive: true }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {goals.map((goal) => (
        <div
          key={goal.id}
          style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}
        >
          <Select
            value={goal.type}
            onChange={(v) =>
              void withBusy(() => repos.goals.update(goal.id, { type: v as GoalType }))
            }
          >
            {GOAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace('_', ' ')}
              </option>
            ))}
          </Select>
          <TextInput
            value={String(goal.priority)}
            onChange={(v) =>
              void withBusy(() => repos.goals.update(goal.id, { priority: Number(v) || 1 }))
            }
            inputMode="numeric"
            style={{ width: 60 }}
          />
          <TextInput
            value={goal.targetNote ?? ''}
            onChange={(v) =>
              void withBusy(() => repos.goals.update(goal.id, { targetNote: v.trim() || null }))
            }
            placeholder="Target note"
            style={{ flex: 1 }}
          />
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
              checked={goal.active}
              onChange={(e) =>
                void withBusy(() => repos.goals.setActive(goal.id, e.target.checked))
              }
            />
            active
          </label>
          <SecondaryButton
            onClick={() => void withBusy(() => repos.goals.remove(goal.id))}
            disabled={busy}
          >
            Remove
          </SecondaryButton>
        </div>
      ))}
      <PrimaryButton
        onClick={() =>
          void withBusy(() => repos.goals.create({ type: 'general', priority: goals.length + 1 }))
        }
        disabled={busy}
      >
        Add goal
      </PrimaryButton>
    </div>
  );
}
