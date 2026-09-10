/**
 * The hand-rolled PBKDF2 exists only because React Native has no native one
 * (see `pbkdf2.ts`). That makes it the highest-risk code in the export path: if
 * it disagrees with WebCrypto by a single byte, bundles written on one platform
 * simply never open on the other, and the failure looks exactly like a wrong
 * passphrase.
 *
 * So it is tested two ways — against published RFC 6070-style vectors for
 * HMAC-SHA256, and against WebCrypto's own `deriveBits` across a spread of
 * inputs.
 */
import { describe, expect, it } from 'vitest';

import { utf8ToBytes, PBKDF2_ITERATIONS } from './crypto-format.js';
import { pbkdf2Sha256, type Sha256Digest } from './pbkdf2.js';

/** The digest the mobile adapter injects, played by Node's WebCrypto. */
const nodeDigest: Sha256Digest = async (bytes) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));

/** WebCrypto's PBKDF2 — the implementation ours has to match. */
async function referencePbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyBytes: number,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', utf8ToBytes(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as Uint8Array<ArrayBuffer>, iterations, hash: 'SHA-256' },
    material,
    keyBytes * 8,
  );
  return new Uint8Array(bits);
}

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

describe('pbkdf2Sha256', () => {
  it('matches the published PBKDF2-HMAC-SHA256 test vectors', async () => {
    // RFC 6070's vectors are SHA-1; these are the widely-published SHA-256
    // equivalents for the same inputs.
    const cases: ReadonlyArray<[string, string, number, number, string]> = [
      [
        'password',
        'salt',
        1,
        32,
        '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b',
      ],
      [
        'password',
        'salt',
        2,
        32,
        'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43',
      ],
      [
        'password',
        'salt',
        4096,
        32,
        'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a',
      ],
      [
        'passwordPASSWORDpassword',
        'saltSALTsaltSALTsaltSALTsaltSALTsalt',
        4096,
        40,
        '348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1c635518c7dac47e9',
      ],
    ];

    for (const [password, salt, iterations, keyLength, expected] of cases) {
      const derived = await pbkdf2Sha256(
        nodeDigest,
        utf8ToBytes(password),
        utf8ToBytes(salt),
        iterations,
        { keyLength },
      );
      expect(hex(derived)).toBe(expected);
    }
  });

  it('agrees with WebCrypto deriveBits byte-for-byte', async () => {
    const salt = new Uint8Array(16);
    for (let i = 0; i < salt.length; i += 1) salt[i] = i * 11;

    for (const [password, iterations, keyBytes] of [
      ['correct-horse-battery-staple', 1, 32],
      ['pässwört mit ümlauts', 37, 32],
      ['筋トレ 🏋️', 500, 32],
      // > 32 bytes forces the multi-block path and its big-endian counter.
      ['multi-block', 250, 64],
      ['odd-length', 250, 45],
      // A password longer than the 64-byte HMAC block is pre-hashed.
      ['x'.repeat(200), 100, 32],
      ['', 64, 32],
    ] as ReadonlyArray<[string, number, number]>) {
      const ours = await pbkdf2Sha256(nodeDigest, utf8ToBytes(password), salt, iterations, {
        keyLength: keyBytes,
      });
      const theirs = await referencePbkdf2(password, salt, iterations, keyBytes);
      expect(hex(ours), `password=${JSON.stringify(password)} iterations=${iterations}`).toBe(
        hex(theirs),
      );
    }
  });

  it('rejects nonsense parameters instead of deriving a weak key', async () => {
    const pw = utf8ToBytes('x');
    const salt = utf8ToBytes('y');
    await expect(pbkdf2Sha256(nodeDigest, pw, salt, 0)).rejects.toThrow(/positive integer/);
    await expect(pbkdf2Sha256(nodeDigest, pw, salt, 1.5)).rejects.toThrow(/positive integer/);
    await expect(pbkdf2Sha256(nodeDigest, pw, salt, 1, { keyLength: 0 })).rejects.toThrow(
      /positive integer/,
    );
  });

  it('reports the wall-clock cost of each iteration count (Node proxy for the phone)', async () => {
    // DESIGN.md phase 7: the mobile count was chosen against this number.
    // Node's SHA-256 is faster than expo-crypto's bridged digest, so treat
    // this as a lower bound on device — but the ratio between the two counts
    // is what matters, and it holds.
    const salt = new Uint8Array(16).fill(3);
    const password = utf8ToBytes('correct-horse-battery-staple');

    for (const [label, iterations] of Object.entries(PBKDF2_ITERATIONS)) {
      const started = performance.now();
      await pbkdf2Sha256(nodeDigest, password, salt, iterations);
      const elapsedMs = performance.now() - started;
      console.log(
        `pbkdf2-sha256 ${label.padEnd(8)} ${String(iterations).padStart(7)} iterations: ` +
          `${elapsedMs.toFixed(0)} ms (Node ${process.version})`,
      );
      expect(elapsedMs).toBeGreaterThan(0);
    }
  }, 120_000);
});
