/**
 * Export/import component test — DESIGN.md §8.
 *
 * Two things this shell used to get wrong and this test now holds:
 *
 *  - "all tables + photos as base64": the web bundle carried `progress_photos`
 *    rows and no bytes, and a restore never put bytes back, so a round trip
 *    ended in a gallery of missing files;
 *  - "Import validates schema version and offers merge or replace": the web
 *    import hard-coded `replace`.
 *
 * The passphrase crypto and the OPFS file store are the two things replaced
 * here — jsdom has neither WebCrypto's PBKDF2 at a sane speed nor OPFS. The
 * panel, the repositories, the migrations and the bundle schema are real.
 */

import type { ExportBundle } from '@vigor/core';
import type { EncryptedPayload } from '@vigor/platform';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHarness, renderWithProviders, type Harness } from '../testing/harness';
import { ExportImportPanel } from './ExportImportPanel';

/** Shared with the module mocks below, which are hoisted above this file's body. */
const files = vi.hoisted(() => ({
  written: new Map<string, string>(),
  stored: new Map<string, string>(),
}));

vi.mock('../platform/crypto', () => ({
  webCrypto: {
    // A stand-in envelope: the same shape the real one produces, without
    // paying PBKDF2 in a test.
    encryptJson: vi.fn(async (value: unknown) => ({
      ciphertextB64: JSON.stringify(value),
      saltB64: 'salt',
      ivB64: 'iv',
    })),
    decryptJson: vi.fn(async (payload: EncryptedPayload) => JSON.parse(payload.ciphertextB64)),
  },
}));

vi.mock('../platform/fileStore', () => ({
  webFileStore: {
    write: vi.fn(async (ref: string, base64: string) => {
      files.written.set(ref, base64);
      return { ref, mimeType: 'image/jpeg', byteLength: base64.length };
    }),
    readBase64: vi.fn(async (ref: string) => files.stored.get(ref) ?? null),
    remove: vi.fn(async () => undefined),
    list: vi.fn(async () => []),
    exists: vi.fn(async () => true),
  },
}));

const PHOTO_REF = 'photos/2026-09-10-front-1.jpg';
const PHOTO_BYTES = 'QUJDRA==';

let harness: Harness;

beforeEach(async () => {
  files.written.clear();
  files.stored.clear();
  vi.clearAllMocks();
  harness = await createHarness();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await harness.db.close();
});

/** A bundle from "another device", with one photo and one memory in it. */
async function makeBundle(): Promise<ExportBundle> {
  const source = await createHarness();
  // Ids in the test database are sequential per database, so two harnesses
  // hand out the same id for their first memory and a merge would treat the
  // incoming row as one it already has. A real device's UUID v7s never
  // collide; skipping a few ids here is how that is reproduced.
  source.db.nextId();
  source.db.nextId();
  await source.repos.memories.create({
    kind: 'constraint',
    domain: 'nutrition',
    text: 'No dairy',
    source: 'user',
  });
  await source.repos.body.addPhoto({ date: '2026-09-10', view: 'front', fileRef: PHOTO_REF });
  const bundle = await source.repos.export.bundle({
    photos: [{ fileRef: PHOTO_REF, base64: PHOTO_BYTES }],
  });
  await source.db.close();
  return bundle;
}

function chooseFile(container: HTMLElement, bundle: ExportBundle): void {
  const payload: EncryptedPayload = {
    ciphertextB64: JSON.stringify(bundle),
    saltB64: 'salt',
    ivB64: 'iv',
  } as EncryptedPayload;
  const input = container.querySelector('input[type="file"]');
  const file = new File([JSON.stringify(payload)], 'vigorengine-2026-09-10.json', {
    type: 'application/json',
  });
  fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
}

describe('You → Export/Import', () => {
  it('merges by default and writes the bundle photos back to this device', async () => {
    const bundle = await makeBundle();
    await harness.repos.memories.create({
      kind: 'dislike',
      domain: 'training',
      text: 'No burpees',
      source: 'user',
    });

    const { container } = renderWithProviders(harness, <ExportImportPanel />);
    fireEvent.change(screen.getAllByLabelText('Passphrase')[1], {
      target: { value: 'correct horse battery staple' },
    });
    chooseFile(container, bundle);

    await waitFor(async () => {
      expect(await harness.repos.memories.listActive()).toHaveLength(2);
    });

    // Merge is the default (DESIGN.md §8), so what was already here survived.
    const texts = (await harness.repos.memories.listActive()).map((row) => row.text).sort();
    expect(texts).toEqual(['No burpees', 'No dairy']);

    // …and the photo bytes landed next to the row, not just the row.
    expect(await harness.repos.body.listPhotos()).toHaveLength(1);
    expect(files.written.get(PHOTO_REF)).toBe(PHOTO_BYTES);
    expect(await screen.findByText(/1 of 1 progress photos were restored/i)).toBeTruthy();
  });

  it('replaces every table when the user chooses replace', async () => {
    const bundle = await makeBundle();
    await harness.repos.memories.create({
      kind: 'dislike',
      domain: 'training',
      text: 'No burpees',
      source: 'user',
    });

    const { container } = renderWithProviders(harness, <ExportImportPanel />);
    fireEvent.change(screen.getAllByLabelText('Passphrase')[1], {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.change(screen.getByLabelText('How to apply it'), { target: { value: 'replace' } });
    chooseFile(container, bundle);

    await waitFor(async () => {
      const rows = await harness.repos.memories.listActive();
      expect(rows.map((row) => row.text)).toEqual(['No dairy']);
    });
    expect(await screen.findByText(/Import complete \(replace\)/i)).toBeTruthy();
  });

  it('reads the photo bytes out of the file store on the way out', async () => {
    await harness.repos.body.addPhoto({ date: '2026-09-10', view: 'front', fileRef: PHOTO_REF });
    files.stored.set(PHOTO_REF, PHOTO_BYTES);

    // The download itself is a browser affordance jsdom does not have; the
    // bundle handed to the encrypter is what this test is about.
    const createObjectURL = vi.fn(() => 'blob:vigor');
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();

    renderWithProviders(harness, <ExportImportPanel />);
    fireEvent.change(screen.getAllByLabelText('Passphrase')[0], {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: /export data/i }));

    const { webCrypto } = await import('../platform/crypto');
    await waitFor(() => {
      expect(webCrypto.encryptJson).toHaveBeenCalled();
    });
    const [data] = vi.mocked(webCrypto.encryptJson).mock.calls[0];
    expect((data as ExportBundle).photos).toEqual([{ fileRef: PHOTO_REF, base64: PHOTO_BYTES }]);
  });
});
