/**
 * `@vigor/platform` — adapter interfaces, plus the one piece of shared
 * implementation both shells must agree on byte-for-byte: the encrypted export
 * envelope (DESIGN.md §8). Everything else is supplied by the apps
 * (expo-secure-store / expo-file-system / expo-notifications on mobile;
 * IndexedDB / OPFS / Web Notifications on web). DESIGN.md §3.
 *
 * Nothing here imports another workspace package: platform is a leaf.
 */

import type { EncryptedPayload } from './crypto-format.js';

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
 * The export envelope and its `zod` schema live in `crypto-format.ts` — one
 * format both shells read and write (DESIGN.md §8). Re-exported here so
 * consumers keep importing `@vigor/platform` for everything.
 */
export {
  AES_KEY_BITS,
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  concatBytes,
  DERIVED_KEY_BYTES,
  encryptedPayloadSchema,
  ENCRYPTED_PAYLOAD_VERSION,
  GCM_TAG_BYTES,
  isEncryptedPayload,
  IV_BYTES,
  parseEncryptedPayload,
  PBKDF2_ITERATIONS,
  PBKDF2_MIN_ITERATIONS,
  SALT_BYTES,
  utf8ToBytes,
  type EncryptedPayload,
} from './crypto-format.js';

export { pbkdf2Sha256, type Pbkdf2Options, type Sha256Digest } from './pbkdf2.js';

export {
  createPortableCryptoAdapter,
  type PortableCryptoOptions,
  type PortableCryptoPrimitives,
} from './portable-crypto.js';

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
