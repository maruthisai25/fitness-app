import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useRepos, usePlatform } from '../../src/db/AppDataProvider';
import {
  Button,
  ErrorBanner,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  TextField,
} from '../../src/ui/components';

/**
 * The SecureStore key name (not the key itself) that `settings.apiKeyRef`
 * points at — DESIGN.md §6.1: "The key is read from the platform SecureStore
 * adapter". No feature outside this screen and `packages/ai/client.ts` may
 * read it (DESIGN.md §11).
 */
const ANTHROPIC_API_KEY_REF = 'anthropic-api-key';

export default function OnboardingApiKeyScreen() {
  const router = useRouter();
  const { settings } = useRepos();
  const { secureStore } = usePlatform();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(withKey: boolean) {
    setSaving(true);
    setError(null);
    try {
      if (withKey && apiKey.trim().length > 0) {
        await secureStore.set(ANTHROPIC_API_KEY_REF, apiKey.trim());
        await settings.setMany({ apiKeyRef: ANTHROPIC_API_KEY_REF, onboardingComplete: true });
      } else {
        await settings.setMany({ onboardingComplete: true });
      }
      router.replace('/(tabs)');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your API key.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScreenTitle>Connect your coach</ScreenTitle>
      <ScreenBlurb>
        VigorEngine uses your own Anthropic API key — there is no VigorEngine server. The key is
        stored in this device's hardware-backed keychain and is only ever sent to api.anthropic.com,
        direct from this device, when you talk to the coach.
      </ScreenBlurb>
      <ScreenBlurb>
        You can add or remove it later from You → Settings, and everything that does not need the
        coach — logging workouts, food, and progress — works fully offline without one.
      </ScreenBlurb>

      <View style={{ marginTop: 8 }}>
        <TextField
          label="Anthropic API key"
          placeholder="sk-ant-..."
          value={apiKey}
          onChangeText={setApiKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      <Button
        label="Save and finish"
        onPress={() => finish(true)}
        loading={saving}
        disabled={apiKey.trim().length === 0}
      />
      <Button
        label="Skip for now"
        variant="secondary"
        onPress={() => finish(false)}
        disabled={saving}
      />
    </Screen>
  );
}
