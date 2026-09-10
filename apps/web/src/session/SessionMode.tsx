/**
 * Session mode — DESIGN.md §7.1: a full-screen flow, one exercise at a time,
 * set rows showing target vs last time, an RPE picker, the rest timer, "can't
 * do this" → substitution sheet, notes, and a finish summary with PRs.
 *
 * DESIGN.md §7.2: every confirmation writes straight through `sets.record`, so
 * a crash loses nothing; Zustand only holds what is currently being typed.
 * DESIGN.md §6.5: while a safety event is open the screen repeats the hold the
 * engines applied and never suggests adding load.
 */

import { fontFamily, radius, space } from '@vigor/ui-tokens';
import { isLoadableLoadType } from '@vigor/core';
import type { Exercise, Id, SetRecord, UnitSystem, WorkoutExerciseWithSets } from '@vigor/core';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { Card, EmptyState, Pill, ScrollX, Sheet, WhyDisclosure } from '../components/ui';
import { CoachSlot } from '../coach/slots';
import {
  useEquipment,
  useExerciseHistory,
  useExerciseIndex,
  useInvalidate,
  useOpenSafetyEvents,
  useRepos,
  useUnitSystem,
  useWorkout,
} from '../data/hooks';
import {
  countFromText,
  loadFromText,
  loadUnit,
  loadValue,
  loggedLoadText,
  repUnit,
  repUnitShort,
  repsText,
  RPE_CHOICES,
  targetText,
} from '../lib/display';
import { incrementKgFor } from '../lib/increments';
import { formatDate, todayLocalDate } from '../lib/localDate';
import { webNotifications } from '../platform';
import { SAFETY_HOLD_MESSAGE } from '../safety/SafetyBanner';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { abandonSession, finishSession, type SessionSummary } from './finish';
import { FinishSummary } from './FinishSummary';
import { RestTimer } from './RestTimer';
import { draftFor, useSessionStore, type SetDraft } from './sessionStore';
import { SubstitutionSheet } from './SubstitutionSheet';

