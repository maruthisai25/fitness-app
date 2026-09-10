import { radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { useAiJobQueue, useAiJobRunner } from '../ai/jobRunner';
import { useCoach } from '../coach/CoachProvider';
import { Field, PrimaryButton, SecondaryButton, TextInput } from '../components/form';
import { useInvalidate } from '../data/hooks';
import { useDb } from '../db/provider';
import { ANTHROPIC_API_KEY_REF } from '../onboarding/OnboardingFlow';
import { webSecureStore } from '../platform/secureStore';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

/** DESIGN.md §6.1 names these two; a third, cheaper option covers "I want it fast everywhere". */
const MODEL_CHOICES = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] as const;

export function SettingsPanel(): ReactNode {
  const { repos, settings, refreshSettings } = useDb();
  const { reloadKey, testConnection } = useCoach();
  const jobRunner = useAiJobRunner();
  const invalidate = useInvalidate();
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    { ok: true } | { ok: false; message: string } | null
  >(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void webSecureStore.get(ANTHROPIC_API_KEY_REF).then((v) => setHasKey(Boolean(v)));
  }, [settings.apiKeyRef]);

  async function saveKey(): Promise<void> {
    const trimmed = keyInput.trim();
    setBusy(true);
    try {
      if (trimmed) {
        await webSecureStore.set(ANTHROPIC_API_KEY_REF, trimmed);
        await repos.settings.set('apiKeyRef', ANTHROPIC_API_KEY_REF);
      }
      setKeyInput('');
      await refreshSettings();
      await invalidate('saveSettings');
      reloadKey();
      setHasKey(Boolean(trimmed) || hasKey);
      setTestResult(null);
      setMessage('Saved.');
      // A rejected key parks jobs rather than burning their attempts
      // (DESIGN.md §8), so a new key is what releases them.
      if (trimmed) void jobRunner.retryCredentials();
    } finally {
      setBusy(false);
    }
  }

  async function removeKey(): Promise<void> {
    setBusy(true);
    try {
      await webSecureStore.remove(ANTHROPIC_API_KEY_REF);
      await repos.settings.set('apiKeyRef', null);
      await refreshSettings();
      await invalidate('saveSettings');
      reloadKey();
      setHasKey(false);
      setTestResult(null);
      setMessage('API key removed.');
    } finally {
      setBusy(false);
    }
  }

  async function saveModel(key: 'coachModel' | 'fastModel', value: string): Promise<void> {
    await repos.settings.set(key, value);
    await refreshSettings();
    await invalidate('saveSettings');
    setTestResult(null);
  }

  /** A stored settings row now, so the choice travels with the export bundle. */
  async function toggleFallback(next: boolean): Promise<void> {
    await repos.settings.set('serverSideFallback', next);
    await refreshSettings();
    await invalidate('saveSettings');
    reloadKey();
  }

  async function runTest(): Promise<void> {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testConnection());
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <section style={{ marginBottom: space.xxl }}>
        <h2 style={sectionHeading}>Anthropic API key</h2>
        <div style={infoBox}>
          Stored in this browser's IndexedDB — <strong>not hardware-backed</strong> like mobile's
          secure enclave. It is only ever sent to <code>api.anthropic.com</code>, never logged, and
          never included in an export bundle.
        </div>
        <p style={{ color: themeColor.textMuted, margin: `0 0 ${space.sm}px` }}>
          Status:{' '}
          {hasKey ? (
            <span style={{ color: themeColor.good }}>key stored</span>
          ) : (
            <span>no key stored</span>
          )}
        </p>
        <Field label="Replace API key">
          <TextInput
            value={keyInput}
            onChange={setKeyInput}
            type="password"
            placeholder="sk-ant-…"
          />
        </Field>
        <div style={{ display: 'flex', gap: space.sm }}>
          <PrimaryButton onClick={saveKey} disabled={busy || !keyInput.trim()}>
            Save key
          </PrimaryButton>
          <SecondaryButton onClick={removeKey} disabled={busy || !hasKey}>
            Remove key
          </SecondaryButton>
        </div>
        {message && <p style={{ color: themeColor.good }}>{message}</p>}
      </section>

      <section style={{ marginBottom: space.xxl }}>
        <h2 style={sectionHeading}>Models</h2>
        <Field label="Coach model" hint="Chat, workout generation, weekly review, recipes.">
          <select
            value={settings.coachModel}
            onChange={(event) => void saveModel('coachModel', event.target.value)}
            style={selectStyle}
          >
            {optionsFor(settings.coachModel).map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fast model" hint="Food-text parsing and memory extraction.">
          <select
            value={settings.fastModel}
            onChange={(event) => void saveModel('fastModel', event.target.value)}
            style={selectStyle}
          >
            {optionsFor(settings.fastModel).map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </Field>

        <label style={{ display: 'flex', gap: space.sm, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.serverSideFallback}
            onChange={(event) => void toggleFallback(event.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span style={{ color: themeColor.text }}>
            Server-side refusal fallback is{' '}
            <strong>{settings.serverSideFallback ? 'on' : 'off'}</strong>. If Opus declines a
            request for policy reasons, Anthropic automatically re-runs it on a fallback model in
            the same call. Turn it off to always get Opus&apos;s own answer, refusal included.
          </span>
        </label>

        <div style={{ marginTop: space.lg }}>
          <SecondaryButton onClick={() => void runTest()} disabled={testing}>
            {testing ? 'Testing…' : 'Test connection'}
          </SecondaryButton>
          {testResult && (
            <p style={{ color: testResult.ok ? themeColor.good : themeColor.bad, margin: `${space.sm}px 0 0` }}>
              {testResult.ok ? 'Connected — the key and model both work.' : testResult.message}
            </p>
          )}
        </div>
      </section>

      <PendingCoachWork />

      <section>
        <h2 style={sectionHeading}>Notifications</h2>
        <p style={{ color: themeColor.textMuted }}>
          {settings.notificationsEnabled ? 'Enabled' : 'Disabled'} — web notifications only fire
          while this tab is open (DESIGN.md §7.4).
        </p>
      </section>
    </div>
  );
}

/**
 * The offline queue, in one row — DESIGN.md §8. Work that could not reach the
 * API is not lost, and this is where the user can see that and push it along.
 */
function PendingCoachWork(): ReactNode {
  const queue = useAiJobQueue();
  const { running, idle, runNow } = useAiJobRunner();
  const summary = queue.data;

  if (summary == null || summary.outstanding === 0) return null;

  const stuck = summary.blocked + summary.permanentlyFailed + summary.retrying;

  return (
    <section style={{ marginBottom: space.xxl }}>
      <h2 style={sectionHeading}>Pending coach work</h2>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.md,
          flexWrap: 'wrap',
          border: `1px solid ${themeColor.border}`,
          borderRadius: radius.md,
          padding: space.md,
        }}
      >
        <p style={{ margin: 0, color: themeColor.text }}>
          <strong className="tabular">{summary.queued + summary.running}</strong> queued
          {stuck > 0 && (
            <>
              , <strong className="tabular">{stuck}</strong> failed
            </>
          )}
          .{' '}
          <span style={{ color: themeColor.textMuted }}>
            {summary.blocked > 0
              ? 'Some of it stopped on a rejected API key — save a working key above and it goes back in the queue.'
              : idle
                ? 'It runs as soon as there is a key and a connection.'
                : 'It runs on its own when the app is open; this pushes it along now.'}
          </span>
        </p>
        <SecondaryButton onClick={() => void runNow()} disabled={running || idle}>
          {running ? 'Running…' : 'Retry now'}
        </SecondaryButton>
      </div>
    </section>
  );
}

function optionsFor(current: string): string[] {
  return MODEL_CHOICES.includes(current as (typeof MODEL_CHOICES)[number])
    ? [...MODEL_CHOICES]
    : [current, ...MODEL_CHOICES];
}

const sectionHeading = {
  fontSize: fontSize.heading,
  color: themeColor.text,
  margin: `0 0 ${space.sm}px`,
} as const;

const infoBox = {
  background: themeColor.accentSoft,
  border: `1px solid ${themeColor.border}`,
  borderRadius: radius.md,
  padding: space.md,
  marginBottom: space.md,
  color: themeColor.text,
  fontSize: fontSize.label,
  lineHeight: 1.5,
} as const;

const selectStyle = {
  width: '100%',
  padding: `${space.sm}px ${space.md}px`,
  borderRadius: radius.sm,
  border: `1px solid ${themeColor.border}`,
  background: themeColor.surface,
  color: themeColor.text,
  fontSize: fontSize.body,
} as const;
