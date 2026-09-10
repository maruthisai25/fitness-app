/**
 * Session mode — DESIGN.md §7.1: a full-screen flow, one exercise at a time,
 * set rows with target vs last time, an RPE picker, a rest timer that fires a
 * notification, "can't do this" → substitution sheet, notes, and a finish
 * summary with PRs.
 *
 * Every confirmation writes through `sets.record` immediately (DESIGN.md §7.2)
 * so a crash loses at most the row being typed. No number on this screen is
 * computed here: targets come from the stored `ProgressionDecision`, the
 * substitution list from the core engine, and the PRs from the records engine.
 *
 * ## Accessibility
 *
 * Reading order inside a set is fixed and deliberate: **target, then the
 * inputs, then confirm**. That is the order the elements are written in below
 * (`setHead` → `inputRow`/RPE/notes → `Confirm set`), which is the order both
 * VoiceOver and TalkBack walk, and it is what `accessibility.component.test`
 * asserts — a swipe through a set row should tell you what to hit before it
 * offers you the box to type it in.
 *
 * The rest countdown is the only thing here that moves on its own: it steps
 * once a second under Reduce Motion instead of twice, and says "rest is up"
 * through the screen reader rather than relying on the number changing. The
 * PR celebration on the finish summary fades and rises in — unless Reduce
 * Motion is on, in which case it is simply there.
 */
import { isAiError } from '@vigor/ai';
import {
  isLoadableLoadType,
  resolveLoadIncrementKg,
  type Id,
  type LoadType,
  type SubstitutionCandidate,
  type SubstitutionReason,
  type UnitSystem,
} from '@vigor/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAiClient } from '../ai/useAiClient';
import { useOnlineStatus } from '../ai/useOnlineStatus';
import { useDefaultConversationId, useSendCoachMessage } from '../coach/useCoach';
import { useRepos } from '../db/AppDataProvider';
import { useUnitSystem } from '../data/queries';
import {
  Body,
  Caption,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Numeral,
  Sheet,
  StatRow,
  StatTile,
  WhyDisclosure,
} from '../ui/kit';
import {
  displayLoggedLoadValue,
  formatClock,
  formatDuration,
  formatLoadOrDash,
  formatLoggedLoadOrDash,
  formatSetTarget,
  loadFromInput,
  loadUnit,
  parseNumber,
  repUnit,
  repUnitShort,
} from '../ui/format';
import { Button, ErrorBanner, LoadingScreen, TextAction } from '../ui/components';
import { SafetyBanner } from '../ui/SafetyBanner';
import {
  color,
  fontSize,
  fontWeight,
  HIT_TARGET,
  MAX_COMPACT_FONT_SCALE,
  MAX_NUMERAL_FONT_SCALE,
  radius,
  space,
} from '../ui/tokens';
import { announce, useReducedMotionSetting } from '../ui/useReducedMotion';
import { useRestTimer } from './restTimer';
import { useSessionDraft, useSetDraft } from './store';
import {
  rankSubstitutes,
  useConfirmSet,
  useFinishSession,
  useSessionQuery,
  useStartSession,
  useSubstituteExercise,
  type FinishSummary,
  type SessionExerciseView,
  type SessionSetView,
} from './useSession';

/** RPE 6–10 in half steps — DESIGN.md §7.1 "RPE picker". */
const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

const SUBSTITUTION_REASONS: readonly { value: SubstitutionReason; label: string }[] = [
  { value: 'equipment_unavailable', label: 'Equipment taken' },
  { value: 'pain', label: 'It hurts' },
  { value: 'too_hard', label: 'Too hard today' },
  { value: 'too_easy', label: 'Too easy' },
  { value: 'disliked', label: 'I do not like it' },
  { value: 'variety', label: 'Want variety' },
];

