import { API_KEY_STORE_KEY, isAiError } from '@vigor/ai';
import type { Settings, UnitSystem } from '@vigor/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useRepos, usePlatform } from '../../../src/db/AppDataProvider';
import { useInvalidate } from '../../../src/data/queries';
import { AI_API_KEY_QUERY_KEY, useAiClient } from '../../../src/ai/useAiClient';
import { useAiPreferences, useSetAiPreferences } from '../../../src/ai/preferences';
import {
  Button,
  ChoiceRow,
  ErrorBanner,
  FieldHint,
  FieldLabel,
  LoadingScreen,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
  TextField,
  ToggleRow,
} from '../../../src/ui/components';
import { Caption } from '../../../src/ui/kit';
import { space } from '../../../src/ui/tokens';

const UNIT_OPTIONS: readonly { value: UnitSystem; label: string }[] = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
];

const COACH_MODEL_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'claude-opus-5', label: 'Claude Opus 5 (default)' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
];

const FAST_MODEL_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (default)' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
];

export default function SettingsScreen() {
  const { settings: settingsRepo, profile: profileRepo } = useRepos();
  const { secureStore } = usePlatform();
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();
  const { client: aiClient } = useAiClient();
  const preferences = useAiPreferences();
  const setPreferences = useSetAiPreferences();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [unitSystem, setUnitSystem] = useState<UnitSystem | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void Promise.all([
      settingsRepo.getAll(),
      profileRepo.get(),
      secureStore.get(API_KEY_STORE_KEY),
    ]).then(([currentSettings, currentProfile, storedKey]) => {
      setSettings(currentSettings);
      setUnitSystem(currentProfile?.unitSystem ?? 'metric');
      setHasApiKey(Boolean(storedKey));
    });
  }, [settingsRepo, profileRepo, secureStore]);

  async function updateSettings(patch: Partial<Settings>) {
    setError(null);
    try {
      const next = await settingsRepo.setMany(patch);
      setSettings(next);
      // Other screens read models/notifications through `useSettingsQuery()`
      // (`@vigor/core/queries`'s shared cache) — keep it in step with this
      // screen's own local state.
      await invalidate('saveSettings');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that setting.');
    }
  }

  async function changeUnitSystem(next: UnitSystem) {
    setUnitSystem(next);
    await profileRepo.update({ unitSystem: next });
    await invalidate('saveProfile');
  }

  async function saveApiKey() {
    if (apiKeyDraft.trim().length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await secureStore.set(API_KEY_STORE_KEY, apiKeyDraft.trim());
      await updateSettings({ apiKeyRef: API_KEY_STORE_KEY });
      setHasApiKey(true);
      setApiKeyDraft('');
      setTestResult(null);
      await queryClient.invalidateQueries({ queryKey: AI_API_KEY_QUERY_KEY });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your API key.');
    } finally {
      setSaving(false);
    }
  }

  async function removeApiKey() {
    setSaving(true);
    setError(null);
    try {
      await secureStore.remove(API_KEY_STORE_KEY);
      await updateSettings({ apiKeyRef: null });
      setHasApiKey(false);
      setTestResult(null);
      await queryClient.invalidateQueries({ queryKey: AI_API_KEY_QUERY_KEY });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove your API key.');
    } finally {
      setSaving(false);
    }
  }

  /** The smallest possible request — DESIGN.md §7.1: reports success or the typed error. */
  async function testConnection() {
    if (!aiClient) {
      setTestResult({ ok: false, message: 'Save an API key first.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await aiClient.messages.countTokens({
        model: aiClient.settings.fastModel,
        messages: [{ role: 'user', content: 'ping' }],
      });
      setTestResult({ ok: true, message: 'Connected — your key works.' });
    } catch (cause) {
      setTestResult({
        ok: false,
        message: isAiError(cause) ? cause.userMessage : 'Could not reach Anthropic.',
      });
    } finally {
      setTesting(false);
    }
  }

  if (!settings || !unitSystem) {
    return <LoadingScreen label="Loading settings…" />;
  }

  return (
    <Screen>
      <ScreenTitle>Settings</ScreenTitle>
      <ScreenBlurb>
        Your API key never leaves this device except to api.anthropic.com (DESIGN.md §6.1).
      </ScreenBlurb>

      <Section title="Anthropic API key">
        <View style={{ padding: 16 }}>
          <FieldHint>
            {hasApiKey
              ? 'A key is stored in this device’s hardware-backed keychain.'
              : 'No key stored yet — the coach and AI features are unavailable until you add one.'}
          </FieldHint>
          <View style={{ marginTop: 12 }}>
            <TextField
              label="Replace API key"
              placeholder="sk-ant-..."
              value={apiKeyDraft}
              onChangeText={setApiKeyDraft}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>
          <Button
            label="Save key"
            onPress={saveApiKey}
            loading={saving}
            disabled={apiKeyDraft.trim().length === 0}
          />
          {hasApiKey ? (
            <Button label="Remove key" variant="danger" onPress={removeApiKey} disabled={saving} />
          ) : null}
        </View>
      </Section>

      <Section title="Models">
        <View style={{ padding: 16 }}>
          <FieldLabel>Coach model</FieldLabel>
          <View style={{ marginBottom: 16 }}>
            <ChoiceRow
              value={settings.coachModel}
              options={COACH_MODEL_OPTIONS}
              onChange={(value) => updateSettings({ coachModel: value })}
            />
          </View>
          <FieldLabel>Fast model (food parsing, memory extraction)</FieldLabel>
          <ChoiceRow
            value={settings.fastModel}
            options={FAST_MODEL_OPTIONS}
            onChange={(value) => updateSettings({ fastModel: value })}
          />
          <FieldHint>
            Opus 5 requests use the "fallbacks: default" beta, so a brief overload elsewhere is
            handled automatically.
          </FieldHint>
        </View>
        <ToggleRow
          label="Server-side fallback"
          hint="On by default (DESIGN.md §6.1). A policy decline on Opus 5 is re-run on Anthropic's fallback model inside the same request."
          value={preferences.data?.serverSideFallback ?? true}
          onValueChange={(value) => setPreferences.mutate({ serverSideFallback: value })}
        />
        <View style={{ padding: 16 }}>
          <Button
            label="Test connection"
            variant="secondary"
            onPress={() => void testConnection()}
            loading={testing}
            disabled={!aiClient}
          />
          {!aiClient ? <FieldHint>Save an API key above first.</FieldHint> : null}
          {testResult ? (
            <View style={{ marginTop: space.sm }}>
              <Caption>{testResult.message}</Caption>
            </View>
          ) : null}
        </View>
      </Section>

      <Section title="Notifications">
        <ToggleRow
          label="Reminders and rest timers"
          hint="Workout, meal-log and protein reminders, and the session rest timer"
          value={settings.notificationsEnabled}
          onValueChange={(value) => updateSettings({ notificationsEnabled: value })}
        />
      </Section>

      <Section title="Units">
        <View style={{ padding: 16 }}>
          <ChoiceRow value={unitSystem} options={UNIT_OPTIONS} onChange={changeUnitSystem} />
        </View>
      </Section>

      {error ? <ErrorBanner message={error} /> : null}
    </Screen>
  );
}
