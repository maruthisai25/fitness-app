/**
 * Manual workout builder — DESIGN.md §7.1 Train, §9 phase 1. It starts from the
 * rule-based planner's draft (§5.4) so the loads and rep targets are the
 * progression engine's, then lets the user add, remove, reorder and adjust.
 * Saving writes a `planned` workout through `workouts.createPlanned` (§4.2).
 */

import { radius, space } from '@vigor/ui-tokens';
import {
  decideProgression,
  exerciseCostSeconds,
  makeRationale,
  type Equipment,
  type Exercise,
  type Id,
  type ProgressionDecision,
  type UnitSystem,
  type WorkoutPlanExercise,
} from '@vigor/core';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { Card, EmptyState, PageHeading, SectionHeading, WhyDisclosure } from '../components/ui';
import {
  useEquipment,
  useExerciseIndex,
  useExercises,
  useInvalidate,
  useRepos,
  useUnitSystem,
} from '../data/hooks';
import { countFromText, loadFromText, loadUnit, loadValue, repUnitShort } from '../lib/display';
import { incrementKgFor } from '../lib/increments';
import { todayLocalDate } from '../lib/localDate';
import { sessionPath } from '../session/SessionMode';
import { buildPlanDraft } from '../today/plan';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

interface Row {
  key: string;
  exerciseId: Id;
  targetSets: string;
  repMin: string;
  repMax: string;
  /** Display units — converted back to canonical kg on save. */
  load: string;
  restSec: string;
  progressionDecision: ProgressionDecision | null;
}

