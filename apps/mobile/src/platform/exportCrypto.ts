/**
 * `Crypto` adapter (DESIGN.md §8: "AES-GCM via WebCrypto on web and
 * `expo-crypto` on mobile"). `expo-crypto`'s `aes` module gives us real
 * AES-256-GCM; it ships no KDF primitive, so PBKDF2-HMAC-SHA256 (RFC 8018)
 * is built here from its raw SHA-256 digest. `ITERATIONS` trades off
 * against on-device latency — see the phase-0 report for the follow-up.
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
import type { Crypto, EncryptedPayload } from '@vigor/platform';

import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from './base64';

const HMAC_BLOCK_SIZE = 64;
const HASH_LENGTH = 32;
const ITERATIONS = 20_000;
const SALT_BYTES = 16;
const GCM_TAG_LENGTH = 16;

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  // `Uint8Array`'s buffer is typed `ArrayBufferLike` (it could back onto a
  // `SharedArrayBuffer`); `digest` wants the DOM `BufferSource` shape, which
  // is narrower. Every array here is our own plain `new Uint8Array(...)`, so
  // the underlying buffer is always a real `ArrayBuffer`.
  const buffer = await digest(CryptoDigestAlgorithm.SHA256, bytes as unknown as ArrayBuffer);
  return new Uint8Array(buffer);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i]! ^ b[i]!;
  }
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  let keyBlock = key.length > HMAC_BLOCK_SIZE ? await sha256(key) : key;
  if (keyBlock.length < HMAC_BLOCK_SIZE) {
    const padded = new Uint8Array(HMAC_BLOCK_SIZE);
    padded.set(keyBlock);
    keyBlock = padded;
  }
  const ipad = new Uint8Array(HMAC_BLOCK_SIZE);
  const opad = new Uint8Array(HMAC_BLOCK_SIZE);
  for (let i = 0; i < HMAC_BLOCK_SIZE; i += 1) {
    ipad[i] = keyBlock[i]! ^ 0x36;
    opad[i] = keyBlock[i]! ^ 0x5c;
  }
  const inner = await sha256(concatBytes(ipad, data));
  return sha256(concatBytes(opad, inner));
}

/** PBKDF2-HMAC-SHA256 (RFC 8018 §5.2). */
async function pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number,
): Promise<Uint8Array> {
  const blockCount = Math.ceil(keyLength / HASH_LENGTH);
  const output = new Uint8Array(blockCount * HASH_LENGTH);
  for (let blockIndex = 1; blockIndex <= blockCount; blockIndex += 1) {
    const blockNumber = new Uint8Array(4);
    blockNumber[0] = (blockIndex >>> 24) & 0xff;
    blockNumber[1] = (blockIndex >>> 16) & 0xff;
    blockNumber[2] = (blockIndex >>> 8) & 0xff;
    blockNumber[3] = blockIndex & 0xff;

    let u = await hmacSha256(password, concatBytes(salt, blockNumber));
    let t = u;
    for (let round = 1; round < iterations; round += 1) {
      u = await hmacSha256(password, u);
      t = xorBytes(t, u);
    }
    output.set(t, (blockIndex - 1) * HASH_LENGTH);
  }
  return output.slice(0, keyLength);
}

async function deriveKey(
  passphrase: string,
  saltB64: string,
  iterations: number,
): Promise<AESEncryptionKey> {
  const keyBytes = await pbkdf2Sha256(
    utf8ToBytes(passphrase),
    base64ToBytes(saltB64),
    iterations,
    32,
  );
  return AESEncryptionKey.import(keyBytes);
}

export function createCrypto(): Crypto {
  return {
    async encryptJson<T>(data: T, passphrase: string): Promise<EncryptedPayload> {
      const saltB64 = bytesToBase64(await getRandomBytesAsync(SALT_BYTES));
      const key = await deriveKey(passphrase, saltB64, ITERATIONS);
      const plaintextB64 = bytesToBase64(utf8ToBytes(JSON.stringify(data)));
      const sealed = await aesEncryptAsync(plaintextB64, key, { tagLength: GCM_TAG_LENGTH });
      const ivB64 = await sealed.iv('base64');
      const ciphertextB64 = await sealed.ciphertext({ includeTag: true, encoding: 'base64' });
      return {
        version: 1,
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2',
        kdfHash: 'SHA-256',
        iterations: ITERATIONS,
        saltB64,
        ivB64,
        ciphertextB64,
      };
    },

    async decryptJson<T>(payload: EncryptedPayload, passphrase: string): Promise<T> {
      if (payload.version !== 1 || payload.algorithm !== 'AES-GCM' || payload.kdf !== 'PBKDF2') {
        throw new Error('Unsupported export payload format.');
      }
      const key = await deriveKey(passphrase, payload.saltB64, payload.iterations);
      const sealed = AESSealedData.fromParts(payload.ivB64, payload.ciphertextB64, GCM_TAG_LENGTH);
      const plaintextB64 = await aesDecryptAsync(sealed, key, { output: 'base64' });
      return JSON.parse(bytesToUtf8(base64ToBytes(plaintextB64))) as T;
    },
  };
}
