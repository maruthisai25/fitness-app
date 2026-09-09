/**
 * In-memory implementations of every `@vigor/platform` adapter, for tests
 * and for the AI/db packages' own test suites to depend on without pulling
 * in Expo or a browser. No adapter here persists past process lifetime.
 */

import type {
  Clock,
  FileStore,
  Notifications,
  NetworkStatus,
  ScheduledNotification,
  SecureStore,
  StoredFile,
} from './index.js';

export function createMemorySecureStore(): SecureStore {
  const store = new Map<string, string>();
  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      store.set(key, value);
    },
    async remove(key) {
      store.delete(key);
    },
    isHardwareBacked() {
      return false;
    },
  };
}

export function createMemoryFileStore(): FileStore {
  const files = new Map<string, { base64: string; mimeType: string }>();
  return {
    async write(ref, base64, mimeType) {
      files.set(ref, { base64, mimeType });
      return { ref, mimeType, byteLength: base64.length };
    },
    async readBase64(ref) {
      return files.get(ref)?.base64 ?? null;
    },
    async remove(ref) {
      files.delete(ref);
    },
    async list(prefix) {
      const out: StoredFile[] = [];
      for (const [ref, file] of files) {
        if (ref.startsWith(prefix)) {
          out.push({ ref, mimeType: file.mimeType, byteLength: file.base64.length });
        }
      }
      return out;
    },
    async exists(ref) {
      return files.has(ref);
    },
  };
}

export function createMemoryNotifications(): Notifications {
  const scheduled = new Map<string, ScheduledNotification>();
  let permitted = false;
  return {
    async requestPermission() {
      permitted = true;
      return permitted;
    },
    async hasPermission() {
      return permitted;
    },
    async schedule(notification) {
      scheduled.set(notification.id, notification);
    },
    async cancel(id) {
      scheduled.delete(id);
    },
    async cancelAll() {
      scheduled.clear();
    },
    supportsBackgroundDelivery() {
      return false;
    },
  };
}

/** Exposed for assertions in tests: `.scheduled` mirrors pending notifications. */
export function createInspectableMemoryNotifications(): Notifications & {
  scheduled: Map<string, ScheduledNotification>;
} {
  const scheduled = new Map<string, ScheduledNotification>();
  let permitted = false;
  return {
    scheduled,
    async requestPermission() {
      permitted = true;
      return permitted;
    },
    async hasPermission() {
      return permitted;
    },
    async schedule(notification) {
      scheduled.set(notification.id, notification);
    },
    async cancel(id) {
      scheduled.delete(id);
    },
    async cancelAll() {
      scheduled.clear();
    },
    supportsBackgroundDelivery() {
      return false;
    },
  };
}

export function createMemoryNetworkStatus(initialOnline = true): NetworkStatus & {
  setOnline(online: boolean): void;
} {
  let online = initialOnline;
  const listeners = new Set<(online: boolean) => void>();
  return {
    async isOnline() {
      return online;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOnline(next) {
      online = next;
      for (const listener of listeners) listener(next);
    },
  };
}

/**
 * Deterministic clock for tests. With no fixed instant given, falls back to
 * the real system clock so it is also safe to use as a lightweight default.
 */
export function createMemoryClock(fixedIso?: string): Clock {
  return {
    now() {
      return fixedIso ?? new Date().toISOString();
    },
    today() {
      const d = fixedIso ? new Date(fixedIso) : new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
  };
}
