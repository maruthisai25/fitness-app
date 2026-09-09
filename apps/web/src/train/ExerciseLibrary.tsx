/**
 * Exercise library browser — DESIGN.md §7.1 Train: search, filter by pattern,
 * muscle and equipment, and add a custom exercise. Filtering happens in SQL
 * through `exercises.search` (DESIGN.md §4.2), not in the component.
 */

import { radius, space } from '@vigor/ui-tokens';
import type { EquipmentCategory, LoadType, MovementPattern } from '@vigor/core';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router';

import { Card, EmptyState, Pill, SectionHeading } from '../components/ui';
import { useExerciseSearch, useInvalidate, useRepos } from '../data/hooks';
import { humanize } from '../lib/display';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

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

const LOAD_TYPES: readonly LoadType[] = [
  'external',
  'bodyweight',
  'assisted',
  'band',
  'time',
  'distance',
];

export function ExerciseLibrary(): ReactNode {
  const [query, setQuery] = useState('');
  const [pattern, setPattern] = useState<MovementPattern | null>(null);
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState<EquipmentCategory[]>([]);
  const [adding, setAdding] = useState(false);

  const { data: results = [], isPending } = useExerciseSearch({
    query: query.trim() || undefined,
    pattern: pattern ?? undefined,
    muscle: muscle.trim() || undefined,
    equipment: equipment.length > 0 ? equipment : undefined,
    limit: 200,
  });

  return (
    <div>
      <SectionHeading
        actions={
          <button type="button" onClick={() => setAdding((value) => !value)} style={linkButton}>
            {adding ? 'Cancel' : 'Add a custom exercise'}
          </button>
        }
      >
        Exercise library
      </SectionHeading>

      {adding && <CustomExerciseForm onDone={() => setAdding(false)} />}

      <Card style={{ marginBottom: space.lg }}>
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>Search</span>
          <input
            aria-label="Search exercises"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Squat, row, curl…"
            style={{ ...inputStyle, width: '100%' }}
          />
        </label>

        <label style={{ display: 'block', marginTop: space.md }}>
          <span style={fieldLabel}>Muscle</span>
          <input
            aria-label="Filter by muscle"
            value={muscle}
            onChange={(event) => setMuscle(event.target.value)}
            placeholder="quads, lats, glutes…"
            style={{ ...inputStyle, width: '100%' }}
          />
        </label>

        <div style={{ marginTop: space.md }}>
          <span style={fieldLabel}>Movement pattern</span>
          <div style={{ display: 'flex', gap: space.xs, flexWrap: 'wrap' }}>
            {PATTERNS.map((value) => (
              <Pill
                key={value}
                pressed={pattern === value}
                onClick={() => setPattern(pattern === value ? null : value)}
              >
                {humanize(value)}
              </Pill>
            ))}
          </div>
        </div>

        <div style={{ marginTop: space.md }}>
          <span style={fieldLabel}>Equipment</span>
          <div style={{ display: 'flex', gap: space.xs, flexWrap: 'wrap' }}>
            {EQUIPMENT.map((value) => (
              <Pill
                key={value}
                pressed={equipment.includes(value)}
                onClick={() =>
                  setEquipment((current) =>
                    current.includes(value)
                      ? current.filter((item) => item !== value)
                      : [...current, value],
                  )
                }
              >
                {humanize(value)}
              </Pill>
            ))}
          </div>
        </div>
      </Card>

      {isPending && <p style={{ color: themeColor.textMuted }}>Searching…</p>}

      {!isPending && results.length === 0 && (
        <EmptyState>
          Nothing matches those filters. Clear one, or add the movement as a custom exercise.
        </EmptyState>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: space.sm }}>
        {results.map((exercise) => (
          <li key={exercise.id}>
            <Link
              to={`/train/exercise/${exercise.id}`}
              style={{
                display: 'block',
                padding: space.md,
                borderRadius: radius.md,
                border: `1px solid ${themeColor.border}`,
                background: themeColor.surface,
                textDecoration: 'none',
              }}
            >
              <span style={{ color: themeColor.text, fontSize: fontSize.subheading }}>
                {exercise.name}
              </span>
              {exercise.isCustom && (
                <span style={{ color: themeColor.accent, fontSize: fontSize.caption }}>
                  {' '}
                  custom
                </span>
              )}
              <span
                style={{
                  display: 'block',
                  color: themeColor.textMuted,
                  fontSize: fontSize.label,
                }}
              >
                {humanize(exercise.movementPattern)} · {exercise.primaryMuscles.join(', ') || '—'} ·{' '}
                {exercise.equipment.map(humanize).join(', ') || 'bodyweight'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function CustomExerciseForm({ onDone }: { onDone: () => void }): ReactNode {
  const repos = useRepos();
  const invalidate = useInvalidate();
  const [name, setName] = useState('');
  const [pattern, setPattern] = useState<MovementPattern>('isolation');
  const [loadType, setLoadType] = useState<LoadType>('external');
  const [primaryMuscles, setPrimaryMuscles] = useState('');
  const [equipment, setEquipment] = useState<EquipmentCategory[]>(['dumbbell']);
  const [instructions, setInstructions] = useState('');
  const [cues, setCues] = useState('');
  const [repMin, setRepMin] = useState('8');
  const [repMax, setRepMax] = useState('12');
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    if (name.trim() === '') return;
    setBusy(true);
    try {
      await repos.exercises.create({
        name: name.trim(),
        slug: slugify(name),
        movementPattern: pattern,
        loadType,
        primaryMuscles: primaryMuscles
          .split(',')
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
        secondaryMuscles: [],
        equipment,
        instructions: instructions.trim(),
        cues: cues
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
        defaultRepRange: { min: Number(repMin) || 8, max: Number(repMax) || 12 },
        isCustom: true,
      });
      await invalidate('saveExercise');
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionHeading>New custom exercise</SectionHeading>
      <label style={{ display: 'block' }}>
        <span style={fieldLabel}>Name</span>
        <input
          aria-label="Exercise name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          style={{ ...inputStyle, width: '100%' }}
        />
      </label>

      <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap', marginTop: space.md }}>
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>Movement pattern</span>
          <select
            aria-label="Movement pattern"
            value={pattern}
            onChange={(event) => setPattern(event.target.value as MovementPattern)}
            style={inputStyle}
          >
            {PATTERNS.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>Load type</span>
          <select
            aria-label="Load type"
            value={loadType}
            onChange={(event) => setLoadType(event.target.value as LoadType)}
            style={inputStyle}
          >
            {LOAD_TYPES.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>Rep range</span>
          <span style={{ display: 'flex', gap: space.xs, alignItems: 'center' }}>
            <input
              aria-label="Rep range minimum"
              inputMode="numeric"
              value={repMin}
              onChange={(event) => setRepMin(event.target.value)}
              style={{ ...inputStyle, width: 70 }}
            />
            <span style={{ color: themeColor.textMuted }}>to</span>
            <input
              aria-label="Rep range maximum"
              inputMode="numeric"
              value={repMax}
              onChange={(event) => setRepMax(event.target.value)}
              style={{ ...inputStyle, width: 70 }}
            />
          </span>
        </label>
      </div>

      <label style={{ display: 'block', marginTop: space.md }}>
        <span style={fieldLabel}>Primary muscles</span>
        <input
          aria-label="Primary muscles"
          value={primaryMuscles}
          onChange={(event) => setPrimaryMuscles(event.target.value)}
          placeholder="quads, glutes"
          style={{ ...inputStyle, width: '100%' }}
        />
      </label>

      <div style={{ marginTop: space.md }}>
        <span style={fieldLabel}>Equipment</span>
        <div style={{ display: 'flex', gap: space.xs, flexWrap: 'wrap' }}>
          {EQUIPMENT.map((value) => (
            <Pill
              key={value}
              pressed={equipment.includes(value)}
              onClick={() =>
                setEquipment((current) =>
                  current.includes(value)
                    ? current.filter((item) => item !== value)
                    : [...current, value],
                )
              }
            >
              {humanize(value)}
            </Pill>
          ))}
        </div>
      </div>

      <label style={{ display: 'block', marginTop: space.md }}>
        <span style={fieldLabel}>How to do it</span>
        <textarea
          aria-label="Instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={3}
          style={{ ...inputStyle, width: '100%' }}
        />
      </label>

      <label style={{ display: 'block', marginTop: space.md }}>
        <span style={fieldLabel}>Cues, one per line</span>
        <textarea
          aria-label="Cues"
          value={cues}
          onChange={(event) => setCues(event.target.value)}
          rows={3}
          style={{ ...inputStyle, width: '100%' }}
        />
      </label>

      <button
        type="button"
        disabled={busy || name.trim() === ''}
        onClick={() => void save()}
        style={{
          marginTop: space.md,
          padding: `${space.sm}px ${space.lg}px`,
          borderRadius: radius.md,
          border: 'none',
          background: themeColor.accent,
          color: themeColor.textOnAccent,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {busy ? 'Saving…' : 'Save exercise'}
      </button>
    </Card>
  );
}

const fieldLabel = {
  display: 'block',
  fontSize: fontSize.label,
  color: themeColor.textMuted,
  marginBottom: space.xs,
} as const;

const inputStyle = {
  padding: `${space.sm}px ${space.md}px`,
  borderRadius: radius.sm,
  border: `1px solid ${themeColor.border}`,
  background: themeColor.surfaceRaised,
  color: themeColor.text,
  fontSize: fontSize.body,
} as const;

const linkButton = {
  background: 'none',
  border: 'none',
  color: themeColor.accent,
  fontSize: fontSize.label,
  cursor: 'pointer',
  padding: 0,
} as const;
