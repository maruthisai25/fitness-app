import { describe, expect, it } from 'vitest';

import { createWebCryptoAdapter } from './webcrypto.js';

describe('createWebCryptoAdapter', () => {
  it('round-trips an arbitrary JSON payload', async () => {
    const crypto = createWebCryptoAdapter();
    const bundle = {
      version: 1,
      profile: { displayName: 'Athlete', heightCm: 178.5 },
      workouts: [{ id: 'w1', date: '2026-09-10', sets: [{ reps: 12, loadKg: 60 }] }],
      note: 'unicode ✓ и текст',
    };

    const encrypted = await crypto.encryptJson(bundle, 'correct-horse-battery-staple');
    expect(encrypted.algorithm).toBe('AES-GCM');
    expect(encrypted.kdf).toBe('PBKDF2');
    expect(encrypted.ciphertextB64).not.toEqual(JSON.stringify(bundle));

    const decrypted = await crypto.decryptJson<typeof bundle>(
      encrypted,
      'correct-horse-battery-staple',
    );
    expect(decrypted).toEqual(bundle);
  });

  it('produces a different salt and ciphertext on every call (non-deterministic)', async () => {
    const crypto = createWebCryptoAdapter();
    const a = await crypto.encryptJson({ x: 1 }, 'passphrase');
    const b = await crypto.encryptJson({ x: 1 }, 'passphrase');
    expect(a.saltB64).not.toEqual(b.saltB64);
    expect(a.ivB64).not.toEqual(b.ivB64);
    expect(a.ciphertextB64).not.toEqual(b.ciphertextB64);
  });

  it('rejects decryption with the wrong passphrase', async () => {
    const crypto = createWebCryptoAdapter();
    const encrypted = await crypto.encryptJson({ secret: 'value' }, 'right-passphrase');
    await expect(crypto.decryptJson(encrypted, 'wrong-passphrase')).rejects.toThrow(
      /Decryption failed/,
    );
  });

  it('rejects decryption of a tampered ciphertext (GCM authentication)', async () => {
    const crypto = createWebCryptoAdapter();
    const encrypted = await crypto.encryptJson({ secret: 'value' }, 'passphrase');
    const tampered = { ...encrypted, ciphertextB64: encrypted.ciphertextB64.slice(0, -4) + 'AAAA' };
    await expect(crypto.decryptJson(tampered, 'passphrase')).rejects.toThrow(/Decryption failed/);
  });
});
