/**
 * Live connectivity, from the `NetworkStatus` platform adapter — DESIGN.md §8.
 *
 * The coach needs a connection; everything else in the app does not. Screens
 * that offer a coach action read this to show the offline explanation instead
 * of a request that would just fail.
 */
import { useEffect, useState } from 'react';

import { usePlatform } from '../db/AppDataProvider';

export function useOnlineStatus(): boolean {
  const { network } = usePlatform();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let mounted = true;
    void network.isOnline().then((value) => {
      if (mounted) setOnline(value);
    });
    const unsubscribe = network.subscribe((value) => {
      if (mounted) setOnline(value);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [network]);

  return online;
}
