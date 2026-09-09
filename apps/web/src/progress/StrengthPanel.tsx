/**
 * Progress → Strength. DESIGN.md §7.1: "strength charts (e1RM per exercise)".
 *
 * Both charts come straight out of `buildProgressSeries`, and the header
 * numbers out of `buildExerciseStats` (DESIGN.md §7.2). This component picks an
 * exercise and draws; it computes nothing.
 */

import {
  addDays,
  buildExerciseStats,
  buildProgressSeries,
  formatLoad,
  type Id,
  type LocalDate,
  type PersonalRecordKind,
  type UnitSystem,
} from '@vigor/core';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { BarChart, LineChart, shortDate } from '../components/charts';
import { Field, Select } from '../components/form';
import { Card, EmptyState, Pill, Section, Stat } from '../components/ui';
import { useProfile } from '../eat/data';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import {
  PROGRESS_WINDOW_DAYS,
  useExerciseHistory,
  usePersonalRecords,
  useTrainedExercises,
} from './data';

const PR_LABEL: Record<PersonalRecordKind, string> = {
  e1rm: 'Estimated 1RM',
  max_load: 'Heaviest load',
  max_reps_at_load: 'Most reps at a load',
  session_volume: 'Best session volume',
};

/** DESIGN.md §5.7 — celebrate these two loudly, list the rest quietly. */
const LOUD_KINDS: readonly PersonalRecordKind[] = ['e1rm', 'max_load'];

export function StrengthPanel({ today }: { today: LocalDate }): ReactNode {
  const exercises = useTrainedExercises();
  const profile = useProfile();
  const [exerciseId, setExerciseId] = useState<Id | null>(null);

  useEffect(() => {
    if (exerciseId == null && exercises.data && exercises.data.length > 0) {
      setExerciseId(exercises.data[0].id);
    }
  }, [exercises.data, exerciseId]);

  const history = useExerciseHistory(exerciseId);
  const records = usePersonalRecords(exerciseId);
  const unitSystem: UnitSystem = profile.data?.unitSystem ?? 'metric';
  const exercise = (exercises.data ?? []).find((row) => row.id === exerciseId) ?? null;

  const stats = useMemo(() => {
    if (!exercise) return null;
    return buildExerciseStats({
      exercise,
      sessions: history.data ?? [],
      personalRecords: records.data ?? [],
      unitSystem,
    });
  }, [exercise, history.data, records.data, unitSystem]);

  const e1rmSeries = useMemo(() => {
    if (!exercise) return null;
    return buildProgressSeries({
      metric: 'e1rm',
      from: addDays(today, -PROGRESS_WINDOW_DAYS),
      to: today,
      unitSystem,
      sessions: history.data ?? [],
      exerciseName: exercise.name,
    });
  }, [exercise, history.data, today, unitSystem]);

  const volumeSeries = useMemo(() => {
    if (!exercise) return null;
    return buildProgressSeries({
      metric: 'session_volume',
      from: addDays(today, -PROGRESS_WINDOW_DAYS),
      to: today,
      unitSystem,
      sessions: history.data ?? [],
    });
  }, [exercise, history.data, today, unitSystem]);

  if (exercises.isPending) return <EmptyState>Loading your training history…</EmptyState>;
  if ((exercises.data ?? []).length === 0) {
    return (
      <EmptyState>
        No completed sets in the last {PROGRESS_WINDOW_DAYS} days, so there is nothing to chart yet.
        Log a session in Train and the curves start here.
      </EmptyState>
    );
  }

  return (
    <div>
      <div style={{ maxWidth: 360 }}>
        <Field label="Exercise">
          <Select value={exerciseId ?? ''} onChange={(value) => setExerciseId(value)}>
            {(exercises.data ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {stats && (
        <Card style={{ marginBottom: space.xl }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
              gap: space.lg,
            }}
          >
            <Stat
              label="Best estimated 1RM"
              value={
                stats.bestE1rmKg == null ? '—' : formatLoad(stats.bestE1rmKg, unitSystem).split(' ')[0]
              }
              unit={stats.bestE1rmKg == null ? undefined : unitSystem === 'imperial' ? 'lb' : 'kg'}
              tone="accent"
            />
            <Stat
              label="Heaviest load"
              value={
                stats.bestLoadKg == null ? '—' : formatLoad(stats.bestLoadKg, unitSystem).split(' ')[0]
              }
              unit={stats.bestLoadKg == null ? undefined : unitSystem === 'imperial' ? 'lb' : 'kg'}
            />
            <Stat label="Sessions" value={String(stats.sessionCount)} />
            <Stat label="Working sets" value={String(stats.totalSets)} />
            <Stat
              label="Trend"
              value={
                stats.e1rmTrendKgPerWeek == null
                  ? '—'
                  : `${stats.e1rmTrendKgPerWeek > 0 ? '+' : ''}${stats.e1rmTrendKgPerWeek.toFixed(2)}`
              }
              unit={stats.e1rmTrendKgPerWeek == null ? undefined : 'kg/week'}
              tone={
                stats.e1rmTrendKgPerWeek == null
                  ? 'text'
                  : stats.e1rmTrendKgPerWeek >= 0
                    ? 'good'
                    : 'warn'
              }
            />
          </div>
          <p
            style={{
              margin: `${space.md}px 0 0`,
              color: themeColor.textMuted,
              fontSize: fontSize.label,
              lineHeight: 1.5,
            }}
          >
            {stats.rationale.summary}
          </p>
        </Card>
      )}

      <Section title="Estimated 1RM over time">
        {e1rmSeries && (
          <LineChart
            title={e1rmSeries.label}
            subtitle={e1rmSeries.rationale.summary}
            unit={e1rmSeries.unit}
            points={e1rmSeries.points.map((point) => ({ label: point.date, value: point.display }))}
          />
        )}
      </Section>

      <Section title="Volume per session">
        {volumeSeries && (
          <BarChart
            title={volumeSeries.label}
            subtitle={`Working-set volume for ${exercise?.name ?? 'this exercise'}.`}
            unit={volumeSeries.unit}
            points={volumeSeries.points.map((point) => ({
              label: point.date,
              value: point.display,
            }))}
            labelEvery={Math.max(1, Math.ceil((volumeSeries.points.length || 1) / 8))}
          />
        )}
      </Section>

      <Section title="Personal records">
        {(records.data ?? []).length === 0 ? (
          <EmptyState>No records for this exercise yet.</EmptyState>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {(records.data ?? []).map((record) => {
              const loud = LOUD_KINDS.includes(record.kind);
              return (
                <li
                  key={record.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: space.md,
                    padding: `${space.sm}px 0`,
                    borderTop: `1px solid ${themeColor.border}`,
                  }}
                >
                  <span
                    style={{
                      color: loud ? themeColor.text : themeColor.textMuted,
                      fontSize: fontSize.label,
                      fontWeight: loud ? 600 : 400,
                    }}
                  >
                    {PR_LABEL[record.kind]}
                  </span>
                  <span style={{ display: 'flex', gap: space.md, alignItems: 'center' }}>
                    <span
                      className="tabular"
                      style={{
                        color: loud ? themeColor.accent : themeColor.textMuted,
                        fontSize: fontSize.label,
                      }}
                    >
                      {record.kind === 'max_reps_at_load'
                        ? `${record.value} reps at ${formatLoad(record.loadKg ?? 0, unitSystem)}`
                        : formatLoad(record.value, unitSystem)}
                    </span>
                    <Pill tone={loud ? 'accent' : 'muted'}>{shortDate(record.date)}</Pill>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
