import type { ExportBundle } from '@vigor/core';
import type { EncryptedPayload } from '@vigor/platform';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';

import { Field, PrimaryButton, SecondaryButton, TextInput } from '../components/form';
import { useDb } from '../db/provider';
import { webCrypto } from '../platform/crypto';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ciphertextB64' in value &&
    'saltB64' in value &&
    'ivB64' in value
  );
}

/**
 * What the panel is doing while its buttons are disabled. Deriving the key from
 * the passphrase is the slow step — PBKDF2 at the count stored in the envelope
 * — and it is slow on purpose, so it is named rather than hidden behind a
 * generic "Working…".
 */
type Stage = 'reading' | 'protecting' | 'unlocking' | 'restoring';

const STAGE_MESSAGE: Record<Stage, string> = {
  reading: 'Reading every table…',
  protecting:
    'Locking the file with your passphrase. This takes a few seconds on purpose: the same slow step is what anyone who steals the file has to pay for every guess.',
  unlocking:
    'Unlocking the file with your passphrase. This takes a few seconds on purpose: the same slow step is what anyone who steals the file has to pay for every guess.',
  restoring: 'Writing every table back, in one transaction…',
};

/** Export/Import — DESIGN.md §8: `vigorengine-YYYY-MM-DD.json`, AES-GCM via WebCrypto. */
export function ExportImportPanel(): ReactNode {
  const { repos } = useDb();
  const [passphrase, setPassphrase] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const busy = stage !== null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function doExport(): Promise<void> {
    if (!passphrase) {
      setStatus('Enter a passphrase to encrypt the export.');
      return;
    }
    setStage('reading');
    setStatus(null);
    try {
      const bundle = await repos.export.bundle();
      setStage('protecting');
      // A frame between the state change and the derivation, so the message is
      // painted before the main thread disappears into PBKDF2.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const payload = await webCrypto.encryptJson(bundle, passphrase);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vigorengine-${bundle.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus('Export downloaded.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setStage(null);
    }
  }

  async function doImport(file: File): Promise<void> {
    if (!importPassphrase) {
      setStatus('Enter the passphrase this bundle was exported with.');
      return;
    }
    setStage('reading');
    setStatus(null);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!isEncryptedPayload(parsed)) {
        throw new Error('That file does not look like a VigorEngine export bundle.');
      }
      setStage('unlocking');
      await new Promise((resolve) => setTimeout(resolve, 0));
      const restored = await webCrypto.decryptJson<ExportBundle>(parsed, importPassphrase);
      setStage('restoring');
      await repos.export.restore(restored, { mode: 'replace' });
      setStatus('Import complete. Reload the app to see the restored data.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setStage(null);
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
          Export
        </h2>
        <p style={{ color: themeColor.textMuted }}>
          Downloads every table as one AES-GCM encrypted JSON file. Keep the passphrase safe — it is
          not stored anywhere and cannot be recovered.
        </p>
        <Field label="Passphrase">
          <TextInput value={passphrase} onChange={setPassphrase} type="password" />
        </Field>
        <PrimaryButton onClick={doExport} disabled={busy}>
          {busy ? 'Working…' : 'Export data'}
        </PrimaryButton>
      </section>

      <section>
        <h2
          style={{
            fontSize: fontSize.heading,
            color: themeColor.text,
            margin: `0 0 ${space.sm}px`,
          }}
        >
          Import
        </h2>
        <p style={{ color: themeColor.textMuted }}>
          Importing replaces every table currently on this device.
        </p>
        <Field label="Passphrase">
          <TextInput value={importPassphrase} onChange={setImportPassphrase} type="password" />
        </Field>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void doImport(file);
          }}
        />
        <div style={{ marginTop: space.sm }}>
          <SecondaryButton onClick={() => fileInputRef.current?.click()} disabled={busy}>
            Choose file…
          </SecondaryButton>
        </div>
      </section>

      {stage && (
        <p
          role="status"
          style={{ color: themeColor.textMuted, marginTop: space.lg, maxWidth: '60ch' }}
        >
          {STAGE_MESSAGE[stage]}
        </p>
      )}

      {status && <p style={{ color: themeColor.text, marginTop: space.lg }}>{status}</p>}
    </div>
  );
}
