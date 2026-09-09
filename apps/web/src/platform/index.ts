import type { PlatformAdapters } from '@vigor/platform';

import { webClock } from './clock';
import { webCrypto } from './crypto';
import { webFileStore } from './fileStore';
import { webNetworkStatus } from './network';
import { webNotifications } from './notifications';
import { webSecureStore } from './secureStore';

/** The concrete web implementation of every `@vigor/platform` adapter (DESIGN.md §7.4). */
export const webPlatformAdapters: PlatformAdapters = {
  secureStore: webSecureStore,
  fileStore: webFileStore,
  notifications: webNotifications,
  network: webNetworkStatus,
  clock: webClock,
  crypto: webCrypto,
};

export { webClock } from './clock';
export { webCrypto } from './crypto';
export { webFileStore } from './fileStore';
export { webNetworkStatus } from './network';
export { webNotifications } from './notifications';
export { webSecureStore } from './secureStore';
