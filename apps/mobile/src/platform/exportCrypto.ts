/**
 * The mobile `Crypto` adapter (DESIGN.md §8: "AES-GCM via WebCrypto on web and
 * `expo-crypto` on mobile").
 *
 * This file used to hold its own PBKDF2 and its own envelope, at 20 000
 * iterations against the web app's 210 000 — two implementations of one format
 * that had drifted. The format, the base64 codec and the derivation now live in
 * `@vigor/platform` and are shared byte-for-byte with the WebCrypto reference
 * adapter; what is left here is the binding of four expo-crypto primitives.
 *
 * **Iteration count.** `expo-crypto` 57.x exposes `digest`, `getRandomBytes*`,
 * `randomUUID` and AES-GCM, but no KDF — there is no native PBKDF2 to call, on
 * this dependency set or via any module already in the tree. So the derivation
 * stays in JavaScript and the count is raised from 20 000 to
 * `PBKDF2_ITERATIONS.portable` (100 000), five times the previous work factor.
 * Measured on Node 25.4 as a proxy for the device: ~3.6 s at 100 000, ~6.7 s at
 * 210 000, the cost being two async digest calls per iteration rather than the
 * hashing itself. Export and import are both explicit, one-off user actions, so
 * a few seconds behind a spinner is the right trade; 210 000 was not.
 *
 * Bundles written on web at 210 000 still import correctly — the count travels
 * inside the payload and is read from there, never assumed — they just take
 * about twice as long to open.
 */
import {
  AESEncryptionKey,
  AESSealedData,
  CryptoDigestAlgorithm,
  aesDecryptAsync,
  aesEncryptAsync,
  digest,
  getRandomBytesAsync,
} from 'expo-crypto';
import {
  GCM_TAG_BYTES,
  createPortableCryptoAdapter,
  type Crypto,
  type PortableCryptoPrimitives,
} from '@vigor/platform';

/**
 * The expo-crypto bindings, exported so the shape stays honest: each one is a
 * single call, and everything above it is shared code.
 */
export const expoCryptoPrimitives: PortableCryptoPrimitives = {
  async digestSha256(bytes) {
    // `Uint8Array`'s buffer is typed `ArrayBufferLike` (it could back onto a
    // `SharedArrayBuffer`); `digest` wants the DOM `BufferSource` shape, which
    // is narrower. Every array here is our own plain `new Uint8Array(...)`, so
    // the underlying buffer is always a real `ArrayBuffer`.
    const hash = await digest(CryptoDigestAlgorithm.SHA256, bytes as unknown as ArrayBuffer);
    return new Uint8Array(hash);
  },

  randomBytes(length) {
    return getRandomBytesAsync(length);
  },

  async aesGcmEncrypt(key, iv, plaintext) {
    const sealed = await aesEncryptAsync(plaintext, await AESEncryptionKey.import(key), {
      // Supply the IV rather than letting expo generate one, so the envelope
      // and the cipher can never disagree about which nonce was used.
      nonce: { bytes: iv },
      tagLength: GCM_TAG_BYTES,
    });
    return sealed.ciphertext({ includeTag: true });
  },

  async aesGcmDecrypt(key, iv, ciphertextWithTag) {
    const sealed = AESSealedData.fromParts(iv, ciphertextWithTag, GCM_TAG_BYTES);
    return aesDecryptAsync(sealed, await AESEncryptionKey.import(key), { output: 'bytes' });
  },
};

export function createCrypto(): Crypto {
  return createPortableCryptoAdapter(expoCryptoPrimitives);
}
