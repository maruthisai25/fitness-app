/**
 * `navigator.onLine` plus the `online`/`offline` events.
 *
 * DESIGN.md §2.4 makes offline the default state, so this is deliberately not
 * a connectivity *test* — it never reaches the network. It reports what the
 * browser believes, which is enough to tell the user why AI answers are being
 * queued (DESIGN.md §8) while every local feature keeps working.
 *
 * `packages/platform`'s `NetworkStatus` adapter is the equivalent for shared
 * code; this hook is the React binding the shell's chrome uses.
 */
import { useEffect, useState } from 'react';

function readOnline(): boolean {
  // `onLine` is missing in non-browser hosts (SSR, tests); assume online there
  // so nothing renders a false alarm.
  const online = globalThis.navigator?.onLine;
  return online === undefined ? true : online;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(readOnline);

  useEffect(() => {
    const goOnline = (): void => setOnline(true);
    const goOffline = (): void => setOnline(false);

    // Re-read on mount: the status can have flipped between the initial render
    // and this effect.
    setOnline(readOnline());
    globalThis.addEventListener('online', goOnline);
    globalThis.addEventListener('offline', goOffline);
    return () => {
      globalThis.removeEventListener('online', goOnline);
      globalThis.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
