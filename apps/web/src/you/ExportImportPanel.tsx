import type { ExportBundle, ExportBundlePhoto } from '@vigor/core';
import type { EncryptedPayload } from '@vigor/platform';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';

import { Field, PrimaryButton, SecondaryButton, Select, TextInput } from '../components/form';
import { useDb } from '../db/provider';
import { webCrypto } from '../platform/crypto';
import { webFileStore } from '../platform/fileStore';
import { mimeForRef } from '../progress/photoRefs';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

/** DESIGN.md §8: "Import validates schema version and offers merge or replace." */
type RestoreMode = 'merge' | 'replace';

const MODE_HINT: Record<RestoreMode, string> = {
  merge:
    'Rows already on this device are kept, and only ids it does not have are added. Safe to run twice.',
  replace: 'Every table on this device is cleared first, then the backup is written in its place.',
};

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
  reading: 'Reading every table and progress photo…',
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
  const [mode, setMode] = useState<RestoreMode>('merge');
  const busy = stage !== null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * `packages/db` stores only `progress_photos.fileRef`, so the bytes are read
   * out of OPFS here and handed to `bundle()` — DESIGN.md §8: "all tables +
   * photos as base64". A row whose file has gone still exports; it just has no
   * image with it.
   */
  async function readPhotos(): Promise<ExportBundlePhoto[]> {
    const rows = await repos.body.listPhotos();
    const photos: ExportBundlePhoto[] = [];
    for (const row of rows) {
      const base64 = await webFileStore.readBase64(row.fileRef);
      if (base64) photos.push({ fileRef: row.fileRef, base64 });
    }
    return photos;
  }

  async function doExport(): Promise<void> {
    if (!passphrase) {
      setStatus('Enter a passphrase to encrypt the export.');
      return;
    }
    setStage('reading');
    setStatus(null);
    try {
      const bundle = await repos.export.bundle({ photos: await readPhotos() });
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
      setStatus(
        bundle.photos.length === 0
          ? 'Export downloaded.'
          : `Export downloaded, with ${bundle.photos.length} progress ${
              bundle.photos.length === 1 ? 'photo' : 'photos'
            } inside it.`,
      );
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
      // The photo bytes go back to OPFS as the rows go back to SQLite,
      // otherwise the gallery restores to "file missing from this device".
      const result = await repos.export.restore(restored, {
        mode,
        writePhoto: async (photo) => {
          await webFileStore.write(photo.fileRef, photo.base64, mimeForRef(photo.fileRef));
        },
      });
      const rows = Object.values(result.inserted).reduce((sum, count) => sum + count, 0);
      const photoNote =
        result.photosWritten === 0 && result.photosFailed === 0
          ? ''
          : ` ${result.photosWritten} of ${result.photosWritten + result.photosFailed} progress photos were restored.`;
      setStatus(
        `Import complete (${mode}): ${rows} ${rows === 1 ? 'row' : 'rows'} written.${photoNote} Reload the app to see the restored data.`,
      );
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
          Downloads every table, with your progress photos as base64, in one AES-GCM encrypted JSON
          file. Keep the passphrase safe — it is not stored anywhere and cannot be recovered.
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
          Restores every table, and the progress photos inside it, from a bundle made with Export.
        </p>
        <Field label="Passphrase">
          <TextInput value={importPassphrase} onChange={setImportPassphrase} type="password" />
        </Field>
        <Field label="How to apply it" hint={MODE_HINT[mode]}>
          <Select value={mode} onChange={(value) => setMode(value as RestoreMode)}>
            <option value="merge">Merge — keep what is here, add what is missing</option>
            <option value="replace">Replace — clear this device first</option>
          </Select>
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
