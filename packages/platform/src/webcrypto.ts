/**
 * The reference `Crypto` adapter, backed by WebCrypto
 * (`globalThis.crypto.subtle`) — available in every modern browser and in Node
 * >= 19 without a polyfill. AES-256-GCM for confidentiality and integrity,
 * PBKDF2-SHA256 to turn the user's export passphrase into a key (DESIGN.md §8).
 *
 * This is the reference implementation of the envelope in `crypto-format.ts`:
 * where a platform has a compiled PBKDF2, it uses the full
 * `PBKDF2_ITERATIONS.native` count. `portable-crypto.ts` is the same envelope
 * over hand-rolled derivation for platforms that do not, and
 * `cross-compat.test.ts` holds the two to each other.
 */

import {
  AES_KEY_BITS,
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  ENCRYPTED_PAYLOAD_VERSION,
  IV_BYTES,
  parseEncryptedPayload,
  PBKDF2_ITERATIONS,
  SALT_BYTES,
  utf8ToBytes,
  type EncryptedPayload,
} from './crypto-format.js';
import type { Crypto as CryptoAdapter } from './index.js';

interface MinimalSubtleCrypto {
  importKey(
    format: 'raw',
    keyData: Uint8Array,
    algorithm: 'PBKDF2',
    extractable: boolean,
    keyUsages: readonly string[],
  ): Promise<unknown>;
  deriveKey(
    algorithm: { name: 'PBKDF2'; salt: Uint8Array; iterations: number; hash: 'SHA-256' },
    baseKey: unknown,
    derivedKeyAlgorithm: { name: 'AES-GCM'; length: number },
    extractable: boolean,
    keyUsages: readonly string[],
  ): Promise<unknown>;
  encrypt(
    algorithm: { name: 'AES-GCM'; iv: Uint8Array },
    key: unknown,
    data: Uint8Array,
  ): Promise<ArrayBuffer>;
  decrypt(
    algorithm: { name: 'AES-GCM'; iv: Uint8Array },
    key: unknown,
    data: Uint8Array,
  ): Promise<ArrayBuffer>;
}

interface MinimalCrypto {
  subtle: MinimalSubtleCrypto;
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}

function getWebCrypto(): MinimalCrypto {
  const candidate = (globalThis as { crypto?: MinimalCrypto }).crypto;
  if (!candidate?.subtle) {
    throw new Error(
      'WebCrypto (globalThis.crypto.subtle) is not available in this environment; ' +
        'export/import requires a Node >=19 or browser runtime.',
    );
  }
  return candidate;
}

function randomBytes(webCrypto: MinimalCrypto, length: number): Uint8Array {
  return webCrypto.getRandomValues(new Uint8Array(length));
}

async function deriveAesKey(
  webCrypto: MinimalCrypto,
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<unknown> {
  const keyMaterial = await webCrypto.subtle.importKey(
    'raw',
    utf8ToBytes(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return webCrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function createWebCryptoAdapter(): CryptoAdapter {
  return {
    async encryptJson<T>(data: T, passphrase: string): Promise<EncryptedPayload> {
      const webCrypto = getWebCrypto();
      const salt = randomBytes(webCrypto, SALT_BYTES);
      const iv = randomBytes(webCrypto, IV_BYTES);
      const key = await deriveAesKey(webCrypto, passphrase, salt, PBKDF2_ITERATIONS.native);
      const plaintext = utf8ToBytes(JSON.stringify(data));
      const ciphertext = await webCrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
      return {
        version: ENCRYPTED_PAYLOAD_VERSION,
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2',
        kdfHash: 'SHA-256',
        iterations: PBKDF2_ITERATIONS.native,
        saltB64: bytesToBase64(salt),
        ivB64: bytesToBase64(iv),
        // WebCrypto appends the GCM tag to the ciphertext, which is what the
        // envelope stores.
        ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
      };
    },

    async decryptJson<T>(payload: EncryptedPayload, passphrase: string): Promise<T> {
      const webCrypto = getWebCrypto();
      // An imported file is untrusted input (DESIGN.md §11).
      const parsed = parseEncryptedPayload(payload);
      const salt = base64ToBytes(parsed.saltB64);
      const iv = base64ToBytes(parsed.ivB64);
      const key = await deriveAesKey(webCrypto, passphrase, salt, parsed.iterations);
      const ciphertext = base64ToBytes(parsed.ciphertextB64);
      let plaintext: ArrayBuffer;
      try {
        plaintext = await webCrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      } catch {
        throw new Error('Decryption failed: wrong passphrase or corrupted export bundle.');
      }
      return JSON.parse(bytesToUtf8(new Uint8Array(plaintext))) as T;
    },
  };
}