export function WorkoutBuilder(): ReactNode {
  const repos = useRepos();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const unitSystem = useUnitSystem();
  const exerciseIndex = useExerciseIndex();
  const exercisesQuery = useExercises();
  const equipmentQuery = useEquipment();
  const allExercises = exercisesQuery.data ?? [];
  const equipment = equipmentQuery.data ?? [];
  const draftLoaded = useRef(false);

  const [date] = useState(todayLocalDate);
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [planSummary, setPlanSummary] = useState<string | null>(null);
  const [rationaleCodes, setRationaleCodes] = useState<string[]>([]);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  // The draft is fetched once, as soon as the library and equipment are in
  // hand; every edit from then on belongs to the user.
  useEffect(() => {
    if (draftLoaded.current) return;
    if (!exercisesQuery.isSuccess || !equipmentQuery.isSuccess) return;
    draftLoaded.current = true;
    const index = new Map(allExercises.map((exercise) => [exercise.id, exercise]));
    void buildPlanDraft(repos, { date })
      .then(({ plan, profile }) => {
        setTitle(plan.title);
        setPlanSummary(plan.rationale.summary);
        setRationaleCodes(plan.rationale.codes);
        setRows(
          plan.exercises.map((slot, position) =>
            toRow(slot, position, profile.unitSystem, equipment, index),
          ),
        );
      })
      .catch(() => setRows([]));
  }, [repos, date, allExercises, equipment, exercisesQuery.isSuccess, equipmentQuery.isSuccess]);

  function patch(key: string, next: Partial<Row>): void {
    setRows((current) =>
      (current ?? []).map((row) => (row.key === key ? { ...row, ...next } : row)),
    );
  }

  function move(key: string, delta: number): void {
    setRows((current) => {
      if (!current) return current;
      const index = current.findIndex((row) => row.key === key);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row);
      return next;
    });
  }

  async function addExercise(exerciseId: Id): Promise<void> {
    const exercise = exerciseIndex.get(exerciseId);
    if (!exercise) return;
    const history = await repos.workouts.getExerciseHistory(exerciseId, { limit: 3 });
    const safetyActive = await repos.safety.isActive();
    const decision = decideProgression({
      exerciseId,
      loadType: exercise.loadType,
      repRange: exercise.defaultRepRange,
      history,
      loadIncrementKg: incrementKgFor({ exercise, equipment, unitSystem }),
      readinessModifier: 'normal',
      safetyActive,
      unitSystem,
    });
    setRows((current) => [
      ...(current ?? []),
      {
        key: `${exerciseId}-${(current?.length ?? 0) + 1}`,
        exerciseId,
        targetSets: String(decision.targetSets),
        repMin: String(decision.targetRepMin),
        repMax: String(decision.targetRepMax),
        load:
          decision.targetLoadKg == null ? '' : String(loadValue(decision.targetLoadKg, unitSystem)),
        restSec: String(decision.restSec),
        progressionDecision: decision,
      },
    ]);
    setAdding('');
  }

  async function save(): Promise<void> {
    if (!rows || rows.length === 0) return;
    setBusy(true);
    try {
      const exercises: WorkoutPlanExercise[] = rows.map((row, index) => ({
        exerciseId: row.exerciseId,
        order: index,
        targetSets: countFromText(row.targetSets) ?? 3,
        targetRepMin: countFromText(row.repMin) ?? 8,
        targetRepMax: countFromText(row.repMax) ?? 12,
        targetLoadKg: loadFromText(row.load, unitSystem),
        restSec: countFromText(row.restSec) ?? 90,
        tempo: null,
        substitutedFromExerciseId: null,
        progressionDecision: row.progressionDecision,
        notes: null,
      }));

      const seconds = exercises.reduce(
        (total, slot) => total + exerciseCostSeconds(slot.targetSets, slot.restSec),
        0,
      );

      const saved = await repos.workouts.createPlanned({
        date,
        title: title.trim() || 'Session',
        focus: [
          ...new Set(
            exercises.flatMap((slot) => exerciseIndex.get(slot.exerciseId)?.primaryMuscles ?? []),
          ),
        ].slice(0, 5),
        plannedDurationMin: Math.ceil(seconds / 60),
        source: 'manual',
        exercises,
        readinessId: null,
        notes: null,
        rationale: makeRationale(
          ['MANUAL_BUILD', ...rationaleCodes],
          {
            date,
            exerciseIds: exercises.map((slot) => slot.exerciseId),
            estimatedSeconds: seconds,
          },
          'You built this session yourself, starting from the planner’s draft.',
        ),
      });
      await invalidate('createWorkout');
      navigate(sessionPath(saved.id));
    } finally {
      setBusy(false);
    }
  }

  if (rows == null) {
    return (
      <div>
        <PageHeading title="Build a workout" subtitle="Starting from the planner’s draft…" />
      </div>
    );
  }

  return (
    <div>
      <PageHeading
        title="Build a workout"
        subtitle="The planner filled in the first draft. Change anything — the loads stay yours once you edit them."
      />

      <Card style={{ marginBottom: space.lg }}>
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>Session title</span>
          <input
            aria-label="Session title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </label>
        {planSummary && (
          <>
            <p style={{ color: themeColor.textMuted, marginBottom: 0 }}>{planSummary}</p>
            <WhyDisclosure
              rationale={makeRationale(rationaleCodes, {}, planSummary)}
              label="Why this draft?"
            />
          </>
        )}
      </Card>

      {rows.length === 0 && (
        <EmptyState>
          The draft came back empty — usually that means no equipment is marked available in You →
          Equipment. Add exercises by hand below.
        </EmptyState>
      )}

      <div style={{ display: 'grid', gap: space.md }}>
        {rows.map((row, index) => {
          const exercise = exerciseIndex.get(row.exerciseId);
          return (
            <Card key={row.key}>
              <SectionHeading
                actions={
                  <span style={{ display: 'flex', gap: space.sm }}>
                    <button
                      type="button"
                      onClick={() => move(row.key, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${exercise?.name ?? 'exercise'} earlier`}
                      style={linkButton}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(row.key, 1)}
                      disabled={index === rows.length - 1}
                      aria-label={`Move ${exercise?.name ?? 'exercise'} later`}
                      style={linkButton}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRows((current) =>
                          (current ?? []).filter((other) => other.key !== row.key),
                        )
                      }
                      aria-label={`Remove ${exercise?.name ?? 'exercise'}`}
                      style={linkButton}
                    >
                      Remove
                    </button>
                  </span>
                }
              >
                {index + 1}. {exercise?.name ?? 'Exercise'}
              </SectionHeading>

              <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap' }}>
                <NumberField
                  label="Sets"
                  value={row.targetSets}
                  onChange={(value) => patch(row.key, { targetSets: value })}
                />
                <NumberField
                  label={`Min ${exercise ? repUnitShort(exercise.loadType) : 'reps'}`}
                  value={row.repMin}
                  onChange={(value) => patch(row.key, { repMin: value })}
                />
                <NumberField
                  label={`Max ${exercise ? repUnitShort(exercise.loadType) : 'reps'}`}
                  value={row.repMax}
                  onChange={(value) => patch(row.key, { repMax: value })}
                />
                <NumberField
                  label={`Load (${loadUnit(unitSystem)})`}
                  value={row.load}
                  onChange={(value) => patch(row.key, { load: value })}
                />
                <NumberField
                  label="Rest (s)"
                  value={row.restSec}
                  onChange={(value) => patch(row.key, { restSec: value })}
                />
              </div>

              <WhyDisclosure
                rationale={row.progressionDecision?.rationale}
                label="Why these numbers?"
              />
            </Card>
          );
        })}
      </div>

      <Card style={{ marginTop: space.lg }}>
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>Add an exercise</span>
          <select
            aria-label="Add an exercise"
            value={adding}
            onChange={(event) => {
              setAdding(event.target.value);
              if (event.target.value) void addExercise(event.target.value);
            }}
            style={{ ...inputStyle, width: '100%' }}
          >
            <option value="">Choose a movement…</option>
            {allExercises
              .filter((exercise) => !exercise.archived)
              .map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
          </select>
        </label>
      </Card>

      <button
        type="button"
        disabled={busy || rows.length === 0}
        onClick={() => void save()}
        style={{
          marginTop: space.lg,
          padding: `${space.sm}px ${space.lg}px`,
          borderRadius: radius.md,
          border: 'none',
          background: themeColor.accent,
          color: themeColor.textOnAccent,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {busy ? 'Saving…' : 'Save and start'}
      </button>
    </div>
  );
}

function toRow(
  slot: WorkoutPlanExercise,
  index: number,
  unitSystem: UnitSystem,
  equipment: readonly Equipment[],
  exerciseIndex: ReadonlyMap<Id, Exercise>,
): Row {
  const exercise = exerciseIndex.get(slot.exerciseId);
  const incrementKg = incrementKgFor({
    exercise,
    equipment,
    unitSystem,
    currentLoadKg: slot.targetLoadKg,
  });
  return {
    key: `${slot.exerciseId}-${index}`,
    exerciseId: slot.exerciseId,
    targetSets: String(slot.targetSets),
    repMin: String(slot.targetRepMin),
    repMax: String(slot.targetRepMax),
    load:
      slot.targetLoadKg == null
        ? ''
        : String(loadValue(slot.targetLoadKg, unitSystem, incrementKg)),
    restSec: String(slot.restSec),
    progressionDecision: slot.progressionDecision,
  };
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): ReactNode {
  return (
    <label style={{ display: 'block' }}>
      <span style={fieldLabel}>{label}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ ...inputStyle, width: 96 }}
      />
    </label>
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
  fontVariantNumeric: 'tabular-nums',
} as const;

const linkButton = {
  background: 'none',
  border: 'none',
  color: themeColor.accent,
  fontSize: fontSize.label,
  cursor: 'pointer',
  padding: 0,
} as const;
