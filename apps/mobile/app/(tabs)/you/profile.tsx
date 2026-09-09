import type {
  ActivityLevel,
  FitnessLevel,
  Profile,
  Sex,
  TrainingLocation,
  UnitSystem,
} from '@vigor/core';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { color, fontSize, space } from '../../../src/ui/tokens';

import { useRepos } from '../../../src/db/AppDataProvider';
import {
  Button,
  ChoiceRow,
  ErrorBanner,
  FieldLabel,
  LoadingScreen,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
  TextField,
} from '../../../src/ui/components';

const UNIT_OPTIONS: readonly { value: UnitSystem; label: string }[] = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
];

const FITNESS_LEVEL_OPTIONS: readonly { value: FitnessLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const LOCATION_OPTIONS: readonly { value: TrainingLocation; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'gym', label: 'Gym' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'hotel', label: 'Hotel' },
];

const ACTIVITY_OPTIONS: readonly { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];

const SEX_OPTIONS: readonly { value: Sex; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const STYLE_OPTIONS = [
  'Strength training',
  'Bodybuilding',
  'Calisthenics',
  'Circuit / conditioning',
  'Running',
  'Mobility / yoga',
] as const;

/** Draft form state; every field is a string so text inputs stay controlled. */
interface Draft {
  displayName: string;
  birthDate: string;
  sex: Sex | null;
  heightCm: string;
  weightKg: string;
  fitnessLevel: FitnessLevel;
  trainingExperienceMonths: string;
  preferredDurationMin: string;
  preferredStyles: string[];
  trainingLocation: TrainingLocation;
  unitSystem: UnitSystem;
  foodRegion: string;
  activityLevel: ActivityLevel;
  notes: string;
}

function toDraft(profile: Profile): Draft {
  return {
    displayName: profile.displayName,
    birthDate: profile.birthDate ?? '',
    sex: profile.sex,
    heightCm: profile.heightCm !== null ? String(profile.heightCm) : '',
    weightKg: profile.weightKg !== null ? String(profile.weightKg) : '',
    fitnessLevel: profile.fitnessLevel,
    trainingExperienceMonths: String(profile.trainingExperienceMonths),
    preferredDurationMin: String(profile.preferredDurationMin),
    preferredStyles: profile.preferredStyles,
    trainingLocation: profile.trainingLocation,
    unitSystem: profile.unitSystem,
    foodRegion: profile.foodRegion,
    activityLevel: profile.activityLevel,
    notes: profile.notes ?? '',
  };
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ProfileScreen() {
  const { profile: profileRepo } = useRepos();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    void profileRepo.get().then((current) =>
      setDraft(
        toDraft(
          current ?? {
            id: '',
            displayName: 'You',
            birthDate: null,
            sex: null,
            heightCm: null,
            weightKg: null,
            fitnessLevel: 'beginner',
            trainingExperienceMonths: 0,
            preferredDurationMin: 45,
            preferredStyles: [],
            trainingLocation: 'home',
            unitSystem: 'metric',
            foodRegion: 'generic',
            activityLevel: 'moderate',
            notes: null,
            updatedAt: new Date().toISOString(),
          },
        ),
      ),
    );
  }, [profileRepo]);

  function toggleStyle(style: string) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            preferredStyles: prev.preferredStyles.includes(style)
              ? prev.preferredStyles.filter((s) => s !== style)
              : [...prev.preferredStyles, style],
          }
        : prev,
    );
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await profileRepo.save({
        displayName: draft.displayName.trim().length > 0 ? draft.displayName.trim() : 'You',
        birthDate: draft.birthDate.trim().length > 0 ? draft.birthDate.trim() : null,
        sex: draft.sex,
        heightCm: toNumberOrNull(draft.heightCm),
        weightKg: toNumberOrNull(draft.weightKg),
        fitnessLevel: draft.fitnessLevel,
        trainingExperienceMonths: toNumberOrNull(draft.trainingExperienceMonths) ?? 0,
        preferredDurationMin: toNumberOrNull(draft.preferredDurationMin) ?? 45,
        preferredStyles: draft.preferredStyles,
        trainingLocation: draft.trainingLocation,
        unitSystem: draft.unitSystem,
        foodRegion: draft.foodRegion.trim().length > 0 ? draft.foodRegion.trim() : 'generic',
        activityLevel: draft.activityLevel,
        notes: draft.notes.trim().length > 0 ? draft.notes.trim() : null,
      });
      setSavedAt(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!draft) {
    return <LoadingScreen label="Loading your profile…" />;
  }

  return (
    <Screen>
      <ScreenTitle>Profile</ScreenTitle>
      <ScreenBlurb>Kept on this device and used to shape every recommendation.</ScreenBlurb>

      <Section title="Basics">
        <View style={{ padding: space.lg }}>
          <TextField
            label="Name"
            value={draft.displayName}
            onChangeText={(v) => setDraft({ ...draft, displayName: v })}
          />
          <TextField
            label="Birth date"
            placeholder="YYYY-MM-DD"
            value={draft.birthDate}
            onChangeText={(v) => setDraft({ ...draft, birthDate: v })}
          />
          <FieldLabel>Sex</FieldLabel>
          <View style={{ marginBottom: space.lg }}>
            <ChoiceRow
              value={draft.sex ?? 'prefer_not_to_say'}
              options={SEX_OPTIONS}
              onChange={(v) => setDraft({ ...draft, sex: v })}
            />
          </View>
          <TextField
            label={`Height (${draft.unitSystem === 'metric' ? 'cm' : 'in'})`}
            keyboardType="numeric"
            value={draft.heightCm}
            onChangeText={(v) => setDraft({ ...draft, heightCm: v })}
          />
          <TextField
            label={`Weight (${draft.unitSystem === 'metric' ? 'kg' : 'lb'})`}
            keyboardType="numeric"
            value={draft.weightKg}
            onChangeText={(v) => setDraft({ ...draft, weightKg: v })}
          />
          <FieldLabel>Units</FieldLabel>
          <ChoiceRow
            value={draft.unitSystem}
            options={UNIT_OPTIONS}
            onChange={(v) => setDraft({ ...draft, unitSystem: v })}
          />
        </View>
      </Section>

      <Section title="Training">
        <View style={{ padding: space.lg }}>
          <FieldLabel>Fitness level</FieldLabel>
          <View style={{ marginBottom: space.lg }}>
            <ChoiceRow
              value={draft.fitnessLevel}
              options={FITNESS_LEVEL_OPTIONS}
              onChange={(v) => setDraft({ ...draft, fitnessLevel: v })}
            />
          </View>
          <TextField
            label="Training experience (months)"
            keyboardType="numeric"
            value={draft.trainingExperienceMonths}
            onChangeText={(v) => setDraft({ ...draft, trainingExperienceMonths: v })}
          />
          <TextField
            label="Preferred session length (minutes)"
            keyboardType="numeric"
            value={draft.preferredDurationMin}
            onChangeText={(v) => setDraft({ ...draft, preferredDurationMin: v })}
          />
          <FieldLabel>Where you train</FieldLabel>
          <View style={{ marginBottom: space.lg }}>
            <ChoiceRow
              value={draft.trainingLocation}
              options={LOCATION_OPTIONS}
              onChange={(v) => setDraft({ ...draft, trainingLocation: v })}
            />
          </View>
          <FieldLabel>Preferred styles</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {STYLE_OPTIONS.map((style) => {
              const active = draft.preferredStyles.includes(style);
              return (
                <Pressable
                  key={style}
                  onPress={() => toggleStyle(style)}
                  style={{
                    paddingVertical: space.sm,
                    paddingHorizontal: space.md,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? color.accent : color.borderStrong,
                    backgroundColor: active ? color.accentSoft : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      color: active ? color.accent : color.textMuted,
                      fontSize: fontSize.label,
                    }}
                  >
                    {style}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Section>

      <Section title="Nutrition">
        <View style={{ padding: space.lg }}>
          <TextField
            label="Food region"
            hint="Used to recognise regional staples when estimating meals, e.g. IN for India."
            autoCapitalize="characters"
            value={draft.foodRegion}
            onChangeText={(v) => setDraft({ ...draft, foodRegion: v })}
          />
          <FieldLabel>Daily activity outside training</FieldLabel>
          <ChoiceRow
            value={draft.activityLevel}
            options={ACTIVITY_OPTIONS}
            onChange={(v) => setDraft({ ...draft, activityLevel: v })}
          />
        </View>
      </Section>

      <Section title="Notes">
        <View style={{ padding: space.lg }}>
          <TextField
            label="Anything else the coach should know"
            multiline
            numberOfLines={3}
            value={draft.notes}
            onChangeText={(v) => setDraft({ ...draft, notes: v })}
          />
        </View>
      </Section>

      {error ? <ErrorBanner message={error} /> : null}
      <Button label={savedAt ? 'Saved' : 'Save changes'} onPress={save} loading={saving} />
    </Screen>
  );
}