export function SessionMode({ workoutId, onExit }: { workoutId: Id; onExit: () => void }) {
  const repos = useRepos();
  const insets = useSafeAreaInsets();
  const unitSystem = useUnitSystem();
  const session = useSessionQuery(workoutId);
  const confirmSet = useConfirmSet();
  const startSession = useStartSession();
  const finishSession = useFinishSession();
  const substituteExercise = useSubstituteExercise();
  const rest = useRestTimer();
  const { hasApiKey } = useAiClient();
  const online = useOnlineStatus();
  const defaultConversationId = useDefaultConversationId();
  const askCoach = useSendCoachMessage(defaultConversationId ?? '');
  const [coachAsking, setCoachAsking] = useState(false);

  const begin = useSessionDraft((state) => state.begin);
  const clearInput = useSessionDraft((state) => state.clearInput);
  const reset = useSessionDraft((state) => state.reset);
  const exerciseIndex = useSessionDraft((state) => state.exerciseIndex);
  const setExerciseIndex = useSessionDraft((state) => state.setExerciseIndex);

  const [summary, setSummary] = useState<FinishSummary | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reason, setReason] = useState<SubstitutionReason>('equipment_unavailable');
  const [candidates, setCandidates] = useState<SubstitutionCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const data = session.data ?? null;
  const workout = data?.workout ?? null;

  useEffect(() => {
    begin(workoutId);
  }, [begin, workoutId]);

  // The session is "in progress" from the first screen, not the first set:
  // that is what makes a crash recoverable and what Today reads back.
  useEffect(() => {
    if (!workout || startedRef.current) return;
    if (workout.status === 'planned') {
      startedRef.current = true;
      startSession.mutate(workoutId);
    }
  }, [workout, workoutId, startSession]);

  const current: SessionExerciseView | null = useMemo(() => {
    if (!data || data.exercises.length === 0) return null;
    const index = Math.min(exerciseIndex, data.exercises.length - 1);
    return data.exercises[index] ?? null;
  }, [data, exerciseIndex]);

  const loadType: LoadType = current?.exercise?.loadType ?? 'external';
  const incrementKg = useMemo(
    () =>
      resolveLoadIncrementKg({
        category: current?.exercise?.equipment.find((item) => item !== 'bodyweight') ?? null,
        unitSystem,
        currentLoadKg: current?.slot.targetLoadKg ?? null,
      }),
    [current, unitSystem],
  );

  const openSubstitutions = useCallback(
    async (nextReason: SubstitutionReason) => {
      if (!current || !data) return;
      setReason(nextReason);
      setCandidates(null);
      try {
        const offer = await rankSubstitutes(repos, {
          exerciseId: current.slot.exerciseId,
          reason: nextReason,
          excludeExerciseIds: data.exercises.map((entry) => entry.slot.exerciseId),
        });
        setCandidates(offer.candidates);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not rank a substitution.');
      }
    },
    [current, data, repos],
  );

  /**
   * "Can't do this" → ask the coach — DESIGN.md phase 2 row of §9, in addition
   * to the local substitution engine sheet above. The coach calls
   * `substitute_exercise` itself (DESIGN.md §6.3), which applies the swap the
   * same way `applySubstitution` does below, so refetching the session is
   * all this needs to do once the turn finishes.
   */
  const askCoachForSwap = useCallback(
    async (nextReason: SubstitutionReason) => {
      if (!current || defaultConversationId == null) return;
      setCoachAsking(true);
      setError(null);
      const reasonLabel =
        SUBSTITUTION_REASONS.find((entry) => entry.value === nextReason)?.label ?? nextReason;
      const name = current.exercise?.name ?? 'this exercise';
      const prompt = `I can't do ${name} right now (${reasonLabel}). Can you swap it for something else in today's session?`;
      try {
        const result = await askCoach.mutateAsync(prompt);
        if (result.refusal) {
          setError(result.refusal.message);
          return;
        }
        setSheetOpen(false);
        setCandidates(null);
        await session.refetch();
      } catch (cause) {
        setError(isAiError(cause) ? cause.userMessage : 'Could not reach the coach.');
      } finally {
        setCoachAsking(false);
      }
    },
    [askCoach, current, defaultConversationId, session],
  );

  const applySubstitution = useCallback(
    async (candidate: SubstitutionCandidate) => {
      if (!current) return;
      await substituteExercise.mutateAsync({
        workoutExerciseId: current.slot.id,
        toExerciseId: candidate.exerciseId,
      });
      setSheetOpen(false);
      setCandidates(null);
      await session.refetch();
    },
    [current, session, substituteExercise],
  );

  const onConfirmSet = useCallback(
    async (input: {
      setId: Id;
      actualReps: number | null;
      actualLoadKg: number | null;
      rpe: number | null;
      notes: string | null;
      restSec: number;
      exerciseName: string;
      isLast: boolean;
    }) => {
      setError(null);
      try {
        await confirmSet.mutateAsync({
          setId: input.setId,
          actualReps: input.actualReps,
          actualLoadKg: input.actualLoadKg,
          rpe: input.rpe,
          notes: input.notes,
        });
        clearInput(input.setId);
        await session.refetch();
        if (!input.isLast && input.restSec > 0) {
          rest.start({
            afterSetId: input.setId,
            seconds: input.restSec,
            exerciseName: input.exerciseName,
          });
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not save that set.');
      }
    },
    [clearInput, confirmSet, rest, session],
  );

  const finish = useCallback(
    async (status: 'completed' | 'abandoned') => {
      rest.stop();
      try {
        const result = await finishSession.mutateAsync({ workoutId, status, unitSystem });
        reset();
        if (status === 'abandoned') onExit();
        else setSummary(result);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not close the session.');
      }
    },
    [finishSession, onExit, rest, reset, unitSystem, workoutId],
  );

  const confirmAbandon = useCallback(() => {
    Alert.alert(
      'Abandon this session?',
      'Sets you already confirmed stay logged. The session is marked abandoned.',
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Abandon', style: 'destructive', onPress: () => void finish('abandoned') },
      ],
    );
  }, [finish]);

  if (session.isLoading) return <LoadingScreen label="Opening your session…" />;

  if (!data || !workout) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + space.xl }]}>
        <ErrorBanner message="That workout is not in your history any more." />
        <Button label="Back" variant="secondary" onPress={onExit} />
      </View>
    );
  }

  if (summary) {
    return <SessionSummary summary={summary} unitSystem={unitSystem} onDone={onExit} />;
  }

  if (!current) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + space.xl }]}>
        <EmptyState
          title="This session has no exercises"
          blurb="Add exercises to it from the workout builder, then start again."
        />
        <Button label="Back" variant="secondary" onPress={onExit} />
      </View>
    );
  }

  const total = data.exercises.length;
  const index = Math.min(exerciseIndex, total - 1);
  const exerciseName = current.exercise?.name ?? 'Exercise';
  const isLastExercise = index === total - 1;
  const everySetDone = current.sets.every((entry) => entry.set.completed);
  /** Spoken form of the target line — the first thing a screen reader reads. */
  const targetSentence = `${formatSetTarget(
    current.slot.targetSets,
    current.slot.targetRepMin,
    current.slot.targetRepMax,
    loadType,
  )}${
    current.slot.targetLoadKg != null
      ? ` at ${formatLoadOrDash(current.slot.targetLoadKg, unitSystem, incrementKg)}`
      : ''
  }. Rest ${current.slot.restSec} seconds between sets.`;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.lg,
          paddingBottom: insets.bottom + space.xxxl,
          paddingHorizontal: space.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View
            accessible
            accessibilityRole="header"
            accessibilityLabel={`${exerciseName}. Exercise ${index + 1} of ${total} in ${workout.title}`}
            style={styles.headerText}
          >
            <Caption>{`Exercise ${index + 1} of ${total} · ${workout.title}`}</Caption>
            <Text maxFontSizeMultiplier={1.8} style={styles.headerTitle}>
              {exerciseName}
            </Text>
          </View>
          <TextAction
            label="Abandon"
            tone="muted"
            hint="Ends the session; the sets you already confirmed stay logged"
            testID="abandon-session"
            onPress={confirmAbandon}
          />
        </View>

        <SafetyBanner compact />
        {data.safetyActive ? (
          <Text accessibilityRole="alert" style={styles.holdNote}>
            Safety hold is on: the load stays where it was and one set comes off.
          </Text>
        ) : null}

        <Card>
          {/* First in the reading order: what this exercise is asking for. */}
          <View accessible accessibilityLabel={`Target: ${targetSentence}`} testID="exercise-target">
            <Body>
              {formatSetTarget(
                current.slot.targetSets,
                current.slot.targetRepMin,
                current.slot.targetRepMax,
                loadType,
              )}
              {current.slot.targetLoadKg != null
                ? ` at ${formatLoadOrDash(current.slot.targetLoadKg, unitSystem, incrementKg)}`
                : ''}
            </Body>
            <Caption>{`Rest ${current.slot.restSec}s between sets`}</Caption>
          </View>
          {current.slot.substitutedFromExerciseId ? (
            <Text style={styles.substituted}>Swapped in for the exercise you could not do.</Text>
          ) : null}
          <WhyDisclosure
            rationale={current.slot.progressionDecision?.rationale ?? null}
            testID="exercise-why"
          />
          <TextAction
            label="Can’t do this"
            hint="Opens alternatives that work the same pattern"
            testID="cant-do-this"
            onPress={() => {
              setSheetOpen(true);
              void openSubstitutions(reason);
            }}
          />
        </Card>

        {current.sets.map((entry, setIndex) => (
          <SetRow
            key={entry.set.id}
            entry={entry}
            setIndex={setIndex}
            loadType={loadType}
            unitSystem={unitSystem}
            incrementKg={incrementKg}
            targetLoadKg={current.slot.targetLoadKg}
            resting={rest.afterSetId === entry.set.id && rest.secondsLeft != null}
            secondsLeft={rest.secondsLeft}
            onSkipRest={rest.stop}
            saving={confirmSet.isPending}
            onConfirm={(values) =>
              void onConfirmSet({
                ...values,
                restSec: current.slot.restSec,
                exerciseName,
                isLast: setIndex === current.sets.length - 1,
              })
            }
          />
        ))}

        {error ? <ErrorBanner message={error} /> : null}

        <View style={styles.navRow}>
          <View style={styles.navButton}>
            <Button
              label="Previous"
              variant="secondary"
              disabled={index === 0}
              onPress={() => setExerciseIndex(Math.max(0, index - 1))}
            />
          </View>
          <View style={styles.navButton}>
            {isLastExercise ? (
              <Button
                label="Finish session"
                onPress={() => void finish('completed')}
                loading={finishSession.isPending}
              />
            ) : (
              <Button
                label={everySetDone ? 'Next exercise' : 'Skip to next'}
                onPress={() => setExerciseIndex(Math.min(total - 1, index + 1))}
              />
            )}
          </View>
        </View>
      </ScrollView>

      <Sheet
        visible={sheetOpen}
        title="Swap this exercise"
        onClose={() => {
          setSheetOpen(false);
          setCandidates(null);
        }}
      >
        <Caption>Why are we swapping?</Caption>
        <View style={{ marginTop: space.sm }}>
          <ChipRow>
            {SUBSTITUTION_REASONS.map((entry) => (
              <Chip
                key={entry.value}
                label={entry.label}
                selected={entry.value === reason}
                onPress={() => void openSubstitutions(entry.value)}
              />
            ))}
          </ChipRow>
        </View>

        {candidates == null ? (
          <Text accessibilityLiveRegion="polite" style={styles.sheetLoading}>
            Ranking alternatives…
          </Text>
        ) : candidates.length === 0 ? (
          <EmptyState
            title="Nothing matches with the kit you have"
            blurb="Mark more equipment available in the You tab, or skip this exercise for today."
          />
        ) : (
          candidates.map((candidate) => (
            <Pressable
              key={candidate.exerciseId}
              accessibilityRole="button"
              accessibilityLabel={`Swap in ${candidate.name}`}
              accessibilityHint={candidate.rationale.summary}
              accessibilityState={{ disabled: false }}
              testID={`substitute-${candidate.exerciseId}`}
              onPress={() => void applySubstitution(candidate)}
              style={styles.candidate}
            >
              <Text style={styles.candidateName}>{candidate.name}</Text>
              <Text style={styles.candidateWhy}>{candidate.rationale.summary}</Text>
            </Pressable>
          ))
        )}

        {hasApiKey && online ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={coachAsking ? 'Asking the coach' : 'Ask the coach instead'}
            accessibilityHint="It can look further than the list above and explain why"
            accessibilityState={{ disabled: coachAsking, busy: coachAsking }}
            testID="ask-coach-for-swap"
            onPress={() => void askCoachForSwap(reason)}
            disabled={coachAsking}
            style={styles.askCoach}
          >
            <Text style={styles.askCoachLabel}>
              {coachAsking ? 'Asking the coach…' : 'Ask the coach instead'}
            </Text>
            <Text style={styles.askCoachHint}>
              It can look further than the list above and explain why.
            </Text>
          </Pressable>
        ) : null}
      </Sheet>
    </View>
  );
}

