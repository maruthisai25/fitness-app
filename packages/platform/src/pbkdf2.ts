/**
 * PBKDF2-HMAC-SHA256 (RFC 8018 §5.2) over an injected SHA-256 digest.
 *
 * This exists for one reason: React Native has no WebCrypto `deriveBits`, and
 * `expo-crypto` (57.x) exposes `digest`, `getRandomBytes*`, `randomUUID` and
 * AES-GCM — but no KDF. Rather than let the mobile app keep a private copy of
 * the derivation (which is how it came to run 20 000 iterations while web ran
 * 210 000), the loop lives here, next to the format it feeds, and is tested
 * against WebCrypto's own PBKDF2 in `pbkdf2.test.ts`.
 *
 * Injecting the digest is also what makes the mobile path testable: under Node
 * the same code runs with `crypto.subtle.digest`, so the cross-compatibility
 * test exercises the real derivation rather than a stand-in.
 */

import { concatBytes, DERIVED_KEY_BYTES } from './crypto-format.js';

/** SHA-256 of `bytes`. Async because every platform primitive we have is. */
export type Sha256Digest = (bytes: Uint8Array) => Promise<Uint8Array>;

const HMAC_BLOCK_BYTES = 64;
const SHA256_OUTPUT_BYTES = 32;

function xorInto(target: Uint8Array, other: Uint8Array): void {
  for (let i = 0; i < target.length; i += 1) {
    target[i] = target[i]! ^ other[i]!;
  }
}

/** HMAC-SHA256 (RFC 2104) built from a raw digest. */
async function hmacSha256(
  digest: Sha256Digest,
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const shortened = key.length > HMAC_BLOCK_BYTES ? await digest(key) : key;
  const block = new Uint8Array(HMAC_BLOCK_BYTES);
  block.set(shortened);

  const ipad = new Uint8Array(HMAC_BLOCK_BYTES);
  const opad = new Uint8Array(HMAC_BLOCK_BYTES);
  for (let i = 0; i < HMAC_BLOCK_BYTES; i += 1) {
    ipad[i] = block[i]! ^ 0x36;
    opad[i] = block[i]! ^ 0x5c;
  }

  const inner = await digest(concatBytes(ipad, data));
  return digest(concatBytes(opad, inner));
}

/**
 * A reusable HMAC key schedule. The inner/outer pads depend only on the
 * password, and PBKDF2 re-derives them once per iteration if you write the
 * naive version — which is the single biggest cost in the loop. Precomputing
 * them roughly halves the work.
 */
async function prepareHmacKey(digest: Sha256Digest, password: Uint8Array) {
  const shortened = password.length > HMAC_BLOCK_BYTES ? await digest(password) : password;
  const block = new Uint8Array(HMAC_BLOCK_BYTES);
  block.set(shortened);
  const ipad = new Uint8Array(HMAC_BLOCK_BYTES);
  const opad = new Uint8Array(HMAC_BLOCK_BYTES);
  for (let i = 0; i < HMAC_BLOCK_BYTES; i += 1) {
    ipad[i] = block[i]! ^ 0x36;
    opad[i] = block[i]! ^ 0x5c;
  }
  return async (data: Uint8Array): Promise<Uint8Array> => {
    const inner = await digest(concatBytes(ipad, data));
    return digest(concatBytes(opad, inner));
  };
}

export interface Pbkdf2Options {
  /** Bytes to derive. Defaults to one AES-256 key. */
  keyLength?: number;
}

/**
 * Derives `keyLength` bytes from `password` and `salt`.
 *
 * @param digest      SHA-256 primitive (expo-crypto on device, WebCrypto in tests)
 * @param password    UTF-8 bytes of the user's passphrase
 * @param salt        fresh random salt, carried in the payload
 * @param iterations  read from the payload on import, never assumed
 */
export async function pbkdf2Sha256(
  digest: Sha256Digest,
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  options: Pbkdf2Options = {},
): Promise<Uint8Array> {
  const keyLength = options.keyLength ?? DERIVED_KEY_BYTES;
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error(`PBKDF2 iterations must be a positive integer, got ${iterations}`);
  }
  if (!Number.isInteger(keyLength) || keyLength < 1) {
    throw new Error(`PBKDF2 keyLength must be a positive integer, got ${keyLength}`);
  }

  const prf = await prepareHmacKey(digest, password);
  const blockCount = Math.ceil(keyLength / SHA256_OUTPUT_BYTES);
  const output = new Uint8Array(blockCount * SHA256_OUTPUT_BYTES);

  for (let blockIndex = 1; blockIndex <= blockCount; blockIndex += 1) {
    // INT(i), big-endian, appended to the salt for the first HMAC of the block.
    const counter = new Uint8Array(4);
    counter[0] = (blockIndex >>> 24) & 0xff;
    counter[1] = (blockIndex >>> 16) & 0xff;
    counter[2] = (blockIndex >>> 8) & 0xff;
    counter[3] = blockIndex & 0xff;

    let u = await prf(concatBytes(salt, counter));
    const accumulator = new Uint8Array(u); // copy: `u` is reassigned each round
    for (let round = 1; round < iterations; round += 1) {
      u = await prf(u);
      xorInto(accumulator, u);
    }
    output.set(accumulator, (blockIndex - 1) * SHA256_OUTPUT_BYTES);
  }

  return output.subarray(0, keyLength);
}

/** Exported for the equivalence test; not part of the public surface. */
export const __testing = { hmacSha256 };
