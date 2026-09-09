import { radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { ANTHROPIC_API_KEY_REF } from '../onboarding/OnboardingFlow';
import { Field, PrimaryButton, SecondaryButton, TextInput } from '../components/form';
import { useDb } from '../db/provider';
import { webSecureStore } from '../platform/secureStore';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

export function SettingsPanel(): ReactNode {
  const { repos, settings, refreshSettings } = useDb();
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      setHasKey(Boolean(trimmed) || hasKey);
      setMessage('Saved.');
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
      setHasKey(false);
      setMessage('API key removed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <section style={{ marginBottom: space.xxl }}>
        <h2
          style={{
            fontSize: fontSize.heading,
            color: themeColor.text,
            margin: `0 0 ${space.sm}px`,
          }}
        >
          Anthropic API key
        </h2>
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

      <section>
        <h2
          style={{
            fontSize: fontSize.heading,
            color: themeColor.text,
            margin: `0 0 ${space.sm}px`,
          }}
        >
          Models
        </h2>
        <p style={{ color: themeColor.textMuted }}>
          Coach model: <span className="tabular">{settings.coachModel}</span>
          <br />
          Fast model: <span className="tabular">{settings.fastModel}</span>
        </p>
        <p style={{ color: themeColor.textFaint, fontSize: fontSize.caption }}>
          Model selection lands with the AI layer (DESIGN.md §6, phase 2).
        </p>
      </section>

      <section style={{ marginTop: space.xxl }}>
        <h2
          style={{
            fontSize: fontSize.heading,
            color: themeColor.text,
            margin: `0 0 ${space.sm}px`,
          }}
        >
          Notifications
        </h2>
        <p style={{ color: themeColor.textMuted }}>
          {settings.notificationsEnabled ? 'Enabled' : 'Disabled'} — web notifications only fire
          while this tab is open (DESIGN.md §7.4).
        </p>
      </section>
    </div>
  );
}
