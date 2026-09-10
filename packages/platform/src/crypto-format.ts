/**
 * The on-disk format of an encrypted VigorEngine export (DESIGN.md §8).
 *
 * One format, both shells. A bundle written by the web app must open on the
 * phone and vice versa, so everything a reader needs — version, KDF parameters,
 * salt, IV — travels inside the payload; only the passphrase is supplied again
 * by the user. That also means the iteration count is *read from the payload*,
 * never assumed: the two platforms deliberately write different counts (see
 * `PBKDF2_ITERATIONS`), and raising either one later must not orphan bundles
 * already exported.
 *
 * `zod` is the boundary check (DESIGN.md §11: "zod for every boundary"). An
 * imported file is untrusted input; it gets parsed before a single byte of it
 * reaches a crypto primitive.
 */

import { z } from 'zod';

/**
 * Bumped only for a breaking change to the envelope. Readers reject anything
 * they do not recognise rather than guessing.
 */
export const ENCRYPTED_PAYLOAD_VERSION = 1;

/** AES-256-GCM: confidentiality and integrity in one primitive. */
export const AES_KEY_BITS = 256;
/** GCM authentication tag, appended to the ciphertext before base64. */
export const GCM_TAG_BYTES = 16;
/** 96-bit IV — the size AES-GCM is specified for, and the only one to use. */
export const IV_BYTES = 12;
/** 128-bit salt, fresh per export. */
export const SALT_BYTES = 16;
/** PBKDF2-HMAC-SHA256 output length, in bytes: exactly one AES-256 key. */
export const DERIVED_KEY_BYTES = AES_KEY_BITS / 8;

/**
 * PBKDF2 iteration counts, per implementation strength.
 *
 * `native` is what a platform with a compiled PBKDF2 uses — the OWASP
 * recommendation for PBKDF2-HMAC-SHA256, and what WebCrypto's `deriveBits`
 * finishes in single-digit milliseconds.
 *
 * `portable` is the count for a JavaScript implementation that has to make two
 * async digest calls per iteration (`pbkdf2.ts`). Measured on Node 25.4 as a
 * proxy for the phone (`pbkdf2.test.ts` prints these): 100 000 iterations takes
 * ~3.6 s, 210 000 takes ~6.7 s — dominated by per-call async overhead, not by
 * hashing, so a device is no faster. 100 000 keeps an export to one visible
 * pause while still being 5x the work factor the mobile app previously used.
 *
 * Both counts are recorded in the payload, so a bundle from either side opens
 * on either side; only the writer's cost differs.
 */
export const PBKDF2_ITERATIONS = {
  native: 210_000,
  portable: 100_000,
} as const;

/** Nothing below this is accepted on import, whatever the payload claims. */
export const PBKDF2_MIN_ITERATIONS = PBKDF2_ITERATIONS.portable;

/**
 * Standard base64 with padding — the only encoding the format uses. Rejects
 * base64url (`-`/`_`) so a payload cannot round-trip through two encodings and
 * silently change meaning.
 */
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const base64 = (label: string) =>
  z
    .string()
    .refine((value) => value.length > 0 && BASE64_RE.test(value), `${label} must be base64`);

/**
 * The envelope. Field names carry the `B64` suffix so no caller can mistake a
 * string for raw bytes.
 */
export const encryptedPayloadSchema = z.object({
  version: z.literal(ENCRYPTED_PAYLOAD_VERSION),
  algorithm: z.literal('AES-GCM'),
  kdf: z.literal('PBKDF2'),
  kdfHash: z.literal('SHA-256'),
  /** PBKDF2 iteration count used for *this* payload. */
  iterations: z.int().min(PBKDF2_MIN_ITERATIONS).max(10_000_000),
  /** Base64, `SALT_BYTES` bytes. */
  saltB64: base64('saltB64'),
  /** Base64, `IV_BYTES` bytes. */
  ivB64: base64('ivB64'),
  /** Base64 ciphertext with the GCM tag appended. */
  ciphertextB64: base64('ciphertextB64'),
});

/**
 * A passphrase-encrypted JSON envelope (DESIGN.md §8 export/import). Every
 * field needed to decrypt travels with the payload except the passphrase
 * itself, which the user supplies again on import.
 */
export type EncryptedPayload = z.infer<typeof encryptedPayloadSchema>;

/**
 * Validates an untrusted value as an `EncryptedPayload`.
 *
 * Throws with a message that names the offending field, because the only human
 * who ever sees it is a user whose import just failed and who needs to know
 * whether to blame the file or the passphrase.
 */
export function parseEncryptedPayload(value: unknown): EncryptedPayload {
  const result = encryptedPayloadSchema.safeParse(value);
  if (result.success) return result.data;
  const detail = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw new Error(
    `Not a VigorEngine encrypted export (version ${ENCRYPTED_PAYLOAD_VERSION}): ${detail}`,
  );
}

/** True when `value` is a well-formed payload. Never throws. */
export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  return encryptedPayloadSchema.safeParse(value).success;
}

// ---------------------------------------------------------------------------
// Base64 — self-contained, so the codec is identical on both platforms.
// `Buffer` is Node-only and `btoa`/`atob` are byte-oriented and absent in
// React Native; a bundle must encode the same way everywhere or it will not
// open on the other device.
// ---------------------------------------------------------------------------

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
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

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let out = 0;
  for (const char of clean) {
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.subarray(0, out);
}

/**
 * UTF-8, also hand-rolled. `TextEncoder`/`TextDecoder` are not guaranteed on
 * Hermes, and a passphrase with a non-ASCII character must produce the same key
 * bytes on both platforms or the bundle simply will not open.
 */
export function utf8ToBytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const byte1 = bytes[i]!;
    i += 1;
    if (byte1 < 0x80) {
      result += String.fromCharCode(byte1);
    } else if (byte1 >> 5 === 0x6) {
      result += String.fromCharCode(((byte1 & 0x1f) << 6) | (bytes[i]! & 0x3f));
      i += 1;
    } else if (byte1 >> 4 === 0xe) {
      result += String.fromCharCode(
        ((byte1 & 0xf) << 12) | ((bytes[i]! & 0x3f) << 6) | (bytes[i + 1]! & 0x3f),
      );
      i += 2;
    } else {
      result += String.fromCodePoint(
        ((byte1 & 0x7) << 18) |
          ((bytes[i]! & 0x3f) << 12) |
          ((bytes[i + 1]! & 0x3f) << 6) |
          (bytes[i + 2]! & 0x3f),
      );
      i += 3;
    }
  }
  return result;
}

/** Concatenates byte arrays into one fresh `Uint8Array`. */
export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
