/**
 * `FileStore` adapter over `expo-file-system` (DESIGN.md §7.3).
 *
 * Everything lives under `FileSystem.documentDirectory/vigorengine/...` so a
 * `ref` like `photos/2026-09-10-front.jpg` or `exports/2026-09-10.json` maps
 * onto a real sandbox path. Refs are always forward-slash, platform-neutral
 * strings; this adapter is the only place that turns them into `File`s.
 */
import { Directory, File, Paths } from 'expo-file-system';

import type { FileStore, StoredFile } from '@vigor/platform';

import { base64ToBytes } from './base64';

const ROOT_SEGMENT = 'vigorengine';

function segmentsOf(ref: string): string[] {
  return ref.split('/').filter((segment) => segment.length > 0);
}

function fileFor(ref: string): File {
  return new File(Paths.document, ROOT_SEGMENT, ...segmentsOf(ref));
}

function directoryFor(prefix: string): Directory {
  return new Directory(Paths.document, ROOT_SEGMENT, ...segmentsOf(prefix));
}

function ensureParentDirectory(file: File): void {
  const parent = file.parentDirectory;
  if (!parent.exists) {
    parent.create({ intermediates: true });
  }
}

const EXTENSION_MIME: Record<string, string> = {
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function guessMimeType(name: string): string {
  const dot = name.lastIndexOf('.');
  const extension = dot === -1 ? '' : name.slice(dot).toLowerCase();
  return EXTENSION_MIME[extension] ?? 'application/octet-stream';
}

/**
 * The absolute `file://` URI a `ref` maps to. `FileStore` deliberately speaks
 * only in sandbox-relative refs (`@vigor/platform` is platform-neutral), but
 * `expo-sharing` needs a real URI to hand another app, so the export screen
 * reaches for this — the one mobile-only escape hatch out of a ref.
 */
export function absoluteUriFor(ref: string): string {
  return fileFor(ref).uri;
}

export function createFileStore(): FileStore {
  return {
    async write(ref, base64, mimeType) {
      const file = fileFor(ref);
      ensureParentDirectory(file);
      if (!file.exists) {
        file.create({ intermediates: true, overwrite: true });
      }
      file.write(base64, { encoding: 'base64' });
      return { ref, mimeType, byteLength: base64ToBytes(base64).length } satisfies StoredFile;
    },

    async readBase64(ref) {
      const file = fileFor(ref);
      if (!file.exists) return null;
      return file.base64();
    },

    async remove(ref) {
      const file = fileFor(ref);
      if (file.exists) {
        file.delete();
      }
    },

    async list(prefix) {
      const directory = directoryFor(prefix);
      if (!directory.exists) return [];
      const cleanPrefix = prefix.replace(/\/+$/, '');
      return directory
        .list()
        .filter((entry): entry is File => entry instanceof File)
        .map((entry): StoredFile => ({
          ref: cleanPrefix.length > 0 ? `${cleanPrefix}/${entry.name}` : entry.name,
          mimeType: guessMimeType(entry.name),
          byteLength: 0,
        }));
    },

    async exists(ref) {
      return fileFor(ref).exists;
    },
  };
}
