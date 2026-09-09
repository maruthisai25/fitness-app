/**
 * Eat → Targets. DESIGN.md §5.6: the recommended set is Mifflin-St Jeor × the
 * activity multiplier, adjusted for the highest-priority goal, and the user can
 * override any value. Overrides are new effective-dated rows — history is never
 * rewritten (DESIGN.md §4.2 `targets.create`).
 */

import {
  activeTargetsFor,
  computeInitialNutritionTargets,
  type LocalDate,
  type NutritionTargets,
} from '@vigor/core';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { Field, PrimaryButton, SecondaryButton, TextInput } from '../components/form';
import { Card, EmptyState, Notice, Section, Stat } from '../components/ui';
import { useDb } from '../db/provider';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { useActiveGoals, useInvalidate, useNutritionTargets, useProfile } from './data';

interface TargetDraft {
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
}

const EMPTY_DRAFT: TargetDraft = { kcal: '', proteinG: '', carbsG: '', fatG: '', fiberG: '' };

function draftOf(targets: NutritionTargets | null): TargetDraft {
  if (!targets) return EMPTY_DRAFT;
  return {
    kcal: String(targets.kcal),
    proteinG: String(targets.proteinG),
    carbsG: String(targets.carbsG),
    fatG: String(targets.fatG),
    fiberG: String(targets.fiberG),
  };
}

