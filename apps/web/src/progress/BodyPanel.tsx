/**
 * Progress → Body. DESIGN.md §7.1 "body weight and measurements".
 *
 * DESIGN.md §5.10 and §11: the user types and reads display units, storage is
 * always canonical metric. Every conversion goes through `fromInput` and
 * `toDisplay` — this file never multiplies by 0.4536 itself.
 */

import {
  addDays,
  buildProgressSeries,
  fromInput,
  KNOWN_MEASUREMENT_KEYS,
  toDisplay,
  unitLabel,
  type BodyMeasurements,
  type BodyMetric,
  type LocalDate,
  type UnitSystem,
} from '@vigor/core';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { LineChart } from '../components/charts';
import { Field, PrimaryButton, TextInput } from '../components/form';
import { Card, EmptyState, Notice, Section, Stat } from '../components/ui';
import { useDb } from '../db/provider';
import { useInvalidate, useProfile } from '../eat/data';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { useBodyMetrics } from './data';

/** `chestCm` → `Chest`. The stored key always carries its canonical unit. */
export function measurementLabel(key: string): string {
  const stripped = key.replace(/Cm$/, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1).replace(/([A-Z])/g, ' $1');
}

/** The window "latest vs then" compares across — DESIGN.md §7.1. */
export const COMPARE_WINDOW_DAYS = 30;

/**
 * What `body.upsertMetric` merges into the row for that date. Only the keys
 * present are written; an absent key keeps whatever is already stored.
 */
interface BodyMetricPatch {
  date: LocalDate;
  weightKg?: number;
  waistCm?: number;
  measurements?: BodyMeasurements;
  notes?: string;
}

interface BodyDraft {
  date: LocalDate;
  weight: string;
  waist: string;
  measurements: Record<string, string>;
  notes: string;
}

function blankDraft(date: LocalDate): BodyDraft {
  return {
    date,
    weight: '',
    waist: '',
    measurements: Object.fromEntries(KNOWN_MEASUREMENT_KEYS.map((key) => [key, ''])),
    notes: '',
  };
}

