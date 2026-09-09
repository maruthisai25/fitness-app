import type { ExportBundlePhoto } from '@vigor/core';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { useState } from 'react';
import { View } from 'react-native';

import { useRepos, usePlatform } from '../../../src/db/AppDataProvider';
import { utf8ToBase64 } from '../../../src/platform/base64';
import { absoluteUriFor } from '../../../src/platform/fileStore';
import {
  Button,
  ErrorBanner,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
  TextField,
} from '../../../src/ui/components';

/** DESIGN.md §8: `vigorengine-YYYY-MM-DD.json`. */
function exportRef(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `exports/vigorengine-${date}.json`;
}

export default function ExportScreen() {
  const { export: exportRepo, body } = useRepos();
  const { fileStore, crypto } = usePlatform();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRef, setSavedRef] = useState<string | null>(null);

  /**
   * `packages/db` stores only `progress_photos.fileRef`, so the app reads the
   * bytes through the FileStore and hands them to `bundle()` — DESIGN.md §8:
   * "all tables + photos as base64".
   */
  async function readPhotos(): Promise<ExportBundlePhoto[]> {
    const rows = await body.listPhotos();
    const photos: ExportBundlePhoto[] = [];
    for (const row of rows) {
      const base64 = await fileStore.readBase64(row.fileRef);
      // A row whose file is gone must not abort the whole backup; the row
      // still exports, just without its image.
      if (base64) photos.push({ fileRef: row.fileRef, base64 });
    }
    return photos;
  }

  async function run() {
    if (passphrase.trim().length < 8) {
      setError('Use a passphrase of at least 8 characters — you will need it to import this file.');
      return;
    }
    setBusy(true);
    setError(null);
    setSavedRef(null);
    try {
      const bundle = await exportRepo.bundle({ photos: await readPhotos() });
      const payload = await crypto.encryptJson(bundle, passphrase.trim());
      const ref = exportRef();
      await fileStore.write(ref, utf8ToBase64(JSON.stringify(payload)), 'application/json');
      setSavedRef(ref);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export your data.');
    } finally {
      setBusy(false);
    }
  }

  /** Hands the encrypted file to the OS share sheet so it can leave the sandbox. */
  async function share() {
    if (!savedRef) return;
    setSharing(true);
    setError(null);
    try {
      if (!(await isAvailableAsync())) {
        setError(
          'Sharing is not available on this device — copy the file off with a file manager.',
        );
        return;
      }
      await shareAsync(absoluteUriFor(savedRef), {
        mimeType: 'application/json',
        dialogTitle: 'VigorEngine backup',
        UTI: 'public.json',
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not share your backup.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <Screen>
      <ScreenTitle>Export data</ScreenTitle>
      <ScreenBlurb>
        Writes every table to an encrypted, passphrase-protected file on this device (DESIGN.md §8)
        — nothing is sent anywhere. Bring the same passphrase to import it later.
      </ScreenBlurb>

      <Section title="Passphrase">
        <View style={{ padding: 16 }}>
          <TextField
            label="Choose a passphrase"
            hint="At least 8 characters. There is no way to recover a lost passphrase."
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            autoCapitalize="none"
          />
          <Button label="Export now" onPress={run} loading={busy} />
        </View>
      </Section>

      {savedRef ? (
        <Section title="Saved">
          <View style={{ padding: 16 }}>
            <ScreenBlurb>Saved to this device at {savedRef}.</ScreenBlurb>
            <Button label="Share backup" variant="secondary" onPress={share} loading={sharing} />
          </View>
        </Section>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}
    </Screen>
  );
}
