/**
 * Service-worker registration for the web shell.
 *
 * `vite.config.ts` sets `registerType: 'prompt'`, so a new build waits in the
 * `installed` state instead of taking over mid-session. That matters here:
 * session mode flushes every set to SQLite as it is confirmed (DESIGN.md §7.2),
 * and an unannounced reload in the middle of a working set would be hostile.
 * The user is asked, and only then does the new worker activate and the page
 * reload.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface ServiceWorkerUpdate {
  /** A newer build is installed and waiting for permission to take over. */
  updateReady: boolean;
  /** True while the new worker activates and the page reloads. */
  updating: boolean;
  /** Activates the waiting worker; the page reloads when it takes control. */
  applyUpdate(): void;
  /** Keeps the current build for this session. */
  dismiss(): void;
}

export function useServiceWorkerUpdate(): ServiceWorkerUpdate {
  const [updateReady, setUpdateReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  // `registerSW` returns the "update the service worker" callback. It is only
  // available after registration, so it is held in a ref rather than state.
  const updateServiceWorker = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    // Guarded because `import.meta.env.DEV` builds and non-secure origins have
    // no service worker at all; the plugin's shim then no-ops.
    updateServiceWorker.current = registerSW({
      onNeedRefresh() {
        setUpdateReady(true);
      },
      onRegisterError(error: unknown) {
        // Never fatal: the app is fully usable without a service worker, it
        // simply loses the offline shell.
        console.warn('VigorEngine: service worker registration failed', error);
      },
    });
  }, []);

  const applyUpdate = useCallback((): void => {
    setUpdating(true);
    const update = updateServiceWorker.current;
    if (!update) {
      globalThis.location.reload();
      return;
    }
    // `reloadPage` is ignored by vite-plugin-pwa >= 0.13.2 — the plugin's own
    // `controllerchange` handler reloads once the new worker takes control.
    void update(true).catch(() => {
      setUpdating(false);
      setUpdateReady(false);
    });
  }, []);

  const dismiss = useCallback((): void => {
    setUpdateReady(false);
  }, []);

  return { updateReady, updating, applyUpdate, dismiss };
}
