import type { Goal, GoalType } from '@vigor/core';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { color, fontSize, space } from '../../src/ui/tokens';

import { useRepos } from '../../src/db/AppDataProvider';
import {
  Button,
  ErrorBanner,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
} from '../../src/ui/components';

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

export default function OnboardingGoalsScreen() {
  const router = useRouter();
  const { goals } = useRepos();
  const [selected, setSelected] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void goals
      .list()
      .then(setSelected)
      .catch(() => undefined);
  }, [goals]);

  async function toggle(type: GoalType) {
    setError(null);
    const existing = selected.find((goal) => goal.type === type);
    try {
      if (existing) {
        await goals.remove(existing.id);
      } else {
        await goals.create({ type, priority: selected.length + 1, targetNote: null, active: true });
      }
      setSelected(await goals.list());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your goals.');
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const ordered = [...selected].sort((a, b) => a.priority - b.priority);
    const index = ordered.findIndex((goal) => goal.id === id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ordered.length) return;
    const a = ordered[index]!;
    const b = ordered[swapWith]!;
    await goals.update(a.id, { priority: b.priority });
    await goals.update(b.id, { priority: a.priority });
    setSelected(await goals.list());
  }

  async function next() {
    setSaving(true);
    try {
      router.push('/onboarding/equipment');
    } finally {
      setSaving(false);
    }
  }

  const ordered = [...selected].sort((a, b) => a.priority - b.priority);

  return (
    <Screen>
      <ScreenTitle>Your goals</ScreenTitle>
      <ScreenBlurb>
        Pick as many as apply. Order them — the top one gets the most weight.
      </ScreenBlurb>

      <Section title="Pick your goals">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.lg }}>
          {GOAL_TYPES.map((option) => {
            const active = selected.some((goal) => goal.type === option.value);
            return (
              <Pressable
                key={option.value}
                onPress={() => toggle(option.value)}
                style={{
                  paddingVertical: space.sm,
                  paddingHorizontal: space.md,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? color.accent : color.borderStrong,
                  backgroundColor: active ? color.accentSoft : 'transparent',
                }}
              >
                <Text
                  style={{
                    color: active ? color.accent : color.textMuted,
                    fontSize: fontSize.label,
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      {ordered.length > 0 ? (
        <Section title="Priority (top = most weight)">
          <View>
            {ordered.map((goal, index) => (
              <View
                key={goal.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: space.lg,
                  borderBottomWidth: index === ordered.length - 1 ? 0 : 1,
                  borderBottomColor: color.border,
                }}
              >
                <Text style={{ color: color.text, fontSize: fontSize.body }}>
                  {index + 1}. {GOAL_TYPES.find((g) => g.value === goal.type)?.label ?? goal.type}
                </Text>
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <Pressable onPress={() => move(goal.id, -1)}>
                    <Text style={{ color: color.textMuted, fontSize: fontSize.heading }}>↑</Text>
                  </Pressable>
                  <Pressable onPress={() => move(goal.id, 1)}>
                    <Text style={{ color: color.textMuted, fontSize: fontSize.heading }}>↓</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}
      <Button label="Continue" onPress={next} loading={saving} />
    </Screen>
  );
}
