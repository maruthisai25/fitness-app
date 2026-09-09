/**
 * Expo implementations of the `@vigor/platform` adapter interfaces
 * (DESIGN.md §7.1 brief: "Implement the platform adapters for Expo").
 */
import type { PlatformAdapters } from '@vigor/platform';

import { createClock } from './clock';
import { createCrypto } from './exportCrypto';
import { createFileStore } from './fileStore';
import { createNetworkStatus } from './network';
import { createNotifications } from './notifications';
import { createSecureStore } from './secureStore';

let adapters: PlatformAdapters | undefined;

/** Lazily built, then reused for the life of the app — these adapters are stateless. */
export function getPlatformAdapters(): PlatformAdapters {
  if (!adapters) {
    adapters = {
      secureStore: createSecureStore(),
      fileStore: createFileStore(),
      notifications: createNotifications(),
      network: createNetworkStatus(),
      clock: createClock(),
      crypto: createCrypto(),
    };
  }
  return adapters;
}