export function BodyPanel({ today }: { today: LocalDate }): ReactNode {
  const { repos } = useDb();
  const invalidate = useInvalidate();
  const profile = useProfile();
  const metrics = useBodyMetrics(today);
  const unitSystem: UnitSystem = profile.data?.unitSystem ?? 'metric';

  const [draft, setDraft] = useState<BodyDraft>(() => blankDraft(today));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const rows = metrics.data ?? [];
  const latest = rows.length > 0 ? rows[rows.length - 1] : null;
  const then = useMemo(() => earlierMetric(rows, today), [rows, today]);

  const weightSeries = useMemo(
    () =>
      buildProgressSeries({
        metric: 'body_weight',
        from: addDays(today, -365),
        to: today,
        unitSystem,
        bodyMetrics: rows,
      }),
    [rows, today, unitSystem],
  );

  const waistSeries = useMemo(
    () =>
      buildProgressSeries({
        metric: 'waist',
        from: addDays(today, -365),
        to: today,
        unitSystem,
        bodyMetrics: rows,
      }),
    [rows, today, unitSystem],
  );

  /**
   * A day's entry is built up over several visits — the scale in the morning,
   * the tape measure later. So the patch carries only the fields that were
   * actually typed, and measurements merge into the ones already stored for
   * that date. A blank field means "leave it alone", never "clear it".
   */
  async function save(): Promise<void> {
    setBusy(true);
    try {
      const existing = await repos.body.getMetricByDate(draft.date);
      const patch: BodyMetricPatch = { date: draft.date };

      const measurements: BodyMeasurements = { ...(existing?.measurements ?? {}) };
      let measurementTyped = false;
      for (const [key, value] of Object.entries(draft.measurements)) {
        const typed = Number(value);
        if (!value.trim() || !Number.isFinite(typed)) continue;
        measurements[key] = fromInput(typed, 'length', unitSystem);
        measurementTyped = true;
      }
      if (measurementTyped) patch.measurements = measurements;

      const weightTyped = Number(draft.weight);
      if (draft.weight.trim() && Number.isFinite(weightTyped)) {
        patch.weightKg = fromInput(weightTyped, 'weight', unitSystem);
      }
      const waistTyped = Number(draft.waist);
      if (draft.waist.trim() && Number.isFinite(waistTyped)) {
        patch.waistCm = fromInput(waistTyped, 'length', unitSystem);
      }
      if (draft.notes.trim()) patch.notes = draft.notes.trim();

      await repos.body.upsertMetric(patch);
      await invalidate('saveBodyMetric');
      setDraft(blankDraft(today));
      setNote('Saved. Stored in metric, shown in your units.');
    } finally {
      setBusy(false);
    }
  }

  const weightUnit = unitLabel('weight', unitSystem);
  const lengthUnit = unitLabel('length', unitSystem);

  return (
    <div>
      <Section title="Log a measurement">
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: space.md }}>
            <Field label="Date">
              <input
                type="date"
                aria-label="Measurement date"
                value={draft.date}
                onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                className="tabular"
                style={{
                  width: '100%',
                  padding: `${space.sm}px ${space.md}px`,
                  borderRadius: 6,
                  border: `1px solid ${themeColor.border}`,
                  background: themeColor.surface,
                  color: themeColor.text,
                  fontSize: fontSize.body,
                }}
              />
            </Field>
            <Field label={`Body weight (${weightUnit})`}>
              <TextInput
                value={draft.weight}
                onChange={(value) => setDraft({ ...draft, weight: value })}
                inputMode="decimal"
              />
            </Field>
            <Field label={`Waist (${lengthUnit})`}>
              <TextInput
                value={draft.waist}
                onChange={(value) => setDraft({ ...draft, waist: value })}
                inputMode="decimal"
              />
            </Field>
            {KNOWN_MEASUREMENT_KEYS.map((key) => (
              <Field key={key} label={`${measurementLabel(key)} (${lengthUnit})`}>
                <TextInput
                  value={draft.measurements[key] ?? ''}
                  onChange={(value) =>
                    setDraft({
                      ...draft,
                      measurements: { ...draft.measurements, [key]: value },
                    })
                  }
                  inputMode="decimal"
                />
              </Field>
            ))}
          </div>
          <Field label="Notes">
            <TextInput
              value={draft.notes}
              onChange={(value) => setDraft({ ...draft, notes: value })}
              placeholder="Measured first thing, before breakfast"
            />
          </Field>
          <PrimaryButton onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save measurement'}
          </PrimaryButton>
          {note && (
            <p style={{ color: themeColor.good, fontSize: fontSize.label }} role="status">
              {note}
            </p>
          )}
        </Card>
      </Section>

      <Section title={`Latest vs ${COMPARE_WINDOW_DAYS} days ago`}>
        {latest == null ? (
          <EmptyState>Nothing logged yet. The first entry becomes your baseline.</EmptyState>
        ) : (
          <Card>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: space.lg,
              }}
            >
              <Compare
                label="Body weight"
                nowKg={latest.weightKg}
                thenKg={then?.weightKg ?? null}
                kind="weight"
                unitSystem={unitSystem}
              />
              <Compare
                label="Waist"
                nowKg={latest.waistCm}
                thenKg={then?.waistCm ?? null}
                kind="length"
                unitSystem={unitSystem}
              />
              {Object.keys(latest.measurements).map((key) => (
                <Compare
                  key={key}
                  label={measurementLabel(key)}
                  nowKg={latest.measurements[key] ?? null}
                  thenKg={then?.measurements[key] ?? null}
                  kind="length"
                  unitSystem={unitSystem}
                />
              ))}
            </div>
            <p
              className="tabular"
              style={{
                margin: `${space.md}px 0 0`,
                color: themeColor.textMuted,
                fontSize: fontSize.caption,
              }}
            >
              Latest {latest.date}
              {then ? ` · compared with ${then.date}` : ' · no earlier entry to compare with yet'}
            </p>
          </Card>
        )}
      </Section>

      <Section title="Trend">
        <LineChart
          title={weightSeries.label}
          subtitle={weightSeries.rationale.summary}
          unit={weightSeries.unit}
          points={weightSeries.points.map((point) => ({ label: point.date, value: point.display }))}
        />
        {waistSeries.points.length > 0 && (
          <div style={{ marginTop: space.xl }}>
            <LineChart
              title={waistSeries.label}
              subtitle={waistSeries.rationale.summary}
              unit={waistSeries.unit}
              points={waistSeries.points.map((point) => ({
                label: point.date,
                value: point.display,
              }))}
            />
          </div>
        )}
        <div style={{ marginTop: space.md }}>
          <Notice>
            Everything here is stored in kilograms and centimetres; your unit choice in You →
            Profile only changes what you read and type.
          </Notice>
        </div>
      </Section>
    </div>
  );
}

/** The last entry on or before `today - COMPARE_WINDOW_DAYS`. */
export function earlierMetric(
  rows: readonly BodyMetric[],
  today: LocalDate,
): BodyMetric | null {
  const cutoff = addDays(today, -COMPARE_WINDOW_DAYS);
  let best: BodyMetric | null = null;
  for (const row of rows) {
    if (row.date <= cutoff && (best == null || row.date > best.date)) best = row;
  }
  return best;
}

function Compare({
  label,
  nowKg,
  thenKg,
  kind,
  unitSystem,
}: {
  label: string;
  nowKg: number | null;
  thenKg: number | null;
  kind: 'weight' | 'length';
  unitSystem: UnitSystem;
}): ReactNode {
  if (nowKg == null) return null;
  const now = toDisplay(nowKg, kind, unitSystem);
  const before = thenKg == null ? null : toDisplay(thenKg, kind, unitSystem);
  const delta = before == null ? null : Math.round((now - before) * 10) / 10;
  return (
    <div>
      <Stat label={label} value={String(now)} unit={unitLabel(kind, unitSystem)} />
      <div
        className="tabular"
        style={{
          fontSize: fontSize.caption,
          color: delta == null ? themeColor.textFaint : delta === 0 ? themeColor.textMuted : themeColor.text,
        }}
      >
        {delta == null
          ? 'no earlier entry'
          : `${delta > 0 ? '+' : ''}${delta} ${unitLabel(kind, unitSystem)} vs ${before}`}
      </div>
    </div>
  );
}
