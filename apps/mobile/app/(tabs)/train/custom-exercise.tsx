import type { Difficulty, EquipmentCategory, LoadType, MovementPattern } from '@vigor/core';
import { MUSCLES } from '@vigor/library';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useInvalidate } from '../../../src/data/queries';
import { useRepos } from '../../../src/db/AppDataProvider';
import {
  Button,
  ErrorBanner,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  TextField,
} from '../../../src/ui/components';
import { parseNumber, patternLabel, slugify, titleCase } from '../../../src/ui/format';
import { Caption, Chip, ChipRow } from '../../../src/ui/kit';
import { space } from '../../../src/ui/tokens';

const PATTERNS: readonly MovementPattern[] = [
  'squat',
  'hinge',
  'lunge',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'carry',
  'core',
  'isolation',
  'cardio',
  'mobility',
];

const EQUIPMENT: readonly EquipmentCategory[] = [
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

const LOAD_TYPES: readonly { value: LoadType; label: string }[] = [
  { value: 'external', label: 'External load' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'assisted', label: 'Assisted' },
  { value: 'band', label: 'Band' },
  { value: 'time', label: 'Timed (seconds)' },
  { value: 'distance', label: 'Distance (metres)' },
];

const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4, 5];

/** Adds a movement the seed library does not cover — DESIGN.md §4.1 `isCustom`. */
export default function CustomExerciseScreen() {
  const { exercises } = useRepos();
  const invalidate = useInvalidate();
  const router = useRouter();

  const [name, setName] = useState('');
  const [pattern, setPattern] = useState<MovementPattern>('isolation');
  const [loadType, setLoadType] = useState<LoadType>('external');
  const [equipment, setEquipment] = useState<EquipmentCategory[]>(['dumbbell']);
  const [primaryMuscles, setPrimaryMuscles] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>(3);
  const [repMin, setRepMin] = useState('8');
  const [repMax, setRepMax] = useState('12');
  const [instructions, setInstructions] = useState('');
  const [cue, setCue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle<T>(list: T[], value: T, set: (next: T[]) => void) {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Give the exercise a name first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const min = parseNumber(repMin) ?? 8;
      const max = parseNumber(repMax) ?? Math.max(min, 12);
      await exercises.create({
        name: trimmed,
        slug: `${slugify(trimmed)}-custom`,
        movementPattern: pattern,
        primaryMuscles,
        secondaryMuscles: [],
        equipment,
        difficulty,
        instructions: instructions.trim(),
        cues: cue.trim().length > 0 ? [cue.trim()] : [],
        isCustom: true,
        loadType,
        defaultRepRange: { min: Math.round(min), max: Math.round(Math.max(min, max)) },
        archived: false,
      });
      await invalidate('saveExercise');
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that exercise.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScreenTitle>New exercise</ScreenTitle>
      <ScreenBlurb>
        Anything you add here is available to the planner, the substitution engine and your history
        exactly like a library movement.
      </ScreenBlurb>

      <View style={{ marginTop: space.lg }}>
        <TextField
          label="Name"
          placeholder="e.g. Landmine press"
          value={name}
          onChangeText={setName}
        />
      </View>

      <Caption>Movement pattern</Caption>
      <View style={{ marginTop: space.sm, marginBottom: space.lg }}>
        <ChipRow>
          {PATTERNS.map((value) => (
            <Chip
              key={value}
              label={patternLabel(value)}
              selected={pattern === value}
              onPress={() => setPattern(value)}
            />
          ))}
        </ChipRow>
      </View>

      <Caption>How it is loaded</Caption>
      <View style={{ marginTop: space.sm, marginBottom: space.lg }}>
        <ChipRow>
          {LOAD_TYPES.map((entry) => (
            <Chip
              key={entry.value}
              label={entry.label}
              selected={loadType === entry.value}
              onPress={() => setLoadType(entry.value)}
            />
          ))}
        </ChipRow>
      </View>

      <Caption>Equipment needed</Caption>
      <View style={{ marginTop: space.sm, marginBottom: space.lg }}>
        <ChipRow>
          {EQUIPMENT.map((value) => (
            <Chip
              key={value}
              label={titleCase(value)}
              selected={equipment.includes(value)}
              onPress={() => toggle(equipment, value, setEquipment)}
            />
          ))}
        </ChipRow>
      </View>

      <Caption>Primary muscles</Caption>
      <View style={{ marginTop: space.sm, marginBottom: space.lg }}>
        <ChipRow>
          {MUSCLES.map((value) => (
            <Chip
              key={value}
              label={titleCase(value)}
              selected={primaryMuscles.includes(value)}
              onPress={() => toggle(primaryMuscles, value, setPrimaryMuscles)}
            />
          ))}
        </ChipRow>
      </View>

      <Caption>Difficulty</Caption>
      <View style={{ marginTop: space.sm, marginBottom: space.lg }}>
        <ChipRow>
          {DIFFICULTIES.map((value) => (
            <Chip
              key={value}
              label={String(value)}
              selected={difficulty === value}
              onPress={() => setDifficulty(value)}
            />
          ))}
        </ChipRow>
      </View>

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Target from"
            keyboardType="number-pad"
            value={repMin}
            onChangeText={setRepMin}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Target to"
            keyboardType="number-pad"
            value={repMax}
            onChangeText={setRepMax}
          />
        </View>
      </View>

      <TextField
        label="How to do it"
        placeholder="Set-up, execution, what to avoid"
        multiline
        value={instructions}
        onChangeText={setInstructions}
        style={{ minHeight: 96, textAlignVertical: 'top' }}
      />

      <TextField
        label="Cue"
        placeholder="One short reminder, e.g. ribs down"
        value={cue}
        onChangeText={setCue}
      />

      {error ? <ErrorBanner message={error} /> : null}

      <Button label="Save exercise" onPress={save} loading={saving} />
    </Screen>
  );
}
