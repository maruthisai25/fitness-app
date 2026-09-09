/**
 * The readiness check-in — DESIGN.md §7.1 and §5.2.
 *
 * The card writes a `readiness` row, stores the score the engine computed and,
 * when pain is reported, lets the engine raise the `safety_events` row that
 * flips the safety state (DESIGN.md §5.2, §6.5). The modifier shown under the
 * score is exactly what the progression engine will read.
 */
import type { Scale1To5 } from '@vigor/core';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useSaveReadiness, type TodayBundle } from '../data/today';
import { Button, ErrorBanner, TextField, ToggleRow } from '../ui/components';
import { Body, Caption, Card, Chip, ChipRow, Numeral, WhyDisclosure } from '../ui/kit';
import { parseNumber } from '../ui/format';
import { color, fontSize, space } from '../ui/tokens';

const SCALE: readonly Scale1To5[] = [1, 2, 3, 4, 5];

const MODIFIER_COPY: Record<string, { label: string; tone: 'good' | 'warn' | 'bad'; line: string }> =
  {
    normal: { label: 'Normal', tone: 'good', line: 'Today runs as planned.' },
    hold: { label: 'Hold', tone: 'warn', line: 'Loads hold where they are today.' },
    reduce: { label: 'Reduce', tone: 'bad', line: 'Loads hold and volume comes down today.' },
    safety: { label: 'Safety', tone: 'bad', line: 'Progression is paused until the event is closed.' },
  };

interface Field {
  key: 'sleepQuality' | 'energy' | 'soreness' | 'fatigue' | 'stress';
  label: string;
  low: string;
  high: string;
}

const FIELDS: readonly Field[] = [
  { key: 'sleepQuality', label: 'Sleep quality', low: 'Broken', high: 'Deep' },
  { key: 'energy', label: 'Energy', low: 'Flat', high: 'Sharp' },
  { key: 'soreness', label: 'Soreness', low: 'None', high: 'Very sore' },
  { key: 'fatigue', label: 'Fatigue', low: 'Fresh', high: 'Wiped out' },
  { key: 'stress', label: 'Stress', low: 'Calm', high: 'Frazzled' },
];

export function ReadinessCard({ bundle }: { bundle: TodayBundle }) {
  const save = useSaveReadiness();
  const row = bundle.readinessRow;
  const [open, setOpen] = useState(row == null);
  const [sleepHours, setSleepHours] = useState(row?.sleepHours == null ? '' : String(row.sleepHours));
  const [values, setValues] = useState<Record<Field['key'], Scale1To5 | null>>({
    sleepQuality: row?.sleepQuality ?? null,
    energy: row?.energy ?? null,
    soreness: row?.soreness ?? null,
    fatigue: row?.fatigue ?? null,
    stress: row?.stress ?? null,
  });
  const [painReported, setPainReported] = useState(row?.painReported ?? false);
  const [painNote, setPainNote] = useState(row?.painNote ?? '');
  const [error, setError] = useState<string | null>(null);

  const modifier = MODIFIER_COPY[bundle.assessment.modifier] ?? MODIFIER_COPY.normal;

  async function submit() {
    setError(null);
    try {
      await save.mutateAsync({
        sleepHours: parseNumber(sleepHours),
        sleepQuality: values.sleepQuality,
        energy: values.energy,
        soreness: values.soreness,
        fatigue: values.fatigue,
        stress: values.stress,
        painReported,
        painNote: painReported && painNote.trim().length > 0 ? painNote.trim() : null,
      });
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your check-in.');
    }
  }

  if (!open) {
    return (
      <Card
        title="Readiness"
        subtitle={row == null ? 'Not checked in yet' : 'Checked in today'}
        action={
          <Text
            accessibilityRole="button"
            style={{ color: color.accent, fontSize: fontSize.label }}
            onPress={() => setOpen(true)}
          >
            Update
          </Text>
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.md }}>
          <Numeral
            value={bundle.assessment.score == null ? '—' : String(bundle.assessment.score)}
            unit="/100"
            tone={modifier.tone}
          />
          <Text style={{ color: color[modifier.tone], fontSize: fontSize.label }}>
            {modifier.label}
          </Text>
        </View>
        <Body muted>{modifier.line}</Body>
        <WhyDisclosure rationale={bundle.assessment.rationale} />
      </Card>
    );
  }

  return (
    <Card title="How are you today?" subtitle="Thirty seconds; it changes today's loads">
      <TextField
        label="Hours of sleep"
        placeholder="7.5"
        keyboardType="decimal-pad"
        value={sleepHours}
        onChangeText={setSleepHours}
      />

      {FIELDS.map((field) => (
        <View key={field.key} style={{ marginBottom: space.lg }}>
          <Caption>{`${field.label} · 1 ${field.low} → 5 ${field.high}`}</Caption>
          <View style={{ marginTop: space.sm }}>
            <ChipRow>
              {SCALE.map((value) => (
                <Chip
                  key={value}
                  label={String(value)}
                  selected={values[field.key] === value}
                  onPress={() =>
                    setValues((current) => ({
                      ...current,
                      [field.key]: current[field.key] === value ? null : value,
                    }))
                  }
                />
              ))}
            </ChipRow>
          </View>
        </View>
      ))}

      <ToggleRow
        label="Pain, or something that feels wrong"
        hint="Pauses progression and opens a safety event"
        value={painReported}
        onValueChange={setPainReported}
      />

      {painReported ? (
        <View style={{ marginTop: space.md }}>
          <TextField
            label="What is going on?"
            placeholder="Left shoulder, sharp on pressing"
            value={painNote}
            onChangeText={setPainNote}
          />
        </View>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}

      <Button label="Save check-in" onPress={submit} loading={save.isPending} />
      {row != null ? (
        <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
      ) : null}
    </Card>
  );
}
