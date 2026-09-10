/**
 * The test that matters for DESIGN.md §8: a bundle exported on one device has
 * to open on the other.
 *
 * `createWebCryptoAdapter` is the web app's real adapter, unchanged. The mobile
 * side is `createPortableCryptoAdapter` — the exact code
 * `apps/mobile/src/platform/exportCrypto.ts` runs, with expo-crypto's four
 * primitives swapped for Node's. Nothing about the format, the base64 codec or
 * the PBKDF2 loop is stubbed: only the leaf calls that need a device.
 */
import { describe, expect, it } from 'vitest';

import { GCM_TAG_BYTES, PBKDF2_ITERATIONS, type EncryptedPayload } from './crypto-format.js';
import { createPortableCryptoAdapter, type PortableCryptoPrimitives } from './portable-crypto.js';
import { createWebCryptoAdapter } from './webcrypto.js';

/**
 * expo-crypto's `digest` / `getRandomBytesAsync` / `aesEncryptAsync` /
 * `aesDecryptAsync`, played by Node. The bindings are one call each on both
 * sides, which is the point: everything above them is the shipped code.
 */
const nodePrimitives: PortableCryptoPrimitives = {
  async digestSha256(bytes) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  },

  async randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  },

  async aesGcmEncrypt(key, iv, plaintext) {
    const aesKey = await crypto.subtle.importKey(
      'raw',
      key as Uint8Array<ArrayBuffer>,
      'AES-GCM',
      false,
      ['encrypt'],
    );
    const sealed = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer>, tagLength: GCM_TAG_BYTES * 8 },
      aesKey,
      plaintext as Uint8Array<ArrayBuffer>,
    );
    return new Uint8Array(sealed);
  },

  async aesGcmDecrypt(key, iv, ciphertextWithTag) {
    const aesKey = await crypto.subtle.importKey(
      'raw',
      key as Uint8Array<ArrayBuffer>,
      'AES-GCM',
      false,
      ['decrypt'],
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer>, tagLength: GCM_TAG_BYTES * 8 },
      aesKey,
      ciphertextWithTag as Uint8Array<ArrayBuffer>,
    );
    return new Uint8Array(plaintext);
  },
};

const web = createWebCryptoAdapter();
const mobile = createPortableCryptoAdapter(nodePrimitives);

/** Shaped like a real export bundle: nested rows, unicode, floats, nulls. */
const bundle = {
  schemaVersion: 1,
  exportedAt: '2026-09-10T07:15:00.000Z',
  profile: { displayName: 'Athlete', heightCm: 178.5, unitSystem: 'metric', notes: null },
  workouts: [
    {
      id: '0192f0a1-0000-7000-8000-000000000001',
      date: '2026-09-09',
      sets: [
        { setIndex: 0, actualReps: 12, actualLoadKg: 60, rpe: 7.5 },
        { setIndex: 1, actualReps: 11, actualLoadKg: 60, rpe: 8 },
      ],
    },
  ],
  memories: [{ kind: 'dislike', text: 'no overhead press — shoulder ✗', confidence: 0.9 }],
  notes: 'unicode ✓ и текст 筋トレ 🏋️',
};

const PASSPHRASE = 'correct-horse-battery-staple';
/** Deriving at 210 000 iterations in JavaScript is slow on purpose. */
const SLOW = 120_000;

describe('cross-platform export compatibility', () => {
  it(
    'opens a web-written bundle with the mobile implementation',
    async () => {
      const payload = await web.encryptJson(bundle, PASSPHRASE);
      expect(payload.iterations).toBe(PBKDF2_ITERATIONS.native);

      const restored = await mobile.decryptJson<typeof bundle>(payload, PASSPHRASE);
      expect(restored).toEqual(bundle);
    },
    SLOW,
  );

  it(
    'opens a mobile-written bundle with the web implementation',
    async () => {
      const payload = await mobile.encryptJson(bundle, PASSPHRASE);
      expect(payload.iterations).toBe(PBKDF2_ITERATIONS.portable);

      const restored = await web.decryptJson<typeof bundle>(payload, PASSPHRASE);
      expect(restored).toEqual(bundle);
    },
    SLOW,
  );

  it(
    'derives the same key from a non-ASCII passphrase on both sides',
    async () => {
      // The failure this guards against is silent: a different UTF-8 encoding
      // of the passphrase produces a different key and reads as "wrong
      // passphrase" to the user.
      const passphrase = 'pässwört 筋トレ 🏋️';
      const payload = await mobile.encryptJson({ ok: true }, passphrase);
      await expect(web.decryptJson<{ ok: boolean }>(payload, passphrase)).resolves.toEqual({
        ok: true,
      });
    },
    SLOW,
  );

  it(
    'writes the same envelope shape from both implementations',
    async () => {
      const [fromWeb, fromMobile] = await Promise.all([
        web.encryptJson({ x: 1 }, PASSPHRASE),
        mobile.encryptJson({ x: 1 }, PASSPHRASE),
      ]);
      const shape = (payload: EncryptedPayload) => ({
        ...payload,
        // Fresh salt/IV/ciphertext per export — compared for length, not value.
        saltB64: payload.saltB64.length,
        ivB64: payload.ivB64.length,
        ciphertextB64: typeof payload.ciphertextB64,
        iterations: 'read from payload',
      });
      expect(shape(fromWeb)).toEqual(shape(fromMobile));
    },
    SLOW,
  );

  it(
    'rejects a wrong passphrase on the mobile side with the same message as web',
    async () => {
      const payload = await mobile.encryptJson({ secret: 'value' }, PASSPHRASE);
      await expect(mobile.decryptJson(payload, 'wrong-passphrase')).rejects.toThrow(
        /Decryption failed/,
      );
      await expect(web.decryptJson(payload, 'wrong-passphrase')).rejects.toThrow(
        /Decryption failed/,
      );
    },
    SLOW,
  );

  it(
    'rejects a tampered ciphertext on both sides (GCM authentication)',
    async () => {
      const payload = await mobile.encryptJson({ secret: 'value' }, PASSPHRASE);
      const tampered: EncryptedPayload = {
        ...payload,
        ciphertextB64: `${payload.ciphertextB64.slice(0, -4)}AAAA`,
      };
      await expect(mobile.decryptJson(tampered, PASSPHRASE)).rejects.toThrow(/Decryption failed/);
      await expect(web.decryptJson(tampered, PASSPHRASE)).rejects.toThrow(/Decryption failed/);
    },
    SLOW,
  );

  it(
    'refuses a downgraded work factor before touching the key',
    async () => {
      const payload = await mobile.encryptJson({ x: 1 }, PASSPHRASE);
      // The shape a pre-unification mobile export had.
      const downgraded = { ...payload, iterations: 20_000 };
      await expect(mobile.decryptJson(downgraded as EncryptedPayload, PASSPHRASE)).rejects.toThrow(
        /Not a VigorEngine encrypted export/,
      );
      await expect(web.decryptJson(downgraded as EncryptedPayload, PASSPHRASE)).rejects.toThrow(
        /Not a VigorEngine encrypted export/,
      );
    },
    SLOW,
  );
});
