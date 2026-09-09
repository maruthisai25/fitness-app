import type { SecureStore } from '@vigor/platform';

/**
 * Web `SecureStore` — DESIGN.md §6.1, §7.4.
 *
 * IndexedDB, **not** hardware-backed. This is the one place the settings
 * screen (`src/you/SettingsPanel.tsx`) and the onboarding API-key step point
 * at when they explain that browser storage can be read by anything with
 * local code execution on the device, unlike `expo-secure-store` on mobile.
 */

const DB_NAME = 'vigorengine-secure-store';
const STORE_NAME = 'entries';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('VigorEngine: could not open secure store'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = fn(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('VigorEngine: secure store operation failed'));
    });
  } finally {
    db.close();
  }
}

export const webSecureStore: SecureStore = {
  async get(key: string): Promise<string | null> {
    const value = await withStore<string | undefined>('readonly', (store) => store.get(key));
    return value ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    await withStore<IDBValidKey>('readwrite', (store) => store.put(value, key));
  },
  async remove(key: string): Promise<void> {
    await withStore<undefined>('readwrite', (store) => store.delete(key));
  },
  isHardwareBacked(): boolean {
    return false;
  },
};
