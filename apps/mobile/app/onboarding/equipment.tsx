import type { Equipment, EquipmentCategory } from '@vigor/core';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useRepos } from '../../src/db/AppDataProvider';
import {
  Button,
  ErrorBanner,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
  ToggleRow,
} from '../../src/ui/components';

/** DESIGN.md §4.1 `equipment.category`; default load increments per §5.1. */
const PRESET_EQUIPMENT: readonly {
  name: string;
  category: EquipmentCategory;
  loadIncrementKg: number | null;
}[] = [
  { name: 'Barbell', category: 'barbell', loadIncrementKg: 2.5 },
  { name: 'Dumbbells', category: 'dumbbell', loadIncrementKg: 2 },
  { name: 'Kettlebells', category: 'kettlebell', loadIncrementKg: null },
  { name: 'Resistance bands', category: 'band', loadIncrementKg: null },
  { name: 'Cable machine', category: 'cable', loadIncrementKg: 5 },
  { name: 'Weight machines', category: 'machine', loadIncrementKg: 5 },
  { name: 'Bodyweight only', category: 'bodyweight', loadIncrementKg: null },
  { name: 'Cardio equipment', category: 'cardio', loadIncrementKg: null },
];

export default function OnboardingEquipmentScreen() {
  const router = useRouter();
  const { equipment } = useRepos();
  const [items, setItems] = useState<Equipment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void equipment
      .list()
      .then(setItems)
      .catch(() => undefined);
  }, [equipment]);

  async function toggle(preset: (typeof PRESET_EQUIPMENT)[number]) {
    setError(null);
    try {
      const existing = items.find((item) => item.name === preset.name);
      if (existing) {
        await equipment.setAvailable(existing.id, !existing.available);
      } else {
        await equipment.create({
          name: preset.name,
          category: preset.category,
          available: true,
          loadIncrementKg: preset.loadIncrementKg,
          notes: null,
        });
      }
      setItems(await equipment.list());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your equipment.');
    }
  }

  async function next() {
    setSaving(true);
    try {
      router.push('/onboarding/duration');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScreenTitle>What do you have?</ScreenTitle>
      <ScreenBlurb>
        VigorEngine only plans exercises you can actually do. You can change this any time.
      </ScreenBlurb>

      <Section title="Available equipment">
        <View>
          {PRESET_EQUIPMENT.map((preset) => {
            const existing = items.find((item) => item.name === preset.name);
            return (
              <ToggleRow
                key={preset.name}
                label={preset.name}
                value={existing?.available ?? false}
                onValueChange={() => toggle(preset)}
              />
            );
          })}
        </View>
      </Section>

      {error ? <ErrorBanner message={error} /> : null}
      <Button label="Continue" onPress={next} loading={saving} />
    </Screen>
  );
}