interface ConfirmValues {
  setId: Id;
  actualReps: number | null;
  actualLoadKg: number | null;
  rpe: number | null;
  notes: string | null;
}

function SetRow({
  entry,
  setIndex,
  loadType,
  unitSystem,
  incrementKg,
  targetLoadKg,
  resting,
  secondsLeft,
  onSkipRest,
  onConfirm,
  saving,
}: {
  entry: SessionSetView;
  setIndex: number;
  loadType: LoadType;
  unitSystem: UnitSystem;
  incrementKg: number;
  targetLoadKg: number | null;
  resting: boolean;
  secondsLeft: number | null;
  onSkipRest: () => void;
  onConfirm: (values: ConfirmValues) => void;
  saving: boolean;
}) {
  const draft = useSetDraft(entry.set.id);
  const setInput = useSessionDraft((state) => state.setInput);
  const [editing, setEditing] = useState(false);
  const loadable = isLoadableLoadType(loadType);
  const done = entry.set.completed && !editing;

  const lastTime =
    entry.lastReps == null
      ? 'First time logging this set'
      : `Last time ${entry.lastReps} ${repUnitShort(loadType)}${
          entry.lastLoadKg != null
            ? // What was logged, not what the engine would prescribe (§5.10).
              ` × ${formatLoggedLoadOrDash(entry.lastLoadKg, unitSystem)}`
            : ''
        }`;

  /**
   * Re-opening a confirmed set must show what was logged, not an empty box —
   * otherwise "Edit → Confirm" silently rewrites the row with the *targets*
   * and the real performance is gone (DESIGN.md §7.2: a crash loses nothing,
   * and neither does a tap).
   */
  function startEditing() {
    setInput(entry.set.id, {
      reps: entry.set.actualReps == null ? '' : String(entry.set.actualReps),
      load:
        entry.set.actualLoadKg == null
          ? ''
          : String(displayLoggedLoadValue(entry.set.actualLoadKg, unitSystem)),
      rpe: entry.set.rpe,
      notes: entry.set.notes ?? '',
    });
    setEditing(true);
  }

  function confirm() {
    // Fall back to what is already stored, never to the target: an empty box on
    // a set being edited means "leave it as logged".
    const storedReps = entry.set.completed ? entry.set.actualReps : null;
    const reps = parseNumber(draft.reps) ?? storedReps ?? entry.set.targetReps;
    const typedLoad = parseNumber(draft.load);
    const storedLoadKg = entry.set.completed ? entry.set.actualLoadKg : null;
    const actualLoadKg = !loadable
      ? null
      : typedLoad != null
        ? loadFromInput(typedLoad, unitSystem)
        : (storedLoadKg ?? targetLoadKg);
    setEditing(false);
    onConfirm({
      setId: entry.set.id,
      actualReps: reps,
      actualLoadKg,
      rpe: draft.rpe,
      notes: draft.notes.trim().length > 0 ? draft.notes.trim() : null,
    });
  }

  const targetText = `Target ${entry.set.targetReps} ${repUnitShort(loadType)}${
    targetLoadKg != null ? ` × ${formatLoadOrDash(targetLoadKg, unitSystem, incrementKg)}` : ''
  }`;
  const loggedText = `${entry.set.actualReps ?? 0} ${repUnit(loadType)}${
    entry.set.actualLoadKg != null
      ? ` × ${formatLoggedLoadOrDash(entry.set.actualLoadKg, unitSystem)}`
      : ''
  }${entry.set.rpe != null ? ` · RPE ${entry.set.rpe}` : ''}`;

  return (
    <View style={[styles.setCard, done && styles.setCardDone]} testID={`set-${setIndex}`}>
      {/* 1 — the target. One element, read before anything is typed. */}
      <View
        accessible
        accessibilityLabel={`Set ${setIndex + 1}. ${targetText}. ${lastTime}`}
        testID={`set-${setIndex}-target`}
      >
        <View style={styles.setHead}>
          <Text maxFontSizeMultiplier={MAX_COMPACT_FONT_SCALE} style={styles.setLabel}>
            {`Set ${setIndex + 1}`}
          </Text>
          <Text maxFontSizeMultiplier={MAX_COMPACT_FONT_SCALE} style={styles.setTarget}>
            {targetText}
          </Text>
        </View>
        <Caption>{lastTime}</Caption>
      </View>

      {done ? (
        <View style={styles.doneRow}>
          <Text
            accessibilityLabel={`Logged ${loggedText}`}
            maxFontSizeMultiplier={MAX_COMPACT_FONT_SCALE}
            style={styles.doneText}
          >
            {loggedText}
          </Text>
          <TextAction
            label="Edit"
            hint={`Reopens set ${setIndex + 1} with what you logged`}
            testID={`set-${setIndex}-edit`}
            onPress={startEditing}
          />
        </View>
      ) : (
        <>
          {/* 2 — the inputs, in the order they are filled. */}
          <View style={styles.inputRow}>
            <View style={styles.inputCell}>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={styles.inputLabel}
              >
                {repUnitShort(loadType)}
              </Text>
              <TextInput
                testID={`set-${setIndex}-reps`}
                accessibilityLabel={`Set ${setIndex + 1} ${repUnit(loadType)}`}
                accessibilityHint={`Target is ${entry.set.targetReps}`}
                keyboardType="number-pad"
                inputMode="numeric"
                placeholder={String(entry.set.targetReps)}
                placeholderTextColor={color.textFaint}
                style={styles.input}
                value={draft.reps}
                onChangeText={(reps) => setInput(entry.set.id, { reps })}
              />
            </View>
            {loadable ? (
              <View style={styles.inputCell}>
                <Text
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  style={styles.inputLabel}
                >
                  {loadUnit(unitSystem)}
                </Text>
                <TextInput
                  testID={`set-${setIndex}-load`}
                  accessibilityLabel={`Set ${setIndex + 1} load in ${loadUnit(unitSystem)}`}
                  accessibilityHint={
                    targetLoadKg == null
                      ? undefined
                      : `Target is ${formatLoadOrDash(targetLoadKg, unitSystem, incrementKg)}`
                  }
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholder={
                    targetLoadKg == null
                      ? '—'
                      : String(formatLoadOrDash(targetLoadKg, unitSystem, incrementKg).split(' ')[0])
                  }
                  placeholderTextColor={color.textFaint}
                  style={styles.input}
                  value={draft.load}
                  onChangeText={(load) => setInput(entry.set.id, { load })}
                />
              </View>
            ) : null}
          </View>

          <Text accessibilityRole="header" style={styles.inputLabel}>
            RPE
          </Text>
          <ChipRow>
            {RPE_VALUES.map((value) => (
              <Chip
                key={value}
                label={String(value)}
                selected={draft.rpe === value}
                onPress={() => setInput(entry.set.id, { rpe: draft.rpe === value ? null : value })}
              />
            ))}
          </ChipRow>

          <TextInput
            testID={`set-${setIndex}-notes`}
            accessibilityLabel={`Set ${setIndex + 1} notes`}
            accessibilityHint="Optional — how the set felt"
            placeholder="Notes (optional)"
            placeholderTextColor={color.textFaint}
            style={[styles.input, styles.notes]}
            value={draft.notes}
            onChangeText={(notes) => setInput(entry.set.id, { notes })}
          />

          {/* 3 — confirm, last, so nothing is offered before the numbers. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Confirm set ${setIndex + 1}`}
            accessibilityHint="Saves this set straight away"
            accessibilityState={{ disabled: saving, busy: saving }}
            testID={`set-${setIndex}-confirm`}
            onPress={confirm}
            disabled={saving}
            style={({ pressed }) => [styles.confirm, pressed && styles.confirmPressed]}
          >
            <Text maxFontSizeMultiplier={1.8} style={styles.confirmLabel}>
              Confirm set
            </Text>
          </Pressable>
        </>
      )}

      {resting ? (
        <View style={styles.restRow}>
          <Text
            // The number changes on its own; "polite" lets the reader announce
            // it without interrupting, and `useRestTimer` says "rest is up".
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Resting, ${formatClock(secondsLeft ?? 0)} left`}
            maxFontSizeMultiplier={MAX_NUMERAL_FONT_SCALE}
            style={styles.restText}
          >
            {`Rest ${formatClock(secondsLeft ?? 0)}`}
          </Text>
          <TextAction
            label="Skip rest"
            hint="Ends the countdown now"
            testID={`set-${setIndex}-skip-rest`}
            onPress={onSkipRest}
          />
        </View>
      ) : null}
    </View>
  );
}

const RECORD_LABEL: Record<string, string> = {
  e1rm: 'New estimated 1RM',
  max_load: 'New heaviest load',
  max_reps_at_load: 'Most reps at that load',
  session_volume: 'Most volume in one session',
};

function SessionSummary({
  summary,
  unitSystem,
  onDone,
}: {
  summary: FinishSummary;
  unitSystem: UnitSystem;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  // `null` while the OS has not answered yet: the celebration plays once, so
  // it waits rather than starting an animation it would have to take back.
  const reducedMotion = useReducedMotionSetting();
  const celebration = useRef(new Animated.Value(0)).current;
  const celebrated = summary.celebrated.length > 0;

  /**
   * The PR moment — DESIGN.md §5.7 asks for it "loudly". Loud here is a short
   * rise and fade plus a spoken announcement, and with Reduce Motion on the
   * card is simply in place from the first frame: same card, same words, no
   * movement.
   */
  useEffect(() => {
    if (!celebrated || reducedMotion == null) return;
    if (reducedMotion) {
      celebration.setValue(1);
    } else {
      Animated.timing(celebration, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }).start();
    }
    const first = summary.celebrated[0]!;
    announce(
      `Personal record: ${(RECORD_LABEL[first.kind] ?? first.kind).toLowerCase()} on ${first.exerciseName}.`,
    );
  }, [celebrated, celebration, reducedMotion, summary.celebrated]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + space.xl,
        paddingBottom: insets.bottom + space.xxxl,
        paddingHorizontal: space.xl,
      }}
    >
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.8} style={styles.summaryTitle}>
        Session logged
      </Text>
      <StatRow>
        <StatTile label="Duration" value={formatDuration(summary.startedAt, summary.finishedAt)} />
        <StatTile label="Sets" value={String(summary.totalSets)} />
        <StatTile
          label="Volume"
          value={formatLoggedLoadOrDash(summary.totalVolumeKg, unitSystem).split(' ')[0]}
          unit={loadUnit(unitSystem)}
        />
      </StatRow>

      {celebrated ? (
        <Animated.View
          testID="pr-celebration"
          style={{
            opacity: celebration,
            transform: [
              { translateY: celebration.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            ],
          }}
        >
          <Card title="Personal record">
            {summary.celebrated.map((record, index) => (
              <View key={`${record.exerciseId}-${record.kind}-${index}`} style={styles.prRow}>
                <Caption>{`${RECORD_LABEL[record.kind] ?? record.kind} · ${record.exerciseName}`}</Caption>
                <Numeral
                  value={formatLoggedLoadOrDash(record.value, unitSystem).split(' ')[0]}
                  unit={loadUnit(unitSystem)}
                  tone="accent"
                />
              </View>
            ))}
          </Card>
        </Animated.View>
      ) : null}

      {summary.quiet.length > 0 ? (
        <Card title="Also logged">
          {summary.quiet.map((record, index) => (
            <Text key={`${record.exerciseId}-${record.kind}-${index}`} style={styles.quietRecord}>
              {`${RECORD_LABEL[record.kind] ?? record.kind} · ${record.exerciseName}${
                record.reps != null ? ` · ${record.reps} reps` : ''
              }`}
            </Text>
          ))}
        </Card>
      ) : null}

      {!celebrated && summary.quiet.length === 0 ? (
        <Card>
          <Body muted>No new records this time — the work still counts.</Body>
        </Card>
      ) : null}

      {summary.rationales[0] ? <WhyDisclosure rationale={summary.rationales[0]} /> : null}

      <Button label="Done" onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: { flex: 1, marginRight: space.md },
  headerTitle: {
    color: color.text,
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
  },
  holdNote: {
    color: color.warn,
    fontSize: fontSize.label,
    marginTop: space.md,
  },
  substituted: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    marginTop: space.xs,
  },
  setCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
    marginTop: space.md,
  },
  setCardDone: { borderColor: color.good },
  setHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  setLabel: {
    color: color.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  setTarget: {
    color: color.textMuted,
    fontSize: fontSize.label,
    fontVariant: ['tabular-nums'],
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  doneText: {
    color: color.good,
    fontSize: fontSize.body,
    fontVariant: ['tabular-nums'],
  },
  inputRow: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  inputCell: { flex: 1 },
  inputLabel: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: space.sm,
    marginBottom: space.xs,
  },
  input: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: HIT_TARGET,
    color: color.text,
    fontSize: fontSize.body,
    fontVariant: ['tabular-nums'],
  },
  notes: { marginTop: space.md },
  confirm: {
    backgroundColor: color.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
    minHeight: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
  },
  confirmPressed: { backgroundColor: color.accentPressed },
  confirmLabel: {
    color: color.textOnAccent,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  restText: {
    color: color.accent,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  navRow: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  navButton: { flex: 1 },
  sheetLoading: {
    color: color.textMuted,
    fontSize: fontSize.label,
    marginTop: space.lg,
  },
  candidate: {
    paddingVertical: space.md,
    minHeight: HIT_TARGET,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  candidateName: {
    color: color.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  candidateWhy: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    marginTop: 2,
    lineHeight: fontSize.caption * 1.5,
  },
  askCoach: {
    marginTop: space.md,
    paddingTop: space.md,
    minHeight: HIT_TARGET,
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  askCoachLabel: {
    color: color.accent,
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  askCoachHint: {
    color: color.textMuted,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  summaryTitle: {
    color: color.text,
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
    marginBottom: space.lg,
  },
  prRow: { marginTop: space.sm },
  quietRecord: {
    color: color.textMuted,
    fontSize: fontSize.label,
    marginTop: space.xs,
  },
});
