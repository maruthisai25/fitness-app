import {
  isLoadableLoadType,
  type Rationale,
  type WorkoutPlan,
  type WorkoutPlanExercise,
} from '@vigor/core';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { buildSlot, loadBuilderContext, type BuilderContext } from '../../../src/data/builder';
import { planToday } from '../../../src/data/planner';
import { useExerciseMap, useInvalidate, useToday, useUnitSystem } from '../../../src/data/queries';
import { useRepos } from '../../../src/db/AppDataProvider';
import { useVigorNavigation } from '../../../src/navigation';
import {
  Button,
  ErrorBanner,
  LoadingScreen,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  TextField,
} from '../../../src/ui/components';
import {
  displayLoad,
  loadFromInput,
  loadUnit,
  parseNumber,
  patternLabel,
  repUnitShort,
} from '../../../src/ui/format';
import { Caption, Card, EmptyState, ListRow, Sheet, WhyDisclosure } from '../../../src/ui/kit';
import { SafetyBanner } from '../../../src/ui/SafetyBanner';
import { color, fontSize, fontWeight, radius, space } from '../../../src/ui/tokens';

/**
 * The manual workout builder — DESIGN.md §9 phase 1. It opens on the rule-based
 * planner's draft (DESIGN.md §5.4) so the user starts from engine-decided
 * loads, then adds, removes, reorders and edits before saving with
 * `workouts.createPlanned`.
 */
