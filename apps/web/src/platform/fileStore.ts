import type { FileStore, StoredFile } from '@vigor/platform';

/**
 * Web `FileStore` — DESIGN.md §7.4. Progress photos and export bundles live
 * in OPFS, addressed by the same sandbox-relative `ref` mobile uses under
 * `FileSystem.documentDirectory` (DESIGN.md §7.3).
 */

async function root(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

/** Splits `photos/2026-09-10-front.jpg` into its directory segments and leaf name. */
function splitRef(ref: string): { dirs: string[]; name: string } {
  const parts = ref.split('/').filter((part) => part.length > 0);
  const name = parts.pop();
  if (!name) {
    throw new Error(`VigorEngine: invalid file ref "${ref}"`);
  }
  return { dirs: parts, name };
}

async function dirHandle(dirs: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let dir = await root();
  for (const segment of dirs) {
    dir = await dir.getDirectoryHandle(segment, { create });
  }
  return dir;
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export const webFileStore: FileStore = {
  async write(ref: string, base64: string, mimeType: string): Promise<StoredFile> {
    const { dirs, name } = splitRef(ref);
    const dir = await dirHandle(dirs, true);
    const fileHandle = await dir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    const bytes = base64ToBytes(base64);
    await writable.write(bytes);
    await writable.close();
    return { ref, mimeType, byteLength: bytes.byteLength };
  },

  async readBase64(ref: string): Promise<string | null> {
    try {
      const { dirs, name } = splitRef(ref);
      const dir = await dirHandle(dirs, false);
      const fileHandle = await dir.getFileHandle(name, { create: false });
      const file = await fileHandle.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      return bytesToBase64(bytes);
    } catch {
      return null;
    }
  },

  async remove(ref: string): Promise<void> {
    try {
      const { dirs, name } = splitRef(ref);
      const dir = await dirHandle(dirs, false);
      await dir.removeEntry(name);
    } catch {
      // Already gone — removing a missing file is not an error here.
    }
  },

  async list(prefix: string): Promise<StoredFile[]> {
    const dirs = prefix.split('/').filter((part) => part.length > 0);
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await dirHandle(dirs, false);
    } catch {
      return [];
    }
    const results: StoredFile[] = [];
    for await (const [entryName, handle] of dir.entries()) {
      if (handle.kind !== 'file') continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      results.push({
        ref: `${prefix}/${entryName}`,
        mimeType: file.type || 'application/octet-stream',
        byteLength: file.size,
      });
    }
    return results;
  },

  async exists(ref: string): Promise<boolean> {
    try {
      const { dirs, name } = splitRef(ref);
      const dir = await dirHandle(dirs, false);
      await dir.getFileHandle(name, { create: false });
      return true;
    } catch {
      return false;
    }
  },
};
