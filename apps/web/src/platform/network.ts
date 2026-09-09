import type { NetworkStatus } from '@vigor/platform';

/** Web `NetworkStatus` — DESIGN.md §8, backed by `navigator.onLine`. */
export const webNetworkStatus: NetworkStatus = {
  async isOnline(): Promise<boolean> {
    return navigator.onLine;
  },

  subscribe(listener: (online: boolean) => void): () => void {
    const onOnline = () => listener(true);
    const onOffline = () => listener(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  },
};
