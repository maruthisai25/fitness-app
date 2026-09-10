import type {
  ActivityLevel,
  EquipmentCategory,
  FitnessLevel,
  GoalType,
  Sex,
  TrainingLocation,
  UnitSystem,
} from '@vigor/core';
import { fontFamily, radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { useDb } from '../db/provider';
import { webSecureStore } from '../platform/secureStore';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { Field, OnboardingShell, PrimaryButton, SecondaryButton, Select, TextInput } from './ui';

/** Opaque handle stored in `settings.apiKeyRef` once a key is saved (DESIGN.md §4.1). */
export const ANTHROPIC_API_KEY_REF = 'anthropic-api-key';

const STEPS = ['welcome', 'profile', 'goals', 'equipment', 'duration', 'apiKey'] as const;
type Step = (typeof STEPS)[number];

interface GoalDraft {
  type: GoalType;
  priority: number;
  targetNote: string;
}

interface EquipmentDraft {
  name: string;
  category: EquipmentCategory;
  available: boolean;
}

interface OnboardingDraft {
  displayName: string;
  unitSystem: UnitSystem;
  /** `YYYY-MM-DD`, or empty when the user would rather not say. */
  birthDate: string;
  sex: Sex;
  heightCm: string;
  weightKg: string;
  fitnessLevel: FitnessLevel;
  trainingExperienceMonths: string;
  activityLevel: ActivityLevel;
  foodRegion: string;
  trainingLocation: TrainingLocation;
  preferredDurationMin: string;
  preferredStyles: string;
  goals: GoalDraft[];
  equipment: EquipmentDraft[];
  apiKey: string;
}

const DEFAULT_DRAFT: OnboardingDraft = {
  displayName: '',
  unitSystem: 'metric',
  birthDate: '',
  sex: 'prefer_not_to_say',
  heightCm: '',
  weightKg: '',
  fitnessLevel: 'beginner',
  trainingExperienceMonths: '0',
  activityLevel: 'moderate',
  foodRegion: 'generic',
  trainingLocation: 'home',
  preferredDurationMin: '45',
  preferredStyles: '',
  goals: [{ type: 'general', priority: 1, targetNote: '' }],
  equipment: [{ name: 'Bodyweight', category: 'bodyweight', available: true }],
  apiKey: '',
};

const GOAL_TYPES: GoalType[] = [
  'strength',
  'hypertrophy',
  'fat_loss',
  'general',
  'endurance',
  'mobility',
  'conditioning',
  'consistency',
];

const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
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

/**
 * Welcome + disclaimer, profile basics, goals, equipment, duration/style,
 * API key — DESIGN.md §9 phase 0 ("onboarding + profile + settings screens
 * on both apps"), same flow as mobile.
 */
export function OnboardingFlow({ onComplete }: { onComplete: () => void }): ReactNode {
  const { repos, refreshSettings } = useDb();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(DEFAULT_DRAFT);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step: Step = STEPS[stepIndex] ?? 'welcome';
  const isLast = stepIndex === STEPS.length - 1;

  function goNext(): void {
    setError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }
  function goBack(): void {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function finish(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await repos.profile.save({
        displayName: draft.displayName.trim() || 'Athlete',
        // Real, not a placeholder: `packages/core/nutrition` falls back to a
        // default age for BMR without it, and says so in the rationale.
        birthDate: draft.birthDate.trim() || null,
        sex: draft.sex,
        heightCm: draft.heightCm ? Number(draft.heightCm) : null,
        weightKg: draft.weightKg ? Number(draft.weightKg) : null,
        fitnessLevel: draft.fitnessLevel,
        trainingExperienceMonths: Number(draft.trainingExperienceMonths) || 0,
        preferredDurationMin: Number(draft.preferredDurationMin) || 45,
        preferredStyles: draft.preferredStyles
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        trainingLocation: draft.trainingLocation,
        unitSystem: draft.unitSystem,
        foodRegion: draft.foodRegion.trim() || 'generic',
        activityLevel: draft.activityLevel,
        notes: null,
      });
      for (const goal of draft.goals) {
        await repos.goals.create({
          ...goal,
          targetNote: goal.targetNote.trim() || null,
          active: true,
        });
      }
      for (const item of draft.equipment) {
        await repos.equipment.create(item);
      }

      const trimmedKey = draft.apiKey.trim();
      if (trimmedKey) {
        await webSecureStore.set(ANTHROPIC_API_KEY_REF, trimmedKey);
      }

      await repos.settings.setMany({
        onboardingComplete: true,
        disclaimerAcceptedAt: repos.db.now(),
        apiKeyRef: trimmedKey ? ANTHROPIC_API_KEY_REF : null,
      });
      await refreshSettings();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingShell stepIndex={stepIndex} stepCount={STEPS.length}>
      {step === 'welcome' && (
        <WelcomeStep
          accepted={disclaimerAccepted}
          onAcceptedChange={setDisclaimerAccepted}
          onNext={goNext}
        />
      )}
      {step === 'profile' && (
        <ProfileStep draft={draft} onChange={setDraft} onNext={goNext} onBack={goBack} />
      )}
      {step === 'goals' && (
        <GoalsStep
          goals={draft.goals}
          onChange={(goals) => setDraft((d) => ({ ...d, goals }))}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {step === 'equipment' && (
        <EquipmentStep
          equipment={draft.equipment}
          onChange={(equipment) => setDraft((d) => ({ ...d, equipment }))}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {step === 'duration' && (
        <DurationStyleStep draft={draft} onChange={setDraft} onNext={goNext} onBack={goBack} />
      )}
      {step === 'apiKey' && (
        <ApiKeyStep
          apiKey={draft.apiKey}
          onChange={(apiKey) => setDraft((d) => ({ ...d, apiKey }))}
          onBack={goBack}
          onFinish={finish}
          busy={busy}
          error={error}
          isLast={isLast}
        />
      )}
    </OnboardingShell>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — welcome + disclaimer
// ---------------------------------------------------------------------------

function WelcomeStep({
  accepted,
  onAcceptedChange,
  onNext,
}: {
  accepted: boolean;
  onAcceptedChange: (v: boolean) => void;
  onNext: () => void;
}): ReactNode {
  return (
    <div>
      <h1
        style={{
          fontFamily: fontFamily.display,
          fontSize: fontSize.display,
          color: themeColor.text,
          margin: 0,
        }}
      >
        Welcome to VigorEngine
      </h1>
      <p style={{ color: themeColor.textMuted, lineHeight: 1.5, marginTop: space.md }}>
        VigorEngine is a local-first AI fitness coach. Your workouts, nutrition, and history stay on
        this device — the only outbound request it ever makes is to <code>api.anthropic.com</code>,
        and only when you ask it to reason.
      </p>
      <div
        style={{
          background: themeColor.surfaceRaised,
          border: `1px solid ${themeColor.border}`,
          borderRadius: radius.md,
          padding: space.lg,
          marginTop: space.lg,
        }}
      >
        <p style={{ margin: 0, color: themeColor.text, fontWeight: 600 }}>Not medical advice</p>
        <p style={{ margin: `${space.sm}px 0 0`, color: themeColor.textMuted, lineHeight: 1.5 }}>
          VigorEngine is a training and nutrition planning tool, not a medical professional. It
          cannot diagnose injuries or illness. Stop and consult a qualified professional if you
          experience pain, dizziness, chest symptoms, or anything unusual during training.
        </p>
        <label
          style={{
            display: 'flex',
            gap: space.sm,
            alignItems: 'flex-start',
            marginTop: space.md,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => onAcceptedChange(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span style={{ color: themeColor.text }}>I understand and accept this.</span>
        </label>
      </div>
      <PrimaryButton disabled={!accepted} onClick={onNext} style={{ marginTop: space.xl }}>
        Continue
      </PrimaryButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — profile basics
// ---------------------------------------------------------------------------

function ProfileStep({
  draft,
  onChange,
  onNext,
  onBack,
}: {
  draft: OnboardingDraft;
  onChange: (updater: (d: OnboardingDraft) => OnboardingDraft) => void;
  onNext: () => void;
  onBack: () => void;
}): ReactNode {
  const set = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) =>
    onChange((d) => ({ ...d, [key]: value }));

  return (
    <div>
      <StepHeading
        title="Profile basics"
        subtitle="Used to size your workouts and nutrition targets."
      />
      <Field label="Name">
        <TextInput
          value={draft.displayName}
          onChange={(v) => set('displayName', v)}
          placeholder="Athlete"
        />
      </Field>
      <Field label="Units">
        <Select value={draft.unitSystem} onChange={(v) => set('unitSystem', v as UnitSystem)}>
          <option value="metric">Metric (kg, cm)</option>
          <option value="imperial">Imperial (lb, in)</option>
        </Select>
      </Field>
      <Field
        label="Birth date"
        hint="Your age is one of the four numbers in the Mifflin-St Jeor equation behind your calorie target. Leave it blank and a default age is assumed instead."
      >
        <TextInput
          value={draft.birthDate}
          onChange={(v) => set('birthDate', v)}
          type="date"
          placeholder="YYYY-MM-DD"
        />
      </Field>
      <Field label="Sex">
        <Select value={draft.sex} onChange={(v) => set('sex', v as Sex)}>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </Select>
      </Field>
      <Field label={`Height (${draft.unitSystem === 'metric' ? 'cm' : 'in'})`}>
        <TextInput
          value={draft.heightCm}
          onChange={(v) => set('heightCm', v)}
          placeholder="175"
          inputMode="decimal"
        />
      </Field>
      <Field label={`Weight (${draft.unitSystem === 'metric' ? 'kg' : 'lb'})`}>
        <TextInput
          value={draft.weightKg}
          onChange={(v) => set('weightKg', v)}
          placeholder="70"
          inputMode="decimal"
        />
      </Field>
      <Field label="Fitness level">
        <Select value={draft.fitnessLevel} onChange={(v) => set('fitnessLevel', v as FitnessLevel)}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </Select>
      </Field>
      <Field label="Activity level (outside training)">
        <Select
          value={draft.activityLevel}
          onChange={(v) => set('activityLevel', v as ActivityLevel)}
        >
          <option value="sedentary">Sedentary</option>
          <option value="light">Light</option>
          <option value="moderate">Moderate</option>
          <option value="active">Active</option>
          <option value="very_active">Very active</option>
        </Select>
      </Field>
      <Field
        label="Food region"
        hint="Helps the AI recognise regional staples (e.g. IN for India), or leave generic."
      >
        <TextInput
          value={draft.foodRegion}
          onChange={(v) => set('foodRegion', v)}
          placeholder="generic"
        />
      </Field>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — goals
// ---------------------------------------------------------------------------

function GoalsStep({
  goals,
  onChange,
  onNext,
  onBack,
}: {
  goals: GoalDraft[];
  onChange: (goals: GoalDraft[]) => void;
  onNext: () => void;
  onBack: () => void;
}): ReactNode {
  return (
    <div>
      <StepHeading title="Goals" subtitle="Multiple goals can coexist — priority 1 is highest." />
      {goals.map((goal, index) => (
        <div
          key={index}
          style={{ display: 'flex', gap: space.sm, alignItems: 'center', marginBottom: space.sm }}
        >
          <Select
            value={goal.type}
            onChange={(v) => {
              const next = [...goals];
              next[index] = { ...goal, type: v as GoalType };
              onChange(next);
            }}
          >
            {GOAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace('_', ' ')}
              </option>
            ))}
          </Select>
          <TextInput
            value={String(goal.priority)}
            onChange={(v) => {
              const next = [...goals];
              next[index] = { ...goal, priority: Number(v) || 1 };
              onChange(next);
            }}
            inputMode="numeric"
            style={{ width: 60 }}
            placeholder="1"
          />
          <SecondaryButton
            onClick={() => onChange(goals.filter((_, i) => i !== index))}
            disabled={goals.length <= 1}
          >
            Remove
          </SecondaryButton>
        </div>
      ))}
      <SecondaryButton
        onClick={() =>
          onChange([...goals, { type: 'general', priority: goals.length + 1, targetNote: '' }])
        }
      >
        Add goal
      </SecondaryButton>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — equipment
// ---------------------------------------------------------------------------

function EquipmentStep({
  equipment,
  onChange,
  onNext,
  onBack,
}: {
  equipment: EquipmentDraft[];
  onChange: (equipment: EquipmentDraft[]) => void;
  onNext: () => void;
  onBack: () => void;
}): ReactNode {
  return (
    <div>
      <StepHeading
        title="Equipment"
        subtitle="What you can train with — this filters exercise selection."
      />
      {equipment.map((item, index) => (
        <div
          key={index}
          style={{ display: 'flex', gap: space.sm, alignItems: 'center', marginBottom: space.sm }}
        >
          <TextInput
            value={item.name}
            onChange={(v) => {
              const next = [...equipment];
              next[index] = { ...item, name: v };
              onChange(next);
            }}
            placeholder="Name"
            style={{ flex: 1 }}
          />
          <Select
            value={item.category}
            onChange={(v) => {
              const next = [...equipment];
              next[index] = { ...item, category: v as EquipmentCategory };
              onChange(next);
            }}
          >
            {EQUIPMENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
          <SecondaryButton onClick={() => onChange(equipment.filter((_, i) => i !== index))}>
            Remove
          </SecondaryButton>
        </div>
      ))}
      <SecondaryButton
        onClick={() => onChange([...equipment, { name: '', category: 'other', available: true }])}
      >
        Add equipment
      </SecondaryButton>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — duration / style
// ---------------------------------------------------------------------------

function DurationStyleStep({
  draft,
  onChange,
  onNext,
  onBack,
}: {
  draft: OnboardingDraft;
  onChange: (updater: (d: OnboardingDraft) => OnboardingDraft) => void;
  onNext: () => void;
  onBack: () => void;
}): ReactNode {
  const set = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) =>
    onChange((d) => ({ ...d, [key]: value }));
  return (
    <div>
      <StepHeading
        title="Duration & style"
        subtitle="A starting point — VigorEngine adapts this over time."
      />
      <Field label="Preferred session length (minutes)">
        <TextInput
          value={draft.preferredDurationMin}
          onChange={(v) => set('preferredDurationMin', v)}
          inputMode="numeric"
          placeholder="45"
        />
      </Field>
      <Field label="Training location">
        <Select
          value={draft.trainingLocation}
          onChange={(v) => set('trainingLocation', v as TrainingLocation)}
        >
          <option value="home">Home</option>
          <option value="gym">Gym</option>
          <option value="outdoor">Outdoor</option>
          <option value="hotel">Hotel / travel</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Preferred styles" hint="Comma-separated, e.g. strength, circuits, mobility">
        <TextInput
          value={draft.preferredStyles}
          onChange={(v) => set('preferredStyles', v)}
          placeholder="strength, circuits"
        />
      </Field>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — API key
// ---------------------------------------------------------------------------

function ApiKeyStep({
  apiKey,
  onChange,
  onBack,
  onFinish,
  busy,
  error,
  isLast,
}: {
  apiKey: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onFinish: () => void;
  busy: boolean;
  error: string | null;
  isLast: boolean;
}): ReactNode {
  return (
    <div>
      <StepHeading
        title="Anthropic API key"
        subtitle="Optional now — you can add it later in You → Settings. Nothing works offline is blocked by skipping this."
      />
      <div
        style={{
          background: themeColor.accentSoft,
          border: `1px solid ${themeColor.border}`,
          borderRadius: radius.md,
          padding: space.md,
          marginBottom: space.md,
          color: themeColor.text,
          fontSize: fontSize.label,
          lineHeight: 1.5,
        }}
      >
        This key is stored in your browser's IndexedDB, which is{' '}
        <strong>not hardware-backed</strong> — unlike the secure enclave mobile uses, anything with
        local code execution on this device could read it. The key is sent only to{' '}
        <code>api.anthropic.com</code> and never anywhere else; it is never logged or included in an
        export bundle, and you can remove it with one tap in Settings.
      </div>
      <Field label="API key">
        <TextInput value={apiKey} onChange={onChange} placeholder="sk-ant-…" type="password" />
      </Field>
      {error && <p style={{ color: themeColor.bad }}>{error}</p>}
      <div style={{ display: 'flex', gap: space.sm, marginTop: space.xl }}>
        <SecondaryButton onClick={onBack} disabled={busy}>
          Back
        </SecondaryButton>
        <PrimaryButton onClick={onFinish} disabled={busy}>
          {busy ? 'Saving…' : isLast ? 'Finish' : 'Continue'}
        </PrimaryButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function StepHeading({ title, subtitle }: { title: string; subtitle: string }): ReactNode {
  return (
    <div style={{ marginBottom: space.lg }}>
      <h2
        style={{
          fontFamily: fontFamily.display,
          fontSize: fontSize.title,
          color: themeColor.text,
          margin: 0,
        }}
      >
        {title}
      </h2>
      <p style={{ color: themeColor.textMuted, margin: `${space.xs}px 0 0` }}>{subtitle}</p>
    </div>
  );
}

function StepNav({ onBack, onNext }: { onBack: () => void; onNext: () => void }): ReactNode {
  return (
    <div style={{ display: 'flex', gap: space.sm, marginTop: space.xl }}>
      <SecondaryButton onClick={onBack}>Back</SecondaryButton>
      <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
    </div>
  );
}
