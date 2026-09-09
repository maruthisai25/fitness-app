/**
 * `NetworkStatus` adapter over `expo-network` — drives the `ai_jobs` retry
 * queue (DESIGN.md §8).
 *
 * `expo-network` reports the OS's own connectivity state, so there is no
 * polling and no outbound request: the app's only outbound host stays
 * `api.anthropic.com` (DESIGN.md §8). `isInternetReachable` is the stricter
 * signal — a device on a captive-portal Wi-Fi is "connected" but not
 * reachable — and it is `null` while the OS has not decided yet, in which case
 * `isConnected` is the best answer available.
 */
import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import type { NetworkState } from 'expo-network';

import type { NetworkStatus } from '@vigor/platform';

function isOnlineFrom(state: NetworkState): boolean {
  if (state.isInternetReachable != null) return state.isInternetReachable;
  return state.isConnected ?? false;
}

export function createNetworkStatus(): NetworkStatus {
  return {
    async isOnline() {
      try {
        return isOnlineFrom(await getNetworkStateAsync());
      } catch {
        // A connectivity read must never take the app down; assume offline and
        // let the job queue retry (DESIGN.md §8).
        return false;
      }
    },

    subscribe(listener) {
      let cancelled = false;
      let lastKnown: boolean | null = null;

      const emit = (online: boolean) => {
        if (cancelled || online === lastKnown) return;
        lastKnown = online;
        listener(online);
      };

      // The listener only fires on change, so seed it with the current state.
      void getNetworkStateAsync()
        .then((state) => emit(isOnlineFrom(state)))
        .catch(() => emit(false));

      const subscription = addNetworkStateListener((state) => emit(isOnlineFrom(state)));

      return () => {
        cancelled = true;
        subscription.remove();
      };
    },
  };
}
