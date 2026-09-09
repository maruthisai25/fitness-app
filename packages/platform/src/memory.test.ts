import { describe, expect, it } from 'vitest';

import {
  createInspectableMemoryNotifications,
  createMemoryClock,
  createMemoryFileStore,
  createMemoryNetworkStatus,
  createMemorySecureStore,
} from './memory.js';

describe('createMemorySecureStore', () => {
  it('round-trips get/set/remove', async () => {
    const store = createMemorySecureStore();
    expect(await store.get('apiKeyRef')).toBeNull();
    await store.set('apiKeyRef', 'sk-test-123');
    expect(await store.get('apiKeyRef')).toBe('sk-test-123');
    await store.remove('apiKeyRef');
    expect(await store.get('apiKeyRef')).toBeNull();
  });

  it('is never reported as hardware-backed', () => {
    expect(createMemorySecureStore().isHardwareBacked()).toBe(false);
  });
});

describe('createMemoryFileStore', () => {
  it('writes, reads, lists by prefix, and removes', async () => {
    const store = createMemoryFileStore();
    await store.write('photos/2026-09-10-front.jpg', 'YWJj', 'image/jpeg');
    await store.write('photos/2026-09-11-side.jpg', 'ZGVm', 'image/jpeg');
    await store.write('exports/bundle.json', 'e30=', 'application/json');

    expect(await store.exists('photos/2026-09-10-front.jpg')).toBe(true);
    expect(await store.readBase64('photos/2026-09-10-front.jpg')).toBe('YWJj');

    const photos = await store.list('photos/');
    expect(photos).toHaveLength(2);
    expect(photos.map((f) => f.ref).sort()).toEqual([
      'photos/2026-09-10-front.jpg',
      'photos/2026-09-11-side.jpg',
    ]);

    await store.remove('photos/2026-09-10-front.jpg');
    expect(await store.exists('photos/2026-09-10-front.jpg')).toBe(false);
    expect(await store.readBase64('photos/2026-09-10-front.jpg')).toBeNull();
  });
});

describe('createInspectableMemoryNotifications', () => {
  it('schedules, cancels, and cancels all', async () => {
    const notifications = createInspectableMemoryNotifications();
    expect(await notifications.hasPermission()).toBe(false);
    expect(await notifications.requestPermission()).toBe(true);

    await notifications.schedule({
      id: 'rest-timer-1',
      title: 'Rest over',
      body: 'Back to it.',
      fireAt: '2026-09-10T12:00:00.000Z',
    });
    expect(notifications.scheduled.size).toBe(1);

    await notifications.cancel('rest-timer-1');
    expect(notifications.scheduled.size).toBe(0);

    await notifications.schedule({
      id: 'a',
      title: 'A',
      body: 'a',
      fireAt: '2026-09-10T12:00:00.000Z',
    });
    await notifications.schedule({
      id: 'b',
      title: 'B',
      body: 'b',
      fireAt: '2026-09-10T12:00:00.000Z',
    });
    await notifications.cancelAll();
    expect(notifications.scheduled.size).toBe(0);
  });

  it('never claims background delivery support (memory adapter is test-only)', () => {
    expect(createInspectableMemoryNotifications().supportsBackgroundDelivery()).toBe(false);
  });
});

describe('createMemoryNetworkStatus', () => {
  it('reports the initial state and notifies subscribers on change', async () => {
    const network = createMemoryNetworkStatus(true);
    expect(await network.isOnline()).toBe(true);

    const seen: boolean[] = [];
    const unsubscribe = network.subscribe((online) => seen.push(online));

    network.setOnline(false);
    expect(await network.isOnline()).toBe(false);
    expect(seen).toEqual([false]);

    unsubscribe();
    network.setOnline(true);
    expect(seen).toEqual([false]);
  });
});

describe('createMemoryClock', () => {
  it('returns a fixed instant and its local calendar day when given one', () => {
    const clock = createMemoryClock('2026-09-10T00:00:00.000Z');
    expect(clock.now()).toBe('2026-09-10T00:00:00.000Z');
    expect(clock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('falls back to the real clock with no fixed instant', () => {
    const clock = createMemoryClock();
    expect(clock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(() => new Date(clock.now())).not.toThrow();
  });
});
