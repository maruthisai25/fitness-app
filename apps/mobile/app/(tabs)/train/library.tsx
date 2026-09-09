import { useQuery } from '@tanstack/react-query';
import { queryKeys, type EquipmentCategory, type MovementPattern } from '@vigor/core';
import type { ExerciseSearchFilter } from '@vigor/db';
import { MUSCLES } from '@vigor/library';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useRepos } from '../../../src/db/AppDataProvider';
import { useVigorNavigation } from '../../../src/navigation';
import { Button, Screen, ScreenTitle, TextField } from '../../../src/ui/components';
import { patternLabel, titleCase } from '../../../src/ui/format';
import { Caption, Card, Chip, ChipRow, EmptyState, ListRow } from '../../../src/ui/kit';
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

/** How many rows the browser shows before asking for a narrower filter. */
const RESULT_LIMIT = 80;

/** The exercise library browser — DESIGN.md §7.1 "Train ... exercise library". */
export default function LibraryScreen() {
  const { exercises } = useRepos();
  const nav = useVigorNavigation();

  const [query, setQuery] = useState('');
  const [pattern, setPattern] = useState<MovementPattern | null>(null);
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<EquipmentCategory | null>(null);

  const filter: ExerciseSearchFilter = useMemo(
    () => ({
      query: query.trim() || undefined,
      pattern: pattern ?? undefined,
      muscle: muscle ?? undefined,
      equipment: equipment ? [equipment] : undefined,
      limit: RESULT_LIMIT,
    }),
    [query, pattern, muscle, equipment],
  );

  const results = useQuery({
    queryKey: queryKeys.exerciseSearch(JSON.stringify(filter)),
    queryFn: () => exercises.search(filter),
  });

  const rows = results.data ?? [];
  const filtersOn = Boolean(pattern || muscle || equipment || query.trim());

  return (
    <Screen>
      <ScreenTitle>Exercise library</ScreenTitle>

      <View style={{ marginTop: space.lg }}>
        <TextField
          label="Search"
          placeholder="Squat, row, plank…"
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <Caption>Movement pattern</Caption>
      <View style={{ marginTop: space.sm }}>
        <ChipRow>
          {PATTERNS.map((value) => (
            <Chip
              key={value}
              label={patternLabel(value)}
              selected={pattern === value}
              onPress={() => setPattern(pattern === value ? null : value)}
            />
          ))}
        </ChipRow>
      </View>

      <View style={{ marginTop: space.lg }}>
        <Caption>Muscle</Caption>
        <View style={{ marginTop: space.sm }}>
          <ChipRow>
            {MUSCLES.map((value) => (
              <Chip
                key={value}
                label={titleCase(value)}
                selected={muscle === value}
                onPress={() => setMuscle(muscle === value ? null : value)}
              />
            ))}
          </ChipRow>
        </View>
      </View>

      <View style={{ marginTop: space.lg }}>
        <Caption>Equipment</Caption>
        <View style={{ marginTop: space.sm }}>
          <ChipRow>
            {EQUIPMENT.map((value) => (
              <Chip
                key={value}
                label={titleCase(value)}
                selected={equipment === value}
                onPress={() => setEquipment(equipment === value ? null : value)}
              />
            ))}
          </ChipRow>
        </View>
      </View>

      {filtersOn ? (
        <View style={{ marginTop: space.md }}>
          <Button
            label="Clear filters"
            variant="secondary"
            onPress={() => {
              setQuery('');
              setPattern(null);
              setMuscle(null);
              setEquipment(null);
            }}
          />
        </View>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing matches those filters"
          blurb="Loosen one of them, or add the movement yourself as a custom exercise."
        />
      ) : (
        <Card
          title={`${rows.length}${rows.length === RESULT_LIMIT ? '+' : ''} exercises`}
          subtitle="Tap one for instructions, history and records"
        >
          {rows.map((exercise, index) => (
            <ListRow
              key={exercise.id}
              title={exercise.name}
              subtitle={`${patternLabel(exercise.movementPattern)} · ${exercise.primaryMuscles
                .map(titleCase)
                .join(', ')}`}
              trailing={exercise.isCustom ? <Caption>Custom</Caption> : undefined}
              onPress={() => nav.openExercise(exercise.id)}
              last={index === rows.length - 1}
            />
          ))}
        </Card>
      )}

      <Button
        label="Add a custom exercise"
        variant="secondary"
        onPress={() => nav.openCustomExercise()}
      />
    </Screen>
  );
}
