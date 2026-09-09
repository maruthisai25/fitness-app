import type { Goal, GoalType } from '@vigor/core';
import { color, fontSize, space } from '../../../src/ui/tokens';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useRepos } from '../../../src/db/AppDataProvider';
import {
  ErrorBanner,
  LoadingScreen,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
  ToggleRow,
} from '../../../src/ui/components';

const GOAL_TYPES: readonly { value: GoalType; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'hypertrophy', label: 'Muscle growth' },
  { value: 'fat_loss', label: 'Fat loss' },
  { value: 'general', label: 'General fitness' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'consistency', label: 'Consistency' },
];

export default function GoalsScreen() {
  const { goals } = useRepos();
  const [items, setItems] = useState<Goal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void goals
      // The You tab shows paused goals too, so they can be reactivated.
      .list({ includeInactive: true })
      .then(setItems)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load your goals.'),
      );
  }, [goals]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addGoal(type: GoalType) {
    setError(null);
    try {
      await goals.create({
        type,
        priority: (items?.length ?? 0) + 1,
        targetNote: null,
        active: true,
      });
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add that goal.');
    }
  }

  async function remove(id: string) {
    await goals.remove(id);
    refresh();
  }

  async function setActive(id: string, active: boolean) {
    await goals.setActive(id, active);
    refresh();
  }

  async function move(id: string, direction: -1 | 1) {
    if (!items) return;
    const ordered = [...items].sort((a, b) => a.priority - b.priority);
    const index = ordered.findIndex((goal) => goal.id === id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ordered.length) return;
    const a = ordered[index]!;
    const b = ordered[swapWith]!;
    await goals.update(a.id, { priority: b.priority });
    await goals.update(b.id, { priority: a.priority });
    refresh();
  }

  if (!items) {
    return <LoadingScreen label="Loading your goals…" />;
  }

  const ordered = [...items].sort((a, b) => a.priority - b.priority);
  const remaining = GOAL_TYPES.filter(
    (option) => !items.some((goal) => goal.type === option.value),
  );

  return (
    <Screen>
      <ScreenTitle>Goals</ScreenTitle>
      <ScreenBlurb>
        Multiple goals can coexist — priority order decides which one wins a trade-off.
      </ScreenBlurb>

      {ordered.length > 0 ? (
        <Section title="Your goals, by priority">
          <View>
            {ordered.map((goal, index) => (
              <View
                key={goal.id}
                style={{
                  borderBottomWidth: index === ordered.length - 1 ? 0 : 1,
                  borderBottomColor: color.border,
                }}
              >
                <ToggleRow
                  label={`${index + 1}. ${GOAL_TYPES.find((g) => g.value === goal.type)?.label ?? goal.type}`}
                  value={goal.active}
                  onValueChange={(active) => setActive(goal.id, active)}
                />
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    gap: space.lg,
                    paddingHorizontal: space.lg,
                    paddingBottom: space.md,
                  }}
                >
                  <Pressable onPress={() => move(goal.id, -1)}>
                    <Text style={{ color: color.textMuted, fontSize: fontSize.heading }}>↑</Text>
                  </Pressable>
                  <Pressable onPress={() => move(goal.id, 1)}>
                    <Text style={{ color: color.textMuted, fontSize: fontSize.heading }}>↓</Text>
                  </Pressable>
                  <Pressable onPress={() => remove(goal.id)}>
                    <Text style={{ color: color.bad, fontSize: fontSize.body }}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {remaining.length > 0 ? (
        <Section title="Add a goal">
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.lg }}
          >
            {remaining.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => addGoal(option.value)}
                style={{
                  paddingVertical: space.sm,
                  paddingHorizontal: space.md,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: color.borderStrong,
                }}
              >
                <Text style={{ color: color.textMuted, fontSize: fontSize.label }}>
                  + {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}
    </Screen>
  );
}
