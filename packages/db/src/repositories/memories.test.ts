import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '../testing';
import { RowNotFoundError } from './support';

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase({ start: '2026-02-01T09:00:00.000Z' });
});

afterEach(async () => {
  await db.close();
});

describe('memories CRUD', () => {
  it('creates with defaults, reads back and updates', async () => {
    const created = await db.repos.memories.create({
      kind: 'dislike',
      domain: 'training',
      text: 'Hates burpees.',
    });

    expect(created.source).toBe('user');
    expect(created.confidence).toBe(1);
    expect(created.active).toBe(true);
    expect(created.evidence).toEqual([]);
    expect(created.createdAt).toBe(created.updatedAt);

    expect(await db.repos.memories.get(created.id)).toEqual(created);

    const updated = await db.repos.memories.update(created.id, {
      text: 'Hates burpees, will do mountain climbers.',
      confidence: 0.9,
    });
    expect(updated.text).toBe('Hates burpees, will do mountain climbers.');
    expect(updated.confidence).toBe(0.9);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt > created.updatedAt).toBe(true);
  });

  it('raises a typed error when updating a memory that is not there', async () => {
    await expect(db.repos.memories.update('missing', { text: 'x' })).rejects.toBeInstanceOf(
      RowNotFoundError,
    );
  });
});

describe('memories.listActive', () => {
  it('filters by kind and domain and orders by recency', async () => {
    const first = await db.repos.memories.create({
      kind: 'preference',
      domain: 'training',
      text: 'Prefers 40-minute sessions.',
    });
    await db.repos.memories.create({
      kind: 'constraint',
      domain: 'nutrition',
      text: 'Vegetarian on Tuesdays.',
    });
    const third = await db.repos.memories.create({
      kind: 'preference',
      domain: 'training',
      text: 'Trains in the morning.',
    });

    const all = await db.repos.memories.listActive();
    expect(all).toHaveLength(3);
    expect(all[0]?.id).toBe(third.id);

    const trainingPrefs = await db.repos.memories.listActive({
      kind: 'preference',
      domain: 'training',
    });
    expect(trainingPrefs.map((memory) => memory.id)).toEqual([third.id, first.id]);

    const limited = await db.repos.memories.listActive({ limit: 1 });
    expect(limited.map((memory) => memory.id)).toEqual([third.id]);
  });

  it('drops memories that have expired', async () => {
    const expiring = await db.repos.memories.create({
      kind: 'constraint',
      domain: 'training',
      text: 'Shoulder is sore this week.',
      expiresAt: '2026-02-08T00:00:00.000Z',
    });
    await db.repos.memories.create({
      kind: 'fact',
      domain: 'general',
      text: 'Trains at a home gym.',
    });

    const during = await db.repos.memories.listActive({ asOf: '2026-02-03T00:00:00.000Z' });
    expect(during.map((memory) => memory.id)).toContain(expiring.id);

    const after = await db.repos.memories.listActive({ asOf: '2026-02-09T00:00:00.000Z' });
    expect(after.map((memory) => memory.id)).not.toContain(expiring.id);
    expect(after).toHaveLength(1);
  });
});

describe('memories.forget', () => {
  it('soft-deletes: the row survives, listActive drops it, the reason is audited', async () => {
    const memory = await db.repos.memories.create({
      kind: 'dislike',
      domain: 'nutrition',
      text: 'Does not eat mushrooms.',
      evidence: [{ table: 'food_logs', id: 'log-1', note: 'said so in chat' }],
    });

    await db.repos.memories.forget(memory.id, 'user said they eat them now');

    const stored = await db.repos.memories.get(memory.id);
    expect(stored).not.toBeNull();
    expect(stored?.active).toBe(false);
    expect(stored?.text).toBe('Does not eat mushrooms.');
    // The evidence trail is exactly what a soft delete is for.
    expect(stored?.evidence).toEqual([
      { table: 'food_logs', id: 'log-1', note: 'said so in chat' },
    ]);

    expect(await db.repos.memories.listActive()).toEqual([]);
    expect(await db.repos.memories.list({ includeInactive: true })).toHaveLength(1);

    const audit = await db.repos.memories.listForgotten();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.memoryId).toBe(memory.id);
    expect(audit[0]?.reason).toBe('user said they eat them now');
    expect(audit[0]?.forgottenAt).toBe(stored?.updatedAt);
  });

  it('accepts no reason and can be undone', async () => {
    const memory = await db.repos.memories.create({
      kind: 'behavior',
      domain: 'training',
      text: 'Skips Friday sessions.',
      source: 'derived',
      confidence: 0.6,
    });

    await db.repos.memories.forget(memory.id);
    expect((await db.repos.memories.listForgotten())[0]?.reason).toBeNull();

    const restored = await db.repos.memories.restore(memory.id);
    expect(restored.active).toBe(true);
    expect(await db.repos.memories.listActive()).toHaveLength(1);
  });

  it('raises when the memory does not exist and writes no audit row', async () => {
    await expect(db.repos.memories.forget('nope')).rejects.toBeInstanceOf(RowNotFoundError);
    expect(await db.repos.memories.listForgotten()).toEqual([]);
  });

  it('hard delete removes the row and its audit trail', async () => {
    const memory = await db.repos.memories.create({
      kind: 'goal_note',
      domain: 'general',
      text: 'Wants to deadlift 180 kg.',
    });
    await db.repos.memories.forget(memory.id, 'goal reached');

    await db.repos.memories.remove(memory.id);

    expect(await db.repos.memories.get(memory.id)).toBeNull();
    expect(await db.repos.memories.listForgotten()).toEqual([]);
  });
});
