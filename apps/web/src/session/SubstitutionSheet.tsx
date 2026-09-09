/**
 * "Can't do this" sheet — DESIGN.md §7.1. The ranking comes from the
 * substitution engine (§5.5) and every candidate shows its own rationale, so
 * the swap is explainable before it is applied.
 */

import { radius, space } from '@vigor/ui-tokens';
import type { Id, SubstitutionReason, SubstitutionResult } from '@vigor/core';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { InlineCoachAsk } from '../coach/InlineCoachAsk';
import { Sheet, WhyDisclosure } from '../components/ui';
import { useInvalidate, useRepos } from '../data/hooks';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { applySubstitution, rankSubstitutes, SUBSTITUTION_REASONS } from './substitution';

export function SubstitutionSheet({
  workoutId,
  workoutExerciseId,
  exerciseId,
  exerciseName,
  today,
  onClose,
  onApplied,
}: {
  workoutId: Id;
  workoutExerciseId: Id;
  exerciseId: Id;
  exerciseName: string;
  today: string;
  onClose: () => void;
  onApplied: () => void;
}): ReactNode {
  const repos = useRepos();
  const invalidate = useInvalidate();
  const [reason, setReason] = useState<SubstitutionReason>('equipment_unavailable');
  const [result, setResult] = useState<SubstitutionResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    void rankSubstitutes(repos, { workoutId, exerciseId, reason, today }).then((ranked) => {
      if (!cancelled) setResult(ranked);
    });
    return () => {
      cancelled = true;
    };
  }, [repos, workoutId, exerciseId, reason, today]);

  async function choose(toExerciseId: Id): Promise<void> {
    setBusy(true);
    try {
      await applySubstitution(repos, { workoutExerciseId, toExerciseId, today });
      if (reason === 'pain') {
        await repos.safety.create({
          date: today,
          kind: 'pain',
          text: `${exerciseName} hurt during the session, so it was swapped out.`,
          source: 'session',
        });
        await invalidate('reportSafety');
      }
      await invalidate('substituteExercise');
      onApplied();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Swap out ${exerciseName}`} onClose={onClose}>
      <label style={{ display: 'block', marginBottom: space.md }}>
        <span
          style={{
            display: 'block',
            fontSize: fontSize.label,
            color: themeColor.textMuted,
            marginBottom: space.xs,
          }}
        >
          What is wrong with it?
        </span>
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as SubstitutionReason)}
          style={{
            width: '100%',
            padding: `${space.sm}px ${space.md}px`,
            borderRadius: radius.sm,
            border: `1px solid ${themeColor.border}`,
            background: themeColor.surfaceRaised,
            color: themeColor.text,
            fontSize: fontSize.body,
          }}
        >
          {SUBSTITUTION_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {reason === 'pain' && (
        <p style={{ color: themeColor.warn, fontSize: fontSize.label, marginTop: 0 }}>
          Choosing a swap for pain opens a safety event: loads hold until you resolve it, and
          VigorEngine is not medical advice.
        </p>
      )}

      <div
        style={{
          borderTop: `1px solid ${themeColor.border}`,
          borderBottom: `1px solid ${themeColor.border}`,
          padding: `${space.md}px 0`,
          marginBottom: space.md,
        }}
      >
        {/* DESIGN.md §9 phase 2/3: the coach can run the same substitution
            engine in addition to the local ranking below — never instead. */}
        <InlineCoachAsk
          label="Ask the coach for a swap instead"
          busyLabel="Asking the coach…"
          prompt={`Please swap out ${exerciseName} in today's workout (workoutExerciseId: ${workoutExerciseId}) using substitute_exercise. Reason: ${
            SUBSTITUTION_REASONS.find((option) => option.value === reason)?.label ?? reason
          }.${reason === 'pain' ? ' It hurts.' : ''}`}
        />
      </div>

      {!result && <p style={{ color: themeColor.textMuted }}>Ranking alternatives…</p>}

      {result && result.candidates.length === 0 && (
        <p style={{ color: themeColor.textMuted }}>{result.rationale.summary}</p>
      )}

      {result?.candidates.map((candidate) => (
        <div
          key={candidate.exerciseId}
          style={{
            border: `1px solid ${themeColor.border}`,
            borderRadius: radius.md,
            padding: space.md,
            marginBottom: space.sm,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: space.md,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <strong style={{ color: themeColor.text }}>{candidate.name}</strong>
            <button
              type="button"
              disabled={busy}
              onClick={() => void choose(candidate.exerciseId)}
              style={{
                padding: `${space.xs}px ${space.md}px`,
                borderRadius: radius.md,
                border: 'none',
                background: themeColor.accent,
                color: themeColor.textOnAccent,
                fontSize: fontSize.label,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Use {candidate.name}
            </button>
          </div>
          <p
            className="tabular"
            style={{
              margin: `${space.xs}px 0 0`,
              color: themeColor.textMuted,
              fontSize: fontSize.label,
            }}
          >
            {Math.round(candidate.muscleOverlapRatio * 100)} % muscle overlap · difficulty{' '}
            {candidate.difficultyDelta >= 0 ? '+' : ''}
            {candidate.difficultyDelta} · score {candidate.score}
          </p>
          <WhyDisclosure rationale={candidate.rationale} />
        </div>
      ))}
    </Sheet>
  );
}
