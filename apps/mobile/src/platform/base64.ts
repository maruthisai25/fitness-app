/**
 * Minimal base64 <-> UTF-8/bytes codec with no dependency on engine globals
 * (`btoa`/`atob`/`Buffer`), so it works the same on Hermes and web.
 *
 * Used by the export/import crypto helpers (DESIGN.md §8) and the file
 * store adapter — both need to move between raw bytes and the base64
 * strings that cross the `@vigor/platform` boundary.
 */

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: readonly number[] | Uint8Array): string {
  let result = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1]!;
    const c = bytes[i + 2]!;
    result +=
      BASE64_CHARS[a >> 2] +
      BASE64_CHARS[((a & 3) << 4) | (b >> 4)] +
      BASE64_CHARS[((b & 15) << 2) | (c >> 6)] +
      BASE64_CHARS[c & 63];
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const a = bytes[i]!;
    result += BASE64_CHARS[a >> 2] + BASE64_CHARS[(a & 3) << 4] + '==';
  } else if (remaining === 2) {
    const a = bytes[i]!;
    const b = bytes[i + 1]!;
    result +=
      BASE64_CHARS[a >> 2] +
      BASE64_CHARS[((a & 3) << 4) | (b >> 4)] +
      BASE64_CHARS[(b & 15) << 2] +
      '=';
  }
  return result;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '');
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

export function utf8ToBytes(input: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of input) {
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
      const byte2 = bytes[i]!;
      i += 1;
      result += String.fromCharCode(((byte1 & 0x1f) << 6) | (byte2 & 0x3f));
    } else if (byte1 >> 4 === 0xe) {
      const byte2 = bytes[i]!;
      const byte3 = bytes[i + 1]!;
      i += 2;
      result += String.fromCharCode(((byte1 & 0xf) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f));
    } else {
      const byte2 = bytes[i]!;
      const byte3 = bytes[i + 1]!;
      const byte4 = bytes[i + 2]!;
      i += 3;
      const codepoint =
        ((byte1 & 0x7) << 18) | ((byte2 & 0x3f) << 12) | ((byte3 & 0x3f) << 6) | (byte4 & 0x3f);
      result += String.fromCodePoint(codepoint);
    }
  }
  return result;
}

export function utf8ToBase64(input: string): string {
  return bytesToBase64(utf8ToBytes(input));
}

export function base64ToUtf8(base64: string): string {
  return bytesToUtf8(base64ToBytes(base64));
}
