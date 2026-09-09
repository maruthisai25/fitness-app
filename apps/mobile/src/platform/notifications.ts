/**
 * `Notifications` adapter over `expo-notifications` (DESIGN.md §7.3).
 *
 * Scheduling is idempotent by `id`: re-scheduling cancels any existing
 * request with that identifier first, matching the `ScheduledNotification`
 * contract in `@vigor/platform`. Local only — there is no server (DESIGN.md
 * §1) — so this fires the rest timer and the reminders from
 * `packages/core/reminders` (DESIGN.md §7.3) with the screen off.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Notifications as NotificationsAdapter, ScheduledNotification } from '@vigor/platform';

export function createNotifications(): NotificationsAdapter {
  return {
    async requestPermission() {
      const result = await Notifications.requestPermissionsAsync();
      return result.granted;
    },

    async hasPermission() {
      const result = await Notifications.getPermissionsAsync();
      return result.granted;
    },

    async schedule(notification: ScheduledNotification) {
      await Notifications.cancelScheduledNotificationAsync(notification.id).catch(() => undefined);
      await Notifications.scheduleNotificationAsync({
        identifier: notification.id,
        content: { title: notification.title, body: notification.body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(notification.fireAt),
        },
      });
    },

    async cancel(id) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
    },

    async cancelAll() {
      await Notifications.cancelAllScheduledNotificationsAsync();
    },

    supportsBackgroundDelivery() {
      return Platform.OS === 'ios' || Platform.OS === 'android';
    },
  };
}