export default function BuilderScreen() {
  const repos = useRepos();
  const today = useToday();
  const nav = useVigorNavigation();
  const unitSystem = useUnitSystem();
  const invalidate = useInvalidate();
  const exercisesById = useExerciseMap();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date ?? today;

  const [title, setTitle] = useState('');
  const [slots, setSlots] = useState<WorkoutPlanExercise[] | null>(null);
  const [focus, setFocus] = useState<string[]>([]);
  const [rationale, setRationale] = useState<Rationale | null>(null);
  const [ctx, setCtx] = useState<BuilderContext | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [plan, context] = await Promise.all([
          planToday(repos, { date }),
          loadBuilderContext(repos, date),
        ]);
        if (cancelled) return;
        setTitle(plan.title);
        setSlots(plan.exercises);
        setFocus(plan.focus);
        setRationale(plan.rationale);
        setCtx(context);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not draft a workout.');
          setSlots([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, repos]);

  const update = useCallback((order: number, patch: Partial<WorkoutPlanExercise>) => {
    setDirty(true);
    setSlots((current) =>
      (current ?? []).map((slot) => (slot.order === order ? { ...slot, ...patch } : slot)),
    );
  }, []);

  const remove = useCallback((order: number) => {
    setDirty(true);
    setSlots((current) =>
      (current ?? [])
        .filter((slot) => slot.order !== order)
        .map((slot, index) => ({ ...slot, order: index })),
    );
  }, []);

  const move = useCallback((order: number, direction: -1 | 1) => {
    setDirty(true);
    setSlots((current) => {
      const list = [...(current ?? [])];
      const from = list.findIndex((slot) => slot.order === order);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= list.length) return list;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return list.map((slot, index) => ({ ...slot, order: index }));
    });
  }, []);

  const addExercise = useCallback(
    async (exerciseId: string) => {
      if (!ctx) return;
      try {
        const slot = await buildSlot(repos, ctx, exerciseId, (slots ?? []).length);
        setDirty(true);
        setSlots((current) => [...(current ?? []), slot]);
        setPickerOpen(false);
        setPickerQuery('');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not add that exercise.');
      }
    },
    [ctx, repos, slots],
  );

  const pickerResults = useMemo(() => {
    const all = ctx?.exercises ?? [];
    const query = pickerQuery.trim().toLowerCase();
    const chosen = new Set((slots ?? []).map((slot) => slot.exerciseId));
    return all
      .filter((exercise) => !chosen.has(exercise.id))
      .filter((exercise) => query.length === 0 || exercise.name.toLowerCase().includes(query))
      .slice(0, 40);
  }, [ctx, pickerQuery, slots]);

  async function save() {
    if (!slots || slots.length === 0) {
      setError('Add at least one exercise before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const estimatedSeconds = slots.reduce(
        (total, slot) => total + slot.targetSets * (slot.restSec + 40),
        0,
      );
      const plan: WorkoutPlan = {
        date,
        title: title.trim().length > 0 ? title.trim() : 'Workout',
        focus,
        plannedDurationMin: Math.max(1, Math.ceil(estimatedSeconds / 60)),
        source: dirty ? 'manual' : 'rule',
        exercises: slots.map((slot, index) => ({ ...slot, order: index })),
        readinessId: null,
        notes: null,
        rationale: rationale ?? {
          codes: ['MANUAL_PLAN'],
          facts: { exerciseCount: slots.length },
          summary: 'You built this session by hand.',
        },
      };
      const workout = await repos.workouts.createPlanned(plan);
      await invalidate('createWorkout');
      nav.openWorkout(workout.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that workout.');
    } finally {
      setSaving(false);
    }
  }

  if (slots == null) return <LoadingScreen label="Drafting a session…" />;

  return (
    <Screen>
      <ScreenTitle>Build a workout</ScreenTitle>
      <ScreenBlurb>
        This starts from the planner&apos;s draft for {date}: least-recently-trained pattern first,
        loads carried over by the progression engine. Change anything you like.
      </ScreenBlurb>

      <SafetyBanner compact />

      <View style={{ marginTop: space.lg }}>
        <TextField
          label="Session title"
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            setDirty(true);
          }}
        />
      </View>

      <WhyDisclosure rationale={rationale} label="Why this draft?" />

      {slots.length === 0 ? (
        <EmptyState
          title="Nothing in this session yet"
          blurb="Add an exercise and its sets, reps and load come from the progression engine."
        />
      ) : (
        slots.map((slot) => {
          const exercise = exercisesById.get(slot.exerciseId) ?? ctx?.exercises.find((entry) => entry.id === slot.exerciseId);
          const loadType = exercise?.loadType ?? 'external';
          const loadable = isLoadableLoadType(loadType);
          return (
            <Card
              key={`${slot.exerciseId}-${slot.order}`}
              title={exercise?.name ?? 'Exercise'}
              subtitle={exercise ? patternLabel(exercise.movementPattern) : undefined}
            >
              <View style={styles.editorRow}>
                <NumberCell
                  label="Sets"
                  value={String(slot.targetSets)}
                  onChange={(value) =>
                    update(slot.order, { targetSets: Math.max(1, Math.round(value)) })
                  }
                />
                <NumberCell
                  label={`Min ${repUnitShort(loadType)}`}
                  value={String(slot.targetRepMin)}
                  onChange={(value) =>
                    update(slot.order, { targetRepMin: Math.max(1, Math.round(value)) })
                  }
                />
                <NumberCell
                  label={`Max ${repUnitShort(loadType)}`}
                  value={String(slot.targetRepMax)}
                  onChange={(value) =>
                    update(slot.order, { targetRepMax: Math.max(1, Math.round(value)) })
                  }
                />
              </View>
              <View style={styles.editorRow}>
                <NumberCell
                  label="Rest (s)"
                  value={String(slot.restSec)}
                  onChange={(value) => update(slot.order, { restSec: Math.max(0, Math.round(value)) })}
                />
                {loadable ? (
                  <NumberCell
                    label={`Load (${loadUnit(unitSystem)})`}
                    value={
                      slot.targetLoadKg == null
                        ? ''
                        : String(displayLoad(slot.targetLoadKg, unitSystem))
                    }
                    onChange={(value) =>
                      update(slot.order, { targetLoadKg: loadFromInput(value, unitSystem) })
                    }
                  />
                ) : (
                  <View style={{ flex: 1 }}>
                    <Caption>{`No external load — logged in ${repUnitShort(loadType)}`}</Caption>
                  </View>
                )}
              </View>

              <WhyDisclosure rationale={slot.progressionDecision?.rationale ?? null} />

              <View style={styles.slotActions}>
                <Pressable accessibilityRole="button" onPress={() => move(slot.order, -1)}>
                  <Text style={styles.slotAction}>Move up</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => move(slot.order, 1)}>
                  <Text style={styles.slotAction}>Move down</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => remove(slot.order)}>
                  <Text style={[styles.slotAction, { color: color.bad }]}>Remove</Text>
                </Pressable>
              </View>
            </Card>
          );
        })
      )}

      <Button
        label="Add an exercise"
        variant="secondary"
        onPress={() => setPickerOpen(true)}
        disabled={!ctx}
      />

      {error ? <ErrorBanner message={error} /> : null}

      <Button label="Save workout" onPress={save} loading={saving} />

      <Sheet visible={pickerOpen} title="Add an exercise" onClose={() => setPickerOpen(false)}>
        <TextField
          label="Search"
          placeholder="Name"
          autoCapitalize="none"
          value={pickerQuery}
          onChangeText={setPickerQuery}
        />
        {pickerResults.length === 0 ? (
          <Caption>Nothing matches that name.</Caption>
        ) : null}
        {pickerResults.map((exercise, index) => (
          <ListRow
            key={exercise.id}
            title={exercise.name}
            subtitle={patternLabel(exercise.movementPattern)}
            onPress={() => void addExercise(exercise.id)}
            last={index === pickerResults.length - 1}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

function NumberCell({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.cellLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType="decimal-pad"
        inputMode="decimal"
        style={styles.cellInput}
        value={text}
        onChangeText={setText}
        onEndEditing={() => {
          const parsed = parseNumber(text);
          if (parsed != null) onChange(parsed);
          else setText(value);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  editorRow: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  cellLabel: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: space.xs,
  },
  cellInput: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: color.text,
    fontSize: fontSize.body,
    fontVariant: ['tabular-nums'],
  },
  slotActions: {
    flexDirection: 'row',
    gap: space.lg,
    marginTop: space.md,
  },
  slotAction: {
    color: color.accent,
    fontSize: fontSize.label,
    fontWeight: fontWeight.medium,
  },
});
