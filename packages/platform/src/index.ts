/**
 * `@vigor/platform` — adapter interfaces only. DESIGN.md §3.
 *
 * Each app supplies the implementations (expo-secure-store / expo-file-system /
 * expo-notifications on mobile; IndexedDB / OPFS / Web Notifications on web).
 * Nothing here imports another workspace package: platform is a leaf.
 */

/**
 * Hardware-backed on mobile (expo-secure-store). On web this is IndexedDB and
 * the settings screen must say so — browser storage is not hardware-backed
 * (DESIGN.md §6.1).
 *
 * The Anthropic API key is the only secret stored here, and only
 * `packages/ai/client.ts` and the settings screen may read it (DESIGN.md §11).
 */
export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** True when the platform backs this store with device-level encryption. */
  isHardwareBacked(): boolean;
}

/** Bytes as they cross the platform boundary — base64, so both shells agree. */
export interface StoredFile {
  /** Sandbox-relative path, e.g. `photos/2026-09-10-front.jpg`. */
  ref: string;
  mimeType: string;
  byteLength: number;
}

/**
 * Progress photos and export bundles. Mobile writes under
 * `FileSystem.documentDirectory`; web writes into OPFS (DESIGN.md §7.3, §7.4).
 */
export interface FileStore {
  write(ref: string, base64: string, mimeType: string): Promise<StoredFile>;
  readBase64(ref: string): Promise<string | null>;
  remove(ref: string): Promise<void>;
  list(prefix: string): Promise<StoredFile[]>;
  exists(ref: string): Promise<boolean>;
}

export interface ScheduledNotification {
  /** Stable id so a reminder can be rescheduled or cancelled idempotently. */
  id: string;
  title: string;
  body: string;
  /** ISO 8601 UTC timestamp to fire at. */
  fireAt: string;
}

/**
 * Local notifications only — there is no server (DESIGN.md §1). On web these
 * fire only while the tab is open (DESIGN.md §7.4).
 */
export interface Notifications {
  requestPermission(): Promise<boolean>;
  hasPermission(): Promise<boolean>;
  schedule(notification: ScheduledNotification): Promise<void>;
  cancel(id: string): Promise<void>;
  cancelAll(): Promise<void>;
  /** Fires with the screen off on mobile; used by the session rest timer. */
  supportsBackgroundDelivery(): boolean;
}

/** Drives the `ai_jobs` retry queue (DESIGN.md §8). */
export interface NetworkStatus {
  isOnline(): Promise<boolean>;
  /** Returns an unsubscribe function. */
  subscribe(listener: (online: boolean) => void): () => void;
}

/**
 * The only place "now" is read from. Engines and repositories take a `Clock`
 * instead of calling `Date` directly so fixtures and tests are deterministic
 * (DESIGN.md §4: timestamps are ISO 8601 UTC, calendar days are local
 * `YYYY-MM-DD` strings).
 */
export interface Clock {
  /** Current instant as an ISO 8601 UTC string. */
  now(): string;
  /** Today as a local calendar day, `YYYY-MM-DD`. */
  today(): string;
}

/**
 * A passphrase-encrypted JSON envelope (DESIGN.md §8 export/import). Every
 * field needed to decrypt travels with the payload except the passphrase
 * itself, which the user supplies again on import.
 */
export interface EncryptedPayload {
  version: 1;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2';
  kdfHash: 'SHA-256';
  /** PBKDF2 iteration count used to derive the key for this payload. */
  iterations: number;
  /** Base64. */
  saltB64: string;
  /** Base64. */
  ivB64: string;
  /** Base64 ciphertext, GCM auth tag included. */
  ciphertextB64: string;
}

/**
 * AES-GCM + PBKDF2 via WebCrypto where available (DESIGN.md §8). Used for
 * export/import bundles. Wrong passphrase or a tampered payload rejects
 * rather than returning garbage, because GCM authentication fails first.
 */
export interface Crypto {
  encryptJson<T>(data: T, passphrase: string): Promise<EncryptedPayload>;
  decryptJson<T>(payload: EncryptedPayload, passphrase: string): Promise<T>;
}

/** The full set of adapters an app hands to the shared packages. */
export interface PlatformAdapters {
  secureStore: SecureStore;
  fileStore: FileStore;
  notifications: Notifications;
  network: NetworkStatus;
  clock: Clock;
  crypto: Crypto;
}
