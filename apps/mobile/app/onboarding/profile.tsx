import type { ActivityLevel, FitnessLevel, TrainingLocation, UnitSystem } from '@vigor/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useRepos } from '../../src/db/AppDataProvider';
import {
  Button,
  ChoiceRow,
  ErrorBanner,
  FieldLabel,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
  TextField,
} from '../../src/ui/components';

const UNIT_OPTIONS: readonly { value: UnitSystem; label: string }[] = [
  { value: 'metric', label: 'Metric (kg, cm)' },
  { value: 'imperial', label: 'Imperial (lb, in)' },
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
];

const ACTIVITY_OPTIONS: readonly { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];

export default function OnboardingProfileScreen() {
  const router = useRouter();
  const { profile } = useRepos();

  const [displayName, setDisplayName] = useState('');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [foodRegion, setFoodRegion] = useState('generic');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('beginner');
  const [trainingLocation, setTrainingLocation] = useState<TrainingLocation>('home');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function next() {
    setSaving(true);
    setError(null);
    try {
      await profile.save({
        displayName: displayName.trim().length > 0 ? displayName.trim() : 'You',
        birthDate: null,
        sex: null,
        heightCm: null,
        weightKg: null,
        fitnessLevel,
        trainingExperienceMonths: 0,
        preferredDurationMin: 45,
        preferredStyles: [],
        trainingLocation,
        unitSystem,
        foodRegion: foodRegion.trim().length > 0 ? foodRegion.trim() : 'generic',
        activityLevel,
        notes: null,
      });
      router.push('/onboarding/goals');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScreenTitle>About you</ScreenTitle>
      <ScreenBlurb>
        This stays on your device and shapes every recommendation VigorEngine makes.
      </ScreenBlurb>

      <Section title="Basics">
        <View style={{ padding: 16 }}>
          <TextField
            label="What should we call you?"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
          />
          <FieldLabel>Units</FieldLabel>
          <View style={{ marginBottom: 16 }}>
            <ChoiceRow value={unitSystem} options={UNIT_OPTIONS} onChange={setUnitSystem} />
          </View>
          <TextField
            label="Food region"
            hint="Used to recognise regional staples when estimating meals, e.g. IN for India."
            value={foodRegion}
            onChangeText={setFoodRegion}
            autoCapitalize="characters"
            placeholder="generic"
          />
        </View>
      </Section>

      <Section title="Fitness level">
        <View style={{ padding: 16 }}>
          <ChoiceRow
            value={fitnessLevel}
            options={FITNESS_LEVEL_OPTIONS}
            onChange={setFitnessLevel}
          />
        </View>
      </Section>

      <Section title="Where you train">
        <View style={{ padding: 16 }}>
          <ChoiceRow
            value={trainingLocation}
            options={LOCATION_OPTIONS}
            onChange={setTrainingLocation}
          />
        </View>
      </Section>

      <Section title="Daily activity outside training">
        <View style={{ padding: 16 }}>
          <ChoiceRow value={activityLevel} options={ACTIVITY_OPTIONS} onChange={setActivityLevel} />
        </View>
      </Section>

      {error ? <ErrorBanner message={error} /> : null}
      <Button label="Continue" onPress={next} loading={saving} />
    </Screen>
  );
}
