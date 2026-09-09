/**
 * Resolves the `AiClient` — DESIGN.md §6.1, §11.
 *
 * "No feature reads the API key outside `packages/ai/client.ts` and the settings
 * screen." The coach rail wraps every screen, so this hook must not be a second
 * reader: it hands the SecureStore adapter to `createClientFromSecureStore`,
 * which does the `get` inside `packages/ai` and returns a built client. The key
 * never exists as a value in app code.
 */

import { API_KEY_STORE_KEY, createClientFromSecureStore, type AiClient } from '@vigor/ai';
import type { Settings } from '@vigor/core';
import { useEffect, useState } from 'react';

import { webSecureStore } from '../platform/secureStore';
import { getServerSideFallbackPref } from './fallbackPref';

export interface AiClientState {
  /** Null until a key is loaded — render the offline/no-key state until then. */
  client: AiClient | null;
  /** True once the initial SecureStore read has settled. */
  ready: boolean;
  /** True as soon as *some* key is stored, even before it is confirmed to work. */
  hasKey: boolean;
}

/**
 * Rebuilds the client whenever the settings' model choice changes or the key
 * is added/removed/rotated. `reloadToken` lets a caller (Settings, after
 * saving a new key) force a re-read of the SecureStore without waiting for a
 * `settings` change.
 */
export function useAiClient(settings: Settings, reloadToken = 0): AiClientState {
  const [state, setState] = useState<AiClientState>({ client: null, ready: false, hasKey: false });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const client = await createClientFromSecureStore(webSecureStore, {
        keyRef: settings.apiKeyRef ?? API_KEY_STORE_KEY,
        // DESIGN.md §6.1 — the web app has no server by design.
        dangerouslyAllowBrowser: true,
        models: {
          coachModel: settings.coachModel,
          fastModel: settings.fastModel,
          serverSideFallback: getServerSideFallbackPref(),
        },
      }).catch(() => null);
      if (cancelled) return;
      setState({ client, ready: true, hasKey: client != null });
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.apiKeyRef, settings.coachModel, settings.fastModel, reloadToken]);

  return state;
}
