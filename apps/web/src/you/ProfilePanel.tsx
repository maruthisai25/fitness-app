import type {
  ActivityLevel,
  FitnessLevel,
  Profile,
  Sex,
  TrainingLocation,
  UnitSystem,
} from '@vigor/core';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { Field, PrimaryButton, Select, TextInput } from '../components/form';
import { useDb } from '../db/provider';
import { themeColor } from '../theme/cssVars';

type Draft = {
  displayName: string;
  unitSystem: UnitSystem;
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
  notes: string;
};

function toDraft(profile: Profile): Draft {
  return {
    displayName: profile.displayName,
    unitSystem: profile.unitSystem,
    sex: profile.sex ?? 'prefer_not_to_say',
    heightCm: profile.heightCm?.toString() ?? '',
    weightKg: profile.weightKg?.toString() ?? '',
    fitnessLevel: profile.fitnessLevel,
    trainingExperienceMonths: String(profile.trainingExperienceMonths),
    activityLevel: profile.activityLevel,
    foodRegion: profile.foodRegion,
    trainingLocation: profile.trainingLocation,
    preferredDurationMin: String(profile.preferredDurationMin),
    preferredStyles: profile.preferredStyles.join(', '),
    notes: profile.notes ?? '',
  };
}

export function ProfilePanel(): ReactNode {
  const { repos } = useDb();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void repos.profile.get().then((profile) => {
      if (!cancelled && profile) setDraft(toDraft(profile));
    });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  if (!draft) {
    return <p style={{ color: themeColor.textMuted }}>Loading profile…</p>;
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(false);
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  async function save(): Promise<void> {
    if (!draft) return;
    setBusy(true);
    try {
      await repos.profile.update({
        displayName: draft.displayName.trim() || 'Athlete',
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
        notes: draft.notes.trim() || null,
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Field label="Name">
        <TextInput value={draft.displayName} onChange={(v) => set('displayName', v)} />
      </Field>
      <Field label="Units">
        <Select value={draft.unitSystem} onChange={(v) => set('unitSystem', v as UnitSystem)}>
          <option value="metric">Metric (kg, cm)</option>
          <option value="imperial">Imperial (lb, in)</option>
        </Select>
      </Field>
      <Field label={`Height (${draft.unitSystem === 'metric' ? 'cm' : 'in'})`}>
        <TextInput
          value={draft.heightCm}
          onChange={(v) => set('heightCm', v)}
          inputMode="decimal"
        />
      </Field>
      <Field label={`Weight (${draft.unitSystem === 'metric' ? 'kg' : 'lb'})`}>
        <TextInput
          value={draft.weightKg}
          onChange={(v) => set('weightKg', v)}
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
      <Field label="Training experience (months)">
        <TextInput
          value={draft.trainingExperienceMonths}
          onChange={(v) => set('trainingExperienceMonths', v)}
          inputMode="numeric"
        />
      </Field>
      <Field label="Activity level">
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
      <Field label="Food region">
        <TextInput value={draft.foodRegion} onChange={(v) => set('foodRegion', v)} />
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
      <Field label="Preferred duration (minutes)">
        <TextInput
          value={draft.preferredDurationMin}
          onChange={(v) => set('preferredDurationMin', v)}
          inputMode="numeric"
        />
      </Field>
      <Field label="Preferred styles" hint="Comma-separated">
        <TextInput value={draft.preferredStyles} onChange={(v) => set('preferredStyles', v)} />
      </Field>
      <Field label="Notes">
        <TextInput value={draft.notes} onChange={(v) => set('notes', v)} />
      </Field>
      <PrimaryButton onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save profile'}
      </PrimaryButton>
      {saved && <span style={{ color: themeColor.good, marginLeft: 12 }}>Saved</span>}
    </div>
  );
}
