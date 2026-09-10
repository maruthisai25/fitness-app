/**
 * The `Crypto` adapter for platforms without WebCrypto — in practice React
 * Native, where `expo-crypto` supplies SHA-256, secure randomness and AES-GCM
 * but no KDF (DESIGN.md §8).
 *
 * The interesting part is what is *not* here: no format, no base64, no
 * derivation. Those live in `crypto-format.ts` and `pbkdf2.ts` and are shared
 * with the WebCrypto reference adapter, which is the whole point — the two
 * implementations used to disagree on iteration count (20 000 vs 210 000)
 * precisely because each owned its own copy. What remains is a thin binding of
 * four platform primitives to the one envelope.
 *
 * Because every primitive is injected, this file runs unchanged under Node,
 * which is how `cross-compat.test.ts` decrypts a web-written bundle with the
 * mobile code path rather than with a look-alike.
 */

import {
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
import type { Crypto } from './index.js';
import { pbkdf2Sha256, type Sha256Digest } from './pbkdf2.js';

/**
 * The four things a host platform must provide. Anything richer (a native
 * PBKDF2, say) should not use this adapter at all — see `webcrypto.ts`.
 */
export interface PortableCryptoPrimitives {
  /** SHA-256. `expo-crypto`'s `digest` on device; `crypto.subtle` under Node. */
  digestSha256: Sha256Digest;
  /** Cryptographically secure random bytes. */
  randomBytes(length: number): Promise<Uint8Array>;
  /**
   * AES-256-GCM. Returns ciphertext with the 16-byte authentication tag
   * appended, which is what the envelope stores.
   */
  aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array>;
  /** Must reject (throw) when the tag does not verify. */
  aesGcmDecrypt(
    key: Uint8Array,
    iv: Uint8Array,
    ciphertextWithTag: Uint8Array,
  ): Promise<Uint8Array>;
}

export interface PortableCryptoOptions {
  /**
   * Iteration count for payloads this adapter *writes*. Reading always honours
   * the count inside the payload.
   *
   * Defaults to `PBKDF2_ITERATIONS.portable` (100 000). The higher `native`
   * count is deliberately not the default here: every iteration is a separate
   * async digest call across the React Native bridge, so 210 000 costs the user
   * a visible stall on export. Bundles written elsewhere at 210 000 still open
   * — slowly, once, on import.
   */
  iterations?: number;
}

export function createPortableCryptoAdapter(
  primitives: PortableCryptoPrimitives,
  options: PortableCryptoOptions = {},
): Crypto {
  const writeIterations = options.iterations ?? PBKDF2_ITERATIONS.portable;

  async function deriveKey(
    passphrase: string,
    salt: Uint8Array,
    iterations: number,
  ): Promise<Uint8Array> {
    return pbkdf2Sha256(primitives.digestSha256, utf8ToBytes(passphrase), salt, iterations);
  }

  return {
    async encryptJson<T>(data: T, passphrase: string): Promise<EncryptedPayload> {
      const salt = await primitives.randomBytes(SALT_BYTES);
      const iv = await primitives.randomBytes(IV_BYTES);
      const key = await deriveKey(passphrase, salt, writeIterations);
      const ciphertext = await primitives.aesGcmEncrypt(key, iv, utf8ToBytes(JSON.stringify(data)));
      return {
        version: ENCRYPTED_PAYLOAD_VERSION,
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2',
        kdfHash: 'SHA-256',
        iterations: writeIterations,
        saltB64: bytesToBase64(salt),
        ivB64: bytesToBase64(iv),
        ciphertextB64: bytesToBase64(ciphertext),
      };
    },

    async decryptJson<T>(payload: EncryptedPayload, passphrase: string): Promise<T> {
      // An imported file is untrusted input (DESIGN.md §11): validate the
      // envelope before any of it reaches a primitive.
      const parsed = parseEncryptedPayload(payload);
      const key = await deriveKey(passphrase, base64ToBytes(parsed.saltB64), parsed.iterations);
      let plaintext: Uint8Array;
      try {
        plaintext = await primitives.aesGcmDecrypt(
          key,
          base64ToBytes(parsed.ivB64),
          base64ToBytes(parsed.ciphertextB64),
        );
      } catch {
        // GCM authentication fails first, so a wrong passphrase and a tampered
        // bundle are indistinguishable here — and that is the correct message.
        throw new Error('Decryption failed: wrong passphrase or corrupted export bundle.');
      }
      return JSON.parse(bytesToUtf8(plaintext)) as T;
    },
  };
}
