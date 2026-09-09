/**
 * Logging body weight and measurements.
 *
 * The user types in whatever units their profile says (DESIGN.md §1); storage
 * is always canonical metric (§4). `fromInput` and `toDisplay` from
 * `@vigor/core/units` are the only converters — this form never multiplies by
 * 2.2 itself — so what you type comes back exactly as you typed it.
 */
import { useState } from 'react';
import { View } from 'react-native';

import {
  KNOWN_MEASUREMENT_KEYS,
  fromInput,
  toDisplay,
  unitLabel,
  type BodyMetric,
  type LocalDate,
  type UnitSystem,
} from '@vigor/core';

import { useInvalidator } from '../data/queries';
import type { AppRepos } from '../db/AppDataProvider';
import { Button, ErrorBanner } from '../ui/components';
import { Caption, Card, CardTitle, Note, NumberField } from '../ui/primitives';

/** The circumference fields offered before any custom ones. */
export const MEASUREMENT_LABELS: Record<string, string> = {
  chestCm: 'Chest',
  hipsCm: 'Hips',
  armCm: 'Arm',
  thighCm: 'Thigh',
  calfCm: 'Calf',
  neckCm: 'Neck',
};

type Fields = { weight: string; waist: string } & Record<string, string>;

function emptyFields(): Fields {
  const fields: Fields = { weight: '', waist: '' };
  for (const key of KNOWN_MEASUREMENT_KEYS) fields[key] = '';
  return fields;
}

/** Stored metric row → the numbers this profile should see. */
export function fieldsFromMetric(metric: BodyMetric | null, unitSystem: UnitSystem): Fields {
  const fields = emptyFields();
  if (!metric) return fields;
  if (metric.weightKg != null) {
    fields.weight = String(toDisplay(metric.weightKg, 'weight', unitSystem));
  }
  if (metric.waistCm != null) {
    fields.waist = String(toDisplay(metric.waistCm, 'length', unitSystem));
  }
  for (const key of KNOWN_MEASUREMENT_KEYS) {
    const value = metric.measurements[key];
    if (value != null) fields[key] = String(toDisplay(value, 'length', unitSystem));
  }
  return fields;
}

function parse(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number.parseFloat(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export interface BodyMetricFormProps {
  repos: AppRepos;
  date: LocalDate;
  unitSystem: UnitSystem;
  /** The row already stored for `date`, so editing starts from it. */
  initial?: BodyMetric | null;
  onSaved?: (metric: BodyMetric) => void;
}

export function BodyMetricForm({
  repos,
  date,
  unitSystem,
  initial = null,
  onSaved,
}: BodyMetricFormProps) {
  const invalidate = useInvalidator();
  const [fields, setFields] = useState<Fields>(() => fieldsFromMetric(initial, unitSystem));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const weightUnit = unitLabel('weight', unitSystem);
  const lengthUnit = unitLabel('length', unitSystem);

  function set(key: string, value: string): void {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function save(): Promise<void> {
    const weight = parse(fields.weight);
    const waist = parse(fields.waist);
    const entered = new Map<string, number>();
    for (const key of KNOWN_MEASUREMENT_KEYS) {
      const value = parse(fields[key]);
      if (value != null) entered.set(key, fromInput(value, 'length', unitSystem));
    }

    if (weight == null && waist == null && entered.size === 0) {
      setError('Fill in at least one number before saving.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // `measurements` is one JSON blob, so a save replaces the whole map.
      // Seed it from what is already stored — the coach, an import or a future
      // custom field can put keys in there that this form does not render —
      // and only overwrite (or clear) the keys that are on screen.
      const stored = await repos.body.getMetricByDate(date);
      const measurements: Record<string, number> = { ...(stored?.measurements ?? {}) };
      for (const key of KNOWN_MEASUREMENT_KEYS) {
        const value = entered.get(key);
        if (value == null) delete measurements[key];
        else measurements[key] = value;
      }

      const saved = await repos.body.upsertMetric({
        date,
        weightKg: weight == null ? null : fromInput(weight, 'weight', unitSystem),
        waistCm: waist == null ? null : fromInput(waist, 'length', unitSystem),
        measurements,
      });
      invalidate('saveBodyMetric');
      // Re-derive from what was actually stored, so the round trip is visible.
      setFields(fieldsFromMetric(saved, unitSystem));
      setStatus(`Saved for ${date}.`);
      onSaved?.(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle>{`Log for ${date}`}</CardTitle>
      <Caption>
        {unitSystem === 'imperial'
          ? 'Pounds and inches, converted to kilograms and centimetres for storage.'
          : 'Kilograms and centimetres.'}
      </Caption>

      {error ? <ErrorBanner message={error} /> : null}
      {status ? <Note tone="good">{status}</Note> : null}

      <NumberField
        label="Weight"
        suffix={weightUnit}
        value={fields.weight}
        onChangeText={(value) => set('weight', value)}
      />
      <NumberField
        label="Waist"
        suffix={lengthUnit}
        value={fields.waist}
        onChangeText={(value) => set('waist', value)}
      />

      <View>
        {KNOWN_MEASUREMENT_KEYS.map((key) => (
          <NumberField
            key={key}
            label={MEASUREMENT_LABELS[key] ?? key}
            suffix={lengthUnit}
            value={fields[key]}
            onChangeText={(value) => set(key, value)}
          />
        ))}
      </View>

      <Button label="Save measurements" onPress={() => void save()} loading={busy} />
    </Card>
  );
}