export function SessionMode(): ReactNode {
  const { workoutId } = useParams<{ workoutId: string }>();
  const navigate = useNavigate();
  const repos = useRepos();
  const invalidate = useInvalidate();
  const unitSystem = useUnitSystem();
  const today = todayLocalDate();

  const { data: workout, isPending } = useWorkout(workoutId);
  const exerciseIndex = useExerciseIndex();
  const { data: equipment = [] } = useEquipment();
  const { data: openSafety = [] } = useOpenSafetyEvents();

  const begin = useSessionStore((state) => state.begin);
  const activeIndex = useSessionStore((state) => state.activeIndex);
  const setActiveIndex = useSessionStore((state) => state.setActiveIndex);
  const drafts = useSessionStore((state) => state.drafts);
  const patchDraft = useSessionStore((state) => state.patchDraft);
  const seedDraft = useSessionStore((state) => state.seedDraft);
  const clearDraft = useSessionStore((state) => state.clearDraft);
  const restEndsAt = useSessionStore((state) => state.restEndsAt);
  const restTotalSec = useSessionStore((state) => state.restTotalSec);
  const startRest = useSessionStore((state) => state.startRest);
  const stopRest = useSessionStore((state) => state.stopRest);
  const resetSession = useSessionStore((state) => state.reset);

  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [substituting, setSubstituting] = useState(false);
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * DESIGN.md §7.2 — "a crash loses nothing". A rejected write (the OPFS worker
   * losing its handle, a quota error) must be visible, and the draft is kept so
   * the user can confirm the same set again rather than assume the tap landed.
   */
  const [error, setError] = useState<string | null>(null);

  const reportFailure = useCallback((cause: unknown, fallback: string) => {
    setError(cause instanceof Error && cause.message ? cause.message : fallback);
  }, []);

  useEffect(() => {
    if (workoutId) begin(workoutId);
  }, [workoutId, begin]);

  // Starting stamps `startedAt`, which the finish summary turns into duration.
  useEffect(() => {
    if (!workout || workout.status !== 'planned') return;
    void repos.workouts.start(workout.id).then(() => invalidate('updateWorkout'));
  }, [workout, repos, invalidate]);

  const slots = workout?.exercises ?? [];
  const slot: WorkoutExerciseWithSets | undefined = slots[Math.min(activeIndex, slots.length - 1)];
  const exercise: Exercise | undefined = slot ? exerciseIndex.get(slot.exerciseId) : undefined;
  const { data: history = [] } = useExerciseHistory(slot?.exerciseId, 3);

  const lastSession = useMemo(
    () => history.find((session) => session.workoutId !== workout?.id) ?? null,
    [history, workout?.id],
  );

  const incrementKg = incrementKgFor({
    exercise,
    equipment,
    unitSystem,
    currentLoadKg: slot?.targetLoadKg ?? null,
  });

  const safetyActive = openSafety.length > 0;

  const confirmSet = useCallback(
    async (set: SetRecord) => {
      if (!slot) return;
      const draft = draftFor(drafts, set.id);
      const reps = countFromText(draft.reps) ?? set.targetReps;
      const loadKg = loadFromText(draft.load, unitSystem);
      setBusy(true);
      setError(null);
      try {
        await repos.sets.record(set.id, {
          actualReps: reps,
          actualLoadKg: loadKg,
          rpe: draft.rpe,
          notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
        });
        await invalidate('recordSet');
        // Only drop the draft once the write is on disk.
        clearDraft(set.id);
        startRest(slot.restSec);
        void scheduleRestAlert(set.id, slot.restSec, exercise?.name ?? 'your next set');
      } catch (cause) {
        reportFailure(cause, 'That set could not be saved to this device.');
      } finally {
        setBusy(false);
      }
    },
    [
      slot,
      drafts,
      unitSystem,
      repos,
      invalidate,
      clearDraft,
      startRest,
      exercise?.name,
      reportFailure,
    ],
  );

  async function undoSet(setId: Id): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await repos.sets.clearResult(setId);
      await invalidate('recordSet');
    } catch (cause) {
      reportFailure(cause, 'That set could not be undone.');
    } finally {
      setBusy(false);
    }
  }

  async function finish(): Promise<void> {
    if (!workout) return;
    setBusy(true);
    setError(null);
    try {
      const names = new Map<Id, string>(
        [...exerciseIndex.values()].map((row) => [row.id, row.name]),
      );
      const result = await finishSession(repos, workout.id, { unitSystem, exerciseNames: names });
      await invalidate('finishWorkout');
      stopRest();
      setSummary(result);
    } catch (cause) {
      reportFailure(cause, 'The session could not be closed.');
    } finally {
      setBusy(false);
    }
  }

  async function abandon(): Promise<void> {
    if (!workout) return;
    setBusy(true);
    setError(null);
    try {
      await abandonSession(repos, workout.id);
      await invalidate('finishWorkout');
      resetSession();
      navigate('/');
    } catch (cause) {
      setConfirmingAbandon(false);
      reportFailure(cause, 'The session could not be filed as abandoned.');
    } finally {
      setBusy(false);
    }
  }

  if (summary) {
    return <FinishSummary summary={summary} unitSystem={unitSystem} />;
  }

  if (isPending) {
    return <FullScreen>Loading your session…</FullScreen>;
  }
  if (!workout) {
    return <FullScreen>That session is not in your history any more.</FullScreen>;
  }
  if (!slot || !exercise) {
    return (
      <FullScreen>
        <EmptyState>
          This session has no exercises in it. Build one from Train, or plan today&apos;s session
          from Today.
        </EmptyState>
      </FullScreen>
    );
  }

  const repLabel = repUnit(exercise.loadType);
  const loadable = isLoadableLoadType(exercise.loadType);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: themeColor.bg,
        fontFamily: fontFamily.body,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: space.md,
          padding: `${space.md}px ${space.xl}px`,
          borderBottom: `1px solid ${themeColor.border}`,
          background: themeColor.surface,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, color: themeColor.textMuted, fontSize: fontSize.label }}>
            {workout.title} · {formatDate(workout.date)}
          </p>
          <p
            className="tabular"
            style={{ margin: 0, color: themeColor.text, fontSize: fontSize.subheading }}
          >
            Exercise {Math.min(activeIndex + 1, slots.length)} of {slots.length}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmingAbandon(true)}
          style={{
            background: 'none',
            border: `1px solid ${themeColor.border}`,
            borderRadius: radius.md,
            color: themeColor.textMuted,
            padding: `${space.xs}px ${space.md}px`,
            cursor: 'pointer',
          }}
        >
          Abandon session
        </button>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 760, margin: '0 auto', padding: space.xl }}>
        {safetyActive && (
          <Card tone="safety" style={{ marginBottom: space.lg, borderColor: themeColor.bad }}>
            <strong style={{ color: themeColor.text }}>Safety event open</strong>
            <p style={{ margin: `${space.xs}px 0 0`, color: themeColor.text }}>
              {SAFETY_HOLD_MESSAGE}
            </p>
            {/*
              The stored rationale only belongs here when it is the hold itself.
              A plan made before the event was reported still carries its
              PROGRESS_LOAD sentence, and printing that under a safety heading
              would tell the user to add load (DESIGN.md §6.5).
            */}
            {slot.progressionDecision?.rationale.codes.includes('SAFETY_HOLD') && (
              <p style={{ margin: `${space.xs}px 0 0`, color: themeColor.textMuted }}>
                {slot.progressionDecision.rationale.summary}
              </p>
            )}
            {!slot.progressionDecision?.rationale.codes.includes('SAFETY_HOLD') && (
              <p style={{ margin: `${space.xs}px 0 0`, color: themeColor.textMuted }}>
                Today&apos;s targets below were worked out before you reported this, so treat them
                as the ceiling, not the goal — stay at or under the load you see and stop if
                anything hurts.
              </p>
            )}
          </Card>
        )}

        {error != null && (
          <Card tone="safety" style={{ marginBottom: space.lg, borderColor: themeColor.bad }}>
            <strong style={{ color: themeColor.text }}>That did not save</strong>
            <p style={{ margin: `${space.xs}px 0 0`, color: themeColor.text }}>{error}</p>
            <p style={{ margin: `${space.xs}px 0 0`, color: themeColor.textMuted }}>
              What you typed is still in the boxes below — try confirming it again.
            </p>
          </Card>
        )}

        <CoachSlot name="sessionCoach" />

        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: space.md,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  fontFamily: fontFamily.display,
                  fontSize: fontSize.display,
                  color: themeColor.text,
                  margin: 0,
                }}
              >
                {exercise.name}
              </h1>
              <p
                className="tabular"
                style={{ margin: `${space.xs}px 0 0`, color: themeColor.textMuted }}
              >
                Target:{' '}
                {targetText({
                  sets: slot.targetSets,
                  repMin: slot.targetRepMin,
                  repMax: slot.targetRepMax,
                  loadKg: slot.targetLoadKg,
                  loadType: exercise.loadType,
                  unitSystem,
                  incrementKg,
                })}
              </p>
              <p
                className="tabular"
                style={{ margin: `${space.xs}px 0 0`, color: themeColor.textFaint }}
              >
                {lastSession
                  ? `Last time (${formatDate(lastSession.date)}): ${repsText(
                      lastSession.sets
                        .filter((set) => set.completed && !set.isWarmup)
                        .map((set) => set.actualReps ?? 0),
                    )} ${repLabel} at ${loggedLoadText(
                      lastSession.sets.find((set) => set.actualLoadKg != null)?.actualLoadKg ??
                        null,
                      unitSystem,
                    )}`
                  : 'No history for this exercise yet — today sets the baseline.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSubstituting(true)}
              style={{
                alignSelf: 'flex-start',
                background: 'none',
                border: `1px solid ${themeColor.borderStrong}`,
                borderRadius: radius.md,
                color: themeColor.text,
                padding: `${space.xs}px ${space.md}px`,
                cursor: 'pointer',
              }}
            >
              Can&apos;t do this
            </button>
          </div>
          <WhyDisclosure rationale={slot.progressionDecision?.rationale} />
        </Card>

        <ScrollX>
          <div style={{ marginTop: space.lg, display: 'grid', gap: space.md, minWidth: 320 }}>
            {slot.sets.map((set, index) => (
              <SetRow
                key={set.id}
                index={index}
                set={set}
                loadable={loadable}
                repLabel={repLabel}
                repShort={repUnitShort(exercise.loadType)}
                unitSystem={unitSystem}
                incrementKg={incrementKg}
                targetLoadKg={slot.targetLoadKg}
                draft={draftFor(drafts, set.id)}
                busy={busy}
                onSeed={seedDraft}
                onPatch={(patch) => patchDraft(set.id, patch)}
                onConfirm={() => void confirmSet(set)}
                onUndo={() => void undoSet(set.id)}
              />
            ))}
          </div>
        </ScrollX>

        {restEndsAt != null && (
          <div style={{ marginTop: space.lg }}>
            <RestTimer
              endsAt={restEndsAt}
              totalSec={restTotalSec}
              backgroundDelivery={webNotifications.supportsBackgroundDelivery()}
              onSkip={stopRest}
              onExtend={(seconds) => startRest(Math.max(0, secondsLeft(restEndsAt) + seconds))}
            />
          </div>
        )}

        <nav
          style={{
            display: 'flex',
            gap: space.md,
            marginTop: space.xl,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            disabled={activeIndex === 0}
            onClick={() => setActiveIndex(activeIndex - 1)}
            style={secondaryButton}
          >
            Previous exercise
          </button>
          <button
            type="button"
            disabled={activeIndex >= slots.length - 1}
            onClick={() => setActiveIndex(activeIndex + 1)}
            style={secondaryButton}
          >
            Next exercise
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" disabled={busy} onClick={() => void finish()} style={primaryButton}>
            Finish session
          </button>
        </nav>

        <div style={{ marginTop: space.lg, display: 'flex', gap: space.xs, flexWrap: 'wrap' }}>
          {slots.map((other, index) => (
            <Pill
              key={other.id}
              pressed={index === activeIndex}
              onClick={() => setActiveIndex(index)}
            >
              {exerciseIndex.get(other.exerciseId)?.name ?? 'Exercise'}
            </Pill>
          ))}
        </div>
      </main>

      {substituting && (
        <SubstitutionSheet
          workoutId={workout.id}
          workoutExerciseId={slot.id}
          exerciseId={slot.exerciseId}
          exerciseName={exercise.name}
          today={today}
          onClose={() => setSubstituting(false)}
          onApplied={() => setSubstituting(false)}
        />
      )}

      {confirmingAbandon && (
        <Sheet title="Abandon this session?" onClose={() => setConfirmingAbandon(false)}>
          <p style={{ color: themeColor.text }}>
            Every set you already confirmed stays in your history. The session is filed as
            abandoned, and your streak counts it as a missed planned day.
          </p>
          <div style={{ display: 'flex', gap: space.md, marginTop: space.lg, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void abandon()}
              style={{ ...primaryButton, background: themeColor.bad }}
            >
              Yes, abandon it
            </button>
            <button
              type="button"
              onClick={() => setConfirmingAbandon(false)}
              style={secondaryButton}
            >
              Keep going
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

const primaryButton = {
  padding: `${space.sm}px ${space.lg}px`,
  borderRadius: radius.md,
  border: 'none',
  background: themeColor.accent,
  color: themeColor.textOnAccent,
  fontSize: fontSize.body,
  fontWeight: 600,
  cursor: 'pointer',
} as const;

const secondaryButton = {
  padding: `${space.sm}px ${space.lg}px`,
  borderRadius: radius.md,
  border: `1px solid ${themeColor.border}`,
  background: 'transparent',
  color: themeColor.text,
  fontSize: fontSize.body,
  cursor: 'pointer',
} as const;

function secondsLeft(endsAt: number): number {
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

/** Tab-only rest alert — DESIGN.md §7.4. Silently does nothing without permission. */
async function scheduleRestAlert(setId: Id, restSec: number, exerciseName: string): Promise<void> {
  if (restSec <= 0) return;
  if (!(await webNotifications.hasPermission())) {
    const granted = await webNotifications.requestPermission();
    if (!granted) return;
  }
  await webNotifications.schedule({
    id: `rest-${setId}`,
    title: 'Rest is up',
    body: `Next set of ${exerciseName}.`,
    fireAt: new Date(Date.now() + restSec * 1000).toISOString(),
  });
}

function FullScreen({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: themeColor.bg,
        color: themeColor.textMuted,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: space.xl,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}

/**
 * One set row: target versus what the user actually did. Reps are labelled
 * with the load type's own unit — seconds or metres for `time`/`distance`
 * exercises, never "reps" (DESIGN.md §5.1 rule 5).
 */
function SetRow({
  index,
  set,
  loadable,
  repLabel,
  repShort,
  unitSystem,
  incrementKg,
  targetLoadKg,
  draft,
  busy,
  onSeed,
  onPatch,
  onConfirm,
  onUndo,
}: {
  index: number;
  set: SetRecord;
  loadable: boolean;
  repLabel: string;
  repShort: string;
  unitSystem: UnitSystem;
  incrementKg: number;
  targetLoadKg: number | null;
  draft: SetDraft;
  busy: boolean;
  /** `seedDraft` fills the boxes with the target once and never overwrites typing. */
  onSeed: (setId: Id, draft: SetDraft) => void;
  onPatch: (patch: Partial<SetDraft>) => void;
  onConfirm: () => void;
  onUndo: () => void;
}): ReactNode {
  const number = index + 1;
  const completed = set.completed;
  const targetReps = set.targetReps;
  const setId = set.id;

  useEffect(() => {
    if (completed) return;
    onSeed(setId, {
      reps: String(targetReps),
      load: targetLoadKg == null ? '' : String(loadValue(targetLoadKg, unitSystem, incrementKg)),
      rpe: null,
      notes: '',
    });
  }, [setId, completed, targetReps, targetLoadKg, unitSystem, incrementKg, onSeed]);

  if (set.completed) {
    return (
      <Card tone="raised">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: space.md,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span className="tabular" style={{ color: themeColor.text }}>
            Set {number} · {set.actualReps ?? 0} {repShort}
            {set.actualLoadKg != null && ` × ${loggedLoadText(set.actualLoadKg, unitSystem)}`}
            {set.rpe != null && ` · RPE ${set.rpe}`}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={onUndo}
            aria-label={`Undo set ${number}`}
            style={{
              background: 'none',
              border: 'none',
              color: themeColor.accent,
              cursor: 'pointer',
              fontSize: fontSize.label,
            }}
          >
            Undo
          </button>
        </div>
        {set.notes && (
          <p style={{ margin: `${space.xs}px 0 0`, color: themeColor.textMuted }}>{set.notes}</p>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <span
          className="tabular"
          style={{ fontFamily: fontFamily.display, fontSize: fontSize.subheading, minWidth: 64 }}
        >
          Set {number}
        </span>

        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>{repLabel}</span>
          <input
            aria-label={`Set ${number} ${repLabel}`}
            inputMode="numeric"
            value={draft.reps}
            onChange={(event) => onPatch({ reps: event.target.value })}
            style={{ ...inputStyle, width: 92 }}
          />
        </label>

        {loadable && (
          <label style={{ display: 'block' }}>
            <span style={fieldLabel}>Load ({loadUnit(unitSystem)})</span>
            <input
              aria-label={`Set ${number} load in ${loadUnit(unitSystem)}`}
              inputMode="decimal"
              value={draft.load}
              onChange={(event) => onPatch({ load: event.target.value })}
              style={{ ...inputStyle, width: 110 }}
            />
          </label>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          style={{ ...primaryButton, marginLeft: 'auto' }}
        >
          Confirm set {number}
        </button>
      </div>

      <div
        style={{ display: 'flex', gap: space.xs, flexWrap: 'wrap', marginTop: space.md }}
        role="group"
        aria-label={`Set ${number} RPE`}
      >
        <span style={{ ...fieldLabel, alignSelf: 'center' }}>RPE</span>
        {RPE_CHOICES.map((value) => (
          <Pill
            key={value}
            pressed={draft.rpe === value}
            onClick={() => onPatch({ rpe: draft.rpe === value ? null : value })}
          >
            {value}
          </Pill>
        ))}
      </div>

      <input
        aria-label={`Set ${number} notes`}
        placeholder="Notes — how did it move?"
        value={draft.notes}
        onChange={(event) => onPatch({ notes: event.target.value })}
        style={{ ...inputStyle, width: '100%', marginTop: space.md }}
      />
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
  fontVariantNumeric: 'tabular-nums',
} as const;
