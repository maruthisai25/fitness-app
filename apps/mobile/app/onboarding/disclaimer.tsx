import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useRepos } from '../../src/db/AppDataProvider';
import { Button, ErrorBanner, Screen, ScreenBlurb, ScreenTitle } from '../../src/ui/components';

/** DESIGN.md §6.5: "The onboarding disclaimer states VigorEngine is not medical advice." */
export default function DisclaimerScreen() {
  const router = useRouter();
  const { settings } = useRepos();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setSaving(true);
    setError(null);
    try {
      await settings.setMany({ disclaimerAcceptedAt: new Date().toISOString() });
      router.push('/onboarding/profile');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your acceptance.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScreenTitle>Before you start</ScreenTitle>
      <ScreenBlurb>
        VigorEngine is not medical advice. It cannot diagnose or treat any condition, and it is not
        a substitute for a doctor, physical therapist, or registered dietitian.
      </ScreenBlurb>
      <ScreenBlurb>
        If you report pain, injury, dizziness, or another concerning symptom, VigorEngine stops
        progressing your training and recommends professional advice instead — it never pushes
        through it for you.
      </ScreenBlurb>
      <ScreenBlurb>
        Talk to a qualified professional before starting a new training or nutrition programme,
        especially if you have an existing health condition.
      </ScreenBlurb>
      {error ? <ErrorBanner message={error} /> : null}
      <View style={{ marginTop: 32 }}>
        <Button label="I understand and accept" onPress={accept} loading={saving} />
      </View>
    </Screen>
  );
}
