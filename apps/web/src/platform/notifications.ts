import type { Notifications, ScheduledNotification } from '@vigor/platform';

/**
 * Web `Notifications` — DESIGN.md §7.4. There is no background scheduler in
 * a browser tab, so this only fires while the tab is open (`setTimeout`
 * against `fireAt`); the settings screen must say so.
 */

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function clear(id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

export const webNotifications: Notifications = {
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  async hasPermission(): Promise<boolean> {
    return 'Notification' in window && Notification.permission === 'granted';
  },

  async schedule(notification: ScheduledNotification): Promise<void> {
    clear(notification.id);
    const delayMs = new Date(notification.fireAt).getTime() - Date.now();
    const fire = () => {
      timers.delete(notification.id);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, { body: notification.body, tag: notification.id });
      }
    };
    if (delayMs <= 0) {
      fire();
      return;
    }
    timers.set(notification.id, setTimeout(fire, delayMs));
  },

  async cancel(id: string): Promise<void> {
    clear(id);
  },

  async cancelAll(): Promise<void> {
    for (const id of Array.from(timers.keys())) {
      clear(id);
    }
  },

  supportsBackgroundDelivery(): boolean {
    // Fires only while this tab is open (DESIGN.md §7.4) — never with the
    // screen off, unlike expo-notifications on mobile (DESIGN.md §7.3).
    return false;
  },
};
