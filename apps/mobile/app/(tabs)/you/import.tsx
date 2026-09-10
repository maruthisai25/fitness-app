import type { ExportBundle } from '@vigor/core';
import { UnsupportedBundleError } from '@vigor/db';
import type { EncryptedPayload, StoredFile } from '@vigor/platform';
import { color, fontSize, HIT_TARGET, space } from '../../../src/ui/tokens';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useRepos, usePlatform } from '../../../src/db/AppDataProvider';
import { base64ToUtf8 } from '../../../src/platform/base64';
import {
  Button,
  ChoiceRow,
  ErrorBanner,
  FieldHint,
  FieldLabel,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
  TextField,
} from '../../../src/ui/components';

/** DESIGN.md §8: "Import validates schema version and offers merge or replace." */
type RestoreMode = 'merge' | 'replace';

const MODE_OPTIONS: readonly { value: RestoreMode; label: string }[] = [
  { value: 'merge', label: 'Merge' },
  { value: 'replace', label: 'Replace' },
];

/**
 * What the screen is doing while the buttons are disabled. Deriving the key
 * from the passphrase is the slow step and it is slow by design — see
 * `src/platform/exportCrypto.ts` — so it gets its own stage and its own line.
 */
type Stage = 'reading' | 'unlocking' | 'restoring';

const STAGE_MESSAGE: Record<Stage, string> = {
  reading: 'Reading the backup file…',
  unlocking:
    'Unlocking the file with your passphrase. This takes a few seconds on purpose: the same slow step is what anyone who steals the file has to pay for every guess.',
  restoring: 'Writing every table back, in one transaction…',
};

export default function ImportScreen() {
  const { export: exportRepo } = useRepos();
  const { fileStore, crypto } = usePlatform();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ rows: number; photos: number; photosMissing: number } | null>(
    null,
  );

  useEffect(() => {
    void fileStore
      .list('exports')
      .then(setFiles)
      .catch(() => undefined);
  }, [fileStore]);

  async function run() {
    if (!selectedRef) {
      setError('Choose a backup file first.');
      return;
    }
    setStage('reading');
    setError(null);
    setDone(null);
    try {
      const base64 = await fileStore.readBase64(selectedRef);
      if (!base64) {
        throw new Error('That backup file could not be read.');
      }
      const payload = JSON.parse(base64ToUtf8(base64)) as EncryptedPayload;
      setStage('unlocking');
      // A frame between setState and the derivation, so the message is on
      // screen before the JavaScript thread disappears into PBKDF2.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const bundle = await crypto.decryptJson<ExportBundle>(payload, passphrase.trim());
      setStage('restoring');
      // `restore` validates the schema version and the whole bundle before it
      // writes anything, and writes in one transaction (DESIGN.md §8). The
      // photo bytes travel with it: `packages/db` holds only the `fileRef`, so
      // the FileStore write is handed in here or the gallery restores empty.
      const result = await exportRepo.restore(bundle, {
        mode,
        writePhoto: async (photo) => {
          await fileStore.write(photo.fileRef, photo.base64, 'image/jpeg');
        },
      });
      setDone({
        rows: Object.values(result.inserted).reduce((sum, count) => sum + count, 0),
        photos: result.photosWritten,
        photosMissing: result.photosFailed,
      });
    } catch (cause) {
      setError(
        cause instanceof UnsupportedBundleError
          ? cause.message
          : 'Could not restore that backup — check the passphrase and try again.',
      );
    } finally {
      setStage(null);
    }
  }

  return (
    <Screen>
      <ScreenTitle>Import data</ScreenTitle>
      <ScreenBlurb>
        Restores every table, and the progress photos inside it, from an encrypted backup made with
        Export data (DESIGN.md §8). Merge keeps what is already on this device and adds only what is
        missing; replace wipes your current data first.
      </ScreenBlurb>

      <Section title="Backup files on this device">
        <View>
          {files.length === 0 ? (
            <View style={{ padding: 16 }}>
              <ScreenBlurb>No backups found yet — use Export data to make one.</ScreenBlurb>
            </View>
          ) : (
            files.map((file, index) => {
              const active = file.ref === selectedRef;
              return (
                <Pressable
                  key={file.ref}
                  disabled={stage !== null}
                  onPress={() => setSelectedRef(file.ref)}
                  accessibilityRole="radio"
                  accessibilityLabel={file.ref}
                  accessibilityHint="Chooses this backup to restore from"
                  accessibilityState={{
                    selected: active,
                    checked: active,
                    disabled: stage !== null,
                  }}
                  style={{
                    padding: space.lg,
                    minHeight: HIT_TARGET,
                    justifyContent: 'center',
                    borderBottomWidth: index === files.length - 1 ? 0 : 1,
                    borderBottomColor: color.border,
                    backgroundColor: active ? color.accentSoft : 'transparent',
                  }}
                >
                  <Text
                    style={{ color: active ? color.accent : color.text, fontSize: fontSize.body }}
                  >
                    {file.ref}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      </Section>

      <Section title="Passphrase">
        <View style={{ padding: 16 }}>
          <TextField
            label="Passphrase"
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            autoCapitalize="none"
            editable={stage === null}
          />
          <FieldLabel>How to apply it</FieldLabel>
          <View style={{ marginBottom: 8 }}>
            <ChoiceRow value={mode} options={MODE_OPTIONS} onChange={setMode} />
          </View>
          <FieldHint>
            {mode === 'merge'
              ? 'Rows already on this device are kept; only ids this device does not have are added.'
              : 'Every table is cleared before the backup is written.'}
          </FieldHint>
          <Button
            label={stage === null ? 'Restore' : 'Working…'}
            onPress={run}
            loading={stage !== null}
            disabled={!selectedRef}
          />
          {stage ? <FieldHint>{STAGE_MESSAGE[stage]}</FieldHint> : null}
        </View>
      </Section>

      {done !== null ? (
        <Section title="Done">
          <View style={{ padding: 16 }}>
            <ScreenBlurb>
              Your backup was restored — {done.rows} {done.rows === 1 ? 'row' : 'rows'} written
              {done.photos + done.photosMissing === 0
                ? '.'
                : `, and ${done.photos} of ${done.photos + done.photosMissing} progress photos put back on this device.`}
            </ScreenBlurb>
          </View>
        </Section>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}
    </Screen>
  );
}