export function TargetsPanel({ today }: { today: LocalDate }): ReactNode {
  const { repos } = useDb();
  const invalidate = useInvalidate();
  const profile = useProfile();
  const goals = useActiveGoals();
  const targetsQuery = useNutritionTargets();

  const [draft, setDraft] = useState<TargetDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const active = useMemo(
    () => activeTargetsFor(today, targetsQuery.data ?? []),
    [today, targetsQuery.data],
  );

  const recommendation = useMemo(() => {
    if (!profile.data) return null;
    return computeInitialNutritionTargets({
      profile: profile.data,
      goals: (goals.data ?? []).map((goal) => ({
        type: goal.type,
        priority: goal.priority,
        active: goal.active,
      })),
      date: today,
    });
  }, [profile.data, goals.data, today]);

  if (profile.isPending || targetsQuery.isPending) {
    return <EmptyState>Loading your targets…</EmptyState>;
  }

  async function applyRecommended(): Promise<void> {
    if (!recommendation?.targets) return;
    setBusy(true);
    try {
      await repos.targets.create({ ...recommendation.targets, effectiveFrom: today });
      await invalidate('saveNutritionTargets');
      setDraft(null);
      setNote('Recommended targets are in force from today.');
    } finally {
      setBusy(false);
    }
  }

  async function saveOverride(): Promise<void> {
    if (!draft) return;
    setBusy(true);
    try {
      await repos.targets.create({
        effectiveFrom: today,
        kcal: Number(draft.kcal) || 0,
        proteinG: Number(draft.proteinG) || 0,
        carbsG: Number(draft.carbsG) || 0,
        fatG: Number(draft.fatG) || 0,
        fiberG: Number(draft.fiberG) || 0,
        source: 'user',
      });
      await invalidate('saveNutritionTargets');
      setDraft(null);
      setNote('Your own targets are in force from today.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Section title="In force today">
        {active ? (
          <Card>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                gap: space.lg,
              }}
            >
              <Stat label="Calories" value={String(active.kcal)} unit="kcal" tone="accent" />
              <Stat label="Protein" value={String(active.proteinG)} unit="g" />
              <Stat label="Carbs" value={String(active.carbsG)} unit="g" />
              <Stat label="Fat" value={String(active.fatG)} unit="g" />
              <Stat label="Fiber" value={String(active.fiberG)} unit="g" />
            </div>
            <p
              style={{
                margin: `${space.md}px 0 0`,
                color: themeColor.textMuted,
                fontSize: fontSize.label,
              }}
            >
              {active.source === 'computed' ? 'Recommended' : 'Set by you'}, effective from{' '}
              <span className="tabular">{active.effectiveFrom}</span>.
            </p>
          </Card>
        ) : (
          <EmptyState>
            You have no targets yet, so the day view can only show what you ate. Use the recommended
            set below, or type your own.
          </EmptyState>
        )}
        {note && (
          <p style={{ color: themeColor.good, fontSize: fontSize.label }} role="status">
            {note}
          </p>
        )}
      </Section>

      <Section title="Recommended">
        {recommendation?.targets ? (
          <Card>
            <p style={{ margin: `0 0 ${space.md}px`, color: themeColor.text, lineHeight: 1.5 }}>
              {recommendation.rationale.summary}
            </p>
            <div
              className="tabular"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                gap: space.lg,
                marginBottom: space.lg,
              }}
            >
              <Stat label="Calories" value={String(recommendation.targets.kcal)} unit="kcal" />
              <Stat label="Protein" value={String(recommendation.targets.proteinG)} unit="g" />
              <Stat label="Carbs" value={String(recommendation.targets.carbsG)} unit="g" />
              <Stat label="Fat" value={String(recommendation.targets.fatG)} unit="g" />
              <Stat label="Fiber" value={String(recommendation.targets.fiberG)} unit="g" />
            </div>
            <PrimaryButton onClick={() => void applyRecommended()} disabled={busy}>
              Use recommended
            </PrimaryButton>
          </Card>
        ) : (
          <Notice tone="warn">
            Recommended targets need your height and weight — Mifflin-St Jeor cannot run without
            them. Add both in You → Profile and this will fill in. Until then you can still set
            targets by hand below.
          </Notice>
        )}
      </Section>

      <Section title="Set your own">
        {draft == null ? (
          <SecondaryButton onClick={() => setDraft(draftOf(active))}>
            Override targets
          </SecondaryButton>
        ) : (
          <Card>
            <p style={{ margin: `0 0 ${space.md}px`, color: themeColor.textMuted, fontSize: fontSize.label }}>
              Saving writes a new row effective from today. Earlier days keep the targets they were
              judged against.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: space.md,
              }}
            >
              <Field label="Calories (kcal)">
                <TextInput
                  value={draft.kcal}
                  onChange={(value) => setDraft({ ...draft, kcal: value })}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Protein (g)">
                <TextInput
                  value={draft.proteinG}
                  onChange={(value) => setDraft({ ...draft, proteinG: value })}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Carbs (g)">
                <TextInput
                  value={draft.carbsG}
                  onChange={(value) => setDraft({ ...draft, carbsG: value })}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Fat (g)">
                <TextInput
                  value={draft.fatG}
                  onChange={(value) => setDraft({ ...draft, fatG: value })}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Fiber (g)">
                <TextInput
                  value={draft.fiberG}
                  onChange={(value) => setDraft({ ...draft, fiberG: value })}
                  inputMode="numeric"
                />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: space.sm }}>
              <PrimaryButton onClick={() => void saveOverride()} disabled={busy}>
                Save targets
              </PrimaryButton>
              <SecondaryButton onClick={() => setDraft(null)}>Cancel</SecondaryButton>
            </div>
          </Card>
        )}
      </Section>

      {(targetsQuery.data?.length ?? 0) > 1 && (
        <Section title="History">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {(targetsQuery.data ?? []).map((row) => (
              <li
                key={row.id}
                className="tabular"
                style={{
                  padding: `${space.sm}px 0`,
                  borderTop: `1px solid ${themeColor.border}`,
                  color: themeColor.textMuted,
                  fontSize: fontSize.label,
                }}
              >
                From {row.effectiveFrom}: {row.kcal} kcal · {row.proteinG} P · {row.carbsG} C ·{' '}
                {row.fatG} F · {row.fiberG} fiber ({row.source === 'computed' ? 'recommended' : 'yours'})
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
