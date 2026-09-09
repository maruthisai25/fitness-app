import type { Equipment, EquipmentCategory } from '@vigor/core';
import { color, fontSize, space } from '../../../src/ui/tokens';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useRepos } from '../../../src/db/AppDataProvider';
import {
  Button,
  ErrorBanner,
  LoadingScreen,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
  TextField,
  ToggleRow,
} from '../../../src/ui/components';

const CATEGORIES: readonly { value: EquipmentCategory; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band', label: 'Band' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'other', label: 'Other' },
];

export default function EquipmentScreen() {
  const { equipment } = useRepos();
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<EquipmentCategory>('other');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => {
    void equipment
      .list()
      .then(setItems)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load your equipment.'),
      );
  }, [equipment]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggle(item: Equipment) {
    await equipment.setAvailable(item.id, !item.available);
    refresh();
  }

  async function remove(id: string) {
    await equipment.remove(id);
    refresh();
  }

  async function addCustom() {
    if (newName.trim().length === 0) return;
    setAdding(true);
    setError(null);
    try {
      await equipment.create({
        name: newName.trim(),
        category: newCategory,
        available: true,
        loadIncrementKg: null,
        notes: null,
      });
      setNewName('');
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add that item.');
    } finally {
      setAdding(false);
    }
  }

  if (!items) {
    return <LoadingScreen label="Loading your equipment…" />;
  }

  return (
    <Screen>
      <ScreenTitle>Equipment</ScreenTitle>
      <ScreenBlurb>
        VigorEngine only plans exercises with equipment marked available here.
      </ScreenBlurb>

      {items.length > 0 ? (
        <Section title="Your equipment">
          <View>
            {items.map((item, index) => (
              <View
                key={item.id}
                style={{
                  borderBottomWidth: index === items.length - 1 ? 0 : 1,
                  borderBottomColor: color.border,
                }}
              >
                <ToggleRow
                  label={item.name}
                  hint={CATEGORIES.find((c) => c.value === item.category)?.label}
                  value={item.available}
                  onValueChange={() => toggle(item)}
                />
                <View
                  style={{
                    paddingHorizontal: space.lg,
                    paddingBottom: space.md,
                    alignItems: 'flex-end',
                  }}
                >
                  <Pressable onPress={() => remove(item.id)}>
                    <Text style={{ color: color.bad, fontSize: fontSize.label }}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title="Add equipment">
        <View style={{ padding: space.lg }}>
          <TextField
            label="Name"
            placeholder="e.g. Adjustable bench"
            value={newName}
            onChangeText={setNewName}
          />
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: space.sm,
              marginBottom: space.lg,
            }}
          >
            {CATEGORIES.map((category) => {
              const active = category.value === newCategory;
              return (
                <Pressable
                  key={category.value}
                  onPress={() => setNewCategory(category.value)}
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
                    {category.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button
            label="Add"
            onPress={addCustom}
            loading={adding}
            disabled={newName.trim().length === 0}
          />
        </View>
      </Section>

      {error ? <ErrorBanner message={error} /> : null}
    </Screen>
  );
}
