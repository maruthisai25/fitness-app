import { describe, expect, it } from 'vitest';

import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  concatBytes,
  encryptedPayloadSchema,
  ENCRYPTED_PAYLOAD_VERSION,
  isEncryptedPayload,
  IV_BYTES,
  parseEncryptedPayload,
  PBKDF2_ITERATIONS,
  PBKDF2_MIN_ITERATIONS,
  SALT_BYTES,
  utf8ToBytes,
  type EncryptedPayload,
} from './crypto-format.js';

function validPayload(overrides: Partial<EncryptedPayload> = {}): Record<string, unknown> {
  return {
    version: ENCRYPTED_PAYLOAD_VERSION,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2',
    kdfHash: 'SHA-256',
    iterations: PBKDF2_ITERATIONS.native,
    saltB64: bytesToBase64(new Uint8Array(SALT_BYTES).fill(7)),
    ivB64: bytesToBase64(new Uint8Array(IV_BYTES).fill(9)),
    ciphertextB64: bytesToBase64(new Uint8Array(48).fill(1)),
    ...overrides,
  };
}

describe('encryptedPayloadSchema', () => {
  it('accepts a well-formed payload from either platform', () => {
    expect(isEncryptedPayload(validPayload())).toBe(true);
    expect(isEncryptedPayload(validPayload({ iterations: PBKDF2_ITERATIONS.portable }))).toBe(true);
  });

  it('names the offending field when the envelope is wrong', () => {
    expect(() => parseEncryptedPayload(validPayload({ ivB64: 'not base64!' }))).toThrow(/ivB64/);
    expect(() => parseEncryptedPayload({ ...validPayload(), version: 2 })).toThrow(/version/);
  });

  it('rejects an unknown algorithm or KDF rather than guessing', () => {
    expect(isEncryptedPayload({ ...validPayload(), algorithm: 'AES-CBC' })).toBe(false);
    expect(isEncryptedPayload({ ...validPayload(), kdf: 'scrypt' })).toBe(false);
    expect(isEncryptedPayload({ ...validPayload(), kdfHash: 'SHA-1' })).toBe(false);
  });

  it('refuses a payload that asks for a weakened work factor', () => {
    // The pre-unification mobile app wrote 20 000. A bundle claiming that count
    // must not be silently honoured.
    expect(isEncryptedPayload(validPayload({ iterations: 20_000 }))).toBe(false);
    expect(isEncryptedPayload(validPayload({ iterations: PBKDF2_MIN_ITERATIONS - 1 }))).toBe(false);
    expect(isEncryptedPayload(validPayload({ iterations: PBKDF2_MIN_ITERATIONS }))).toBe(true);
  });

  it('rejects non-objects and missing fields', () => {
    expect(isEncryptedPayload(null)).toBe(false);
    expect(isEncryptedPayload('{}')).toBe(false);
    const { ciphertextB64: _dropped, ...withoutCiphertext } = validPayload();
    expect(isEncryptedPayload(withoutCiphertext)).toBe(false);
  });

  it('rejects base64url, which would decode to different bytes', () => {
    expect(isEncryptedPayload(validPayload({ saltB64: 'aa-_aa==' }))).toBe(false);
  });

  it('parses to exactly the declared type', () => {
    const parsed = encryptedPayloadSchema.parse(validPayload());
    expect(parsed.version).toBe(1);
    expect(parsed.algorithm).toBe('AES-GCM');
  });
});

describe('base64 codec', () => {
  it('round-trips every byte value and every padding length', () => {
    for (let length = 0; length <= 8; length += 1) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) bytes[i] = (i * 37) % 256;
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) all[i] = i;
    expect(base64ToBytes(bytesToBase64(all))).toEqual(all);
  });

  it('agrees with Node’s Buffer, which is what a desktop tool would use', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    expect(base64ToBytes('SGVsbG8sIFZpZ29y')).toEqual(
      new Uint8Array(Buffer.from('SGVsbG8sIFZpZ29y', 'base64')),
    );
  });

  it('pads to a multiple of four', () => {
    expect(bytesToBase64(new Uint8Array([1]))).toMatch(/==$/);
    expect(bytesToBase64(new Uint8Array([1, 2]))).toMatch(/[^=]=$/);
    expect(bytesToBase64(new Uint8Array([1, 2, 3])).endsWith('=')).toBe(false);
  });
});

describe('utf8 codec', () => {
  it('round-trips ASCII, accents, Cyrillic, CJK and astral characters', () => {
    for (const text of [
      '',
      'correct-horse-battery-staple',
      'pässwörd',
      'парольная фраза',
      '筋トレ',
      'lift 🏋️ heavy',
    ]) {
      expect(bytesToUtf8(utf8ToBytes(text))).toBe(text);
    }
  });

  it('produces the same bytes Node does, so a passphrase derives one key everywhere', () => {
    // The whole point of hand-rolling this: an accented passphrase typed on the
    // phone has to hash to the same key as on the laptop.
    for (const text of ['pässwörd', '筋トレ', 'lift 🏋️ heavy']) {
      expect(utf8ToBytes(text)).toEqual(new Uint8Array(Buffer.from(text, 'utf8')));
    }
  });
});

describe('concatBytes', () => {
  it('joins in order and copies', () => {
    const a = new Uint8Array([1, 2]);
    const joined = concatBytes(a, new Uint8Array([3]), new Uint8Array(0), new Uint8Array([4, 5]));
    expect(joined).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    a[0] = 99;
    expect(joined[0]).toBe(1);
  });
});
