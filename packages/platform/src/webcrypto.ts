/**
 * `Crypto` adapter backed by WebCrypto (`globalThis.crypto.subtle`), which is
 * available on both Node (mobile/dev, and Node test runs) and every modern
 * browser (web) without a polyfill. AES-256-GCM for confidentiality and
 * integrity, PBKDF2-SHA256 to turn the user's export passphrase into a key
 * (DESIGN.md §8).
 */

import type { Crypto as CryptoAdapter, EncryptedPayload } from './index.js';

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AES_KEY_LENGTH_BITS = 256;

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

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Self-contained base64 codec — no dependence on `Buffer`, `btoa`/`atob`. */
function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : undefined;
    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[((b0 & 0b11) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out +=
      b1 === undefined
        ? '='
        : BASE64_CHARS[((b1 & 0b1111) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : BASE64_CHARS[b2 & 0b111111];
  }
  return out;
}

function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

async function deriveAesKey(
  webCrypto: MinimalCrypto,
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<unknown> {
  const keyMaterial = await webCrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return webCrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH_BITS },
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
      const key = await deriveAesKey(webCrypto, passphrase, salt, PBKDF2_ITERATIONS);
      const plaintext = new TextEncoder().encode(JSON.stringify(data));
      const ciphertext = await webCrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
      return {
        version: 1,
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2',
        kdfHash: 'SHA-256',
        iterations: PBKDF2_ITERATIONS,
        saltB64: toBase64(salt),
        ivB64: toBase64(iv),
        ciphertextB64: toBase64(new Uint8Array(ciphertext)),
      };
    },

    async decryptJson<T>(payload: EncryptedPayload, passphrase: string): Promise<T> {
      const webCrypto = getWebCrypto();
      const salt = fromBase64(payload.saltB64);
      const iv = fromBase64(payload.ivB64);
      const key = await deriveAesKey(webCrypto, passphrase, salt, payload.iterations);
      const ciphertext = fromBase64(payload.ciphertextB64);
      let plaintext: ArrayBuffer;
      try {
        plaintext = await webCrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      } catch {
        throw new Error('Decryption failed: wrong passphrase or corrupted export bundle.');
      }
      const json = new TextDecoder().decode(new Uint8Array(plaintext));
      return JSON.parse(json) as T;
    },
  };
}
