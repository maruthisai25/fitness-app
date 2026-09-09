import type { Crypto as PlatformCrypto, EncryptedPayload } from '@vigor/platform';

/**
 * Web `Crypto` — DESIGN.md §8 export/import: AES-GCM + PBKDF2 via WebCrypto.
 * A wrong passphrase or a tampered payload rejects on decrypt (GCM
 * authentication fails first) rather than returning garbage.
 */

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const webCrypto: PlatformCrypto = {
  async encryptJson<T>(data: T, passphrase: string): Promise<EncryptedPayload> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(passphrase, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(data)),
    );
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
    const salt = fromBase64(payload.saltB64);
    const iv = fromBase64(payload.ivB64);
    const key = await deriveKey(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      fromBase64(payload.ciphertextB64),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  },
};
