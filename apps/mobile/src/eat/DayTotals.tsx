/**
 * Consumed / remaining / fiber against the active targets — DESIGN.md §5.6.
 *
 * The signed `remaining` is what the database stores; the UI shows the clamped
 * version, and says plainly when a target has been passed.
 */
import { View } from 'react-native';

import { clampMacros, type DayNutrition, type MacroTotals } from '@vigor/core';

import { Body, Caption, Card, CardTitle, DataRow, MeterBar, Note } from '../ui/primitives';

const ROWS: { key: keyof MacroTotals; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'carbsG', label: 'Carbs', unit: 'g' },
  { key: 'fatG', label: 'Fat', unit: 'g' },
  { key: 'fiberG', label: 'Fiber', unit: 'g' },
];

export function DayTotals({
  day,
  onOpenTargets,
}: {
  day: DayNutrition;
  onOpenTargets?: () => void;
}) {
  const remaining = clampMacros(day.remaining);

  if (!day.targets) {
    return (
      <Card onPress={onOpenTargets}>
        <CardTitle>No targets yet</CardTitle>
        <Body>
          {`You have eaten ${Math.round(day.consumed.kcal)} kcal and ${Math.round(
            day.consumed.proteinG,
          )} g of protein today.`}
        </Body>
        <Note>Set daily targets to see what is left. Tap here to open Targets.</Note>
      </Card>
    );
  }

  const targets = day.targets;
  const over = ROWS.filter((row) => day.remaining[row.key] < 0);

  return (
    <Card>
      <CardTitle>Today against your targets</CardTitle>
      <Caption>{`Targets effective from ${targets.effectiveFrom} · ${
        targets.source === 'computed' ? 'recommended' : 'your own numbers'
      }`}</Caption>
      {ROWS.map((row) => (
        <View key={row.key}>
          <DataRow
            label={row.label}
            value={`${Math.round(day.consumed[row.key])} / ${Math.round(targets[row.key])} ${row.unit}`}
            hint={`${Math.round(remaining[row.key])} ${row.unit} left`}
            tone={
              day.remaining[row.key] < 0 ? 'warn' : remaining[row.key] === 0 ? 'good' : 'neutral'
            }
          />
          <MeterBar
            value={day.consumed[row.key]}
            max={targets[row.key]}
            tone={day.remaining[row.key] < 0 ? 'warn' : 'accent'}
          />
        </View>
      ))}
      {over.length > 0 ? (
        <Note tone="warn">
          {`Past target on ${over.map((row) => row.label.toLowerCase()).join(', ')}. That is stored as a negative remainder, not hidden.`}
        </Note>
      ) : null}
    </Card>
  );
}
