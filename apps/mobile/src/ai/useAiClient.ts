/**
 * Resolves the Anthropic client for this device — DESIGN.md §6.1, §11.
 *
 * "No feature reads the API key outside `packages/ai/client.ts` and the settings
 * screen." This hook honours that literally: it never `get`s the key itself. It
 * hands the SecureStore adapter to `createClientFromSecureStore`, which reads
 * the entry inside `packages/ai` and returns a built client — so the key is
 * never a value in app code and never lands in the TanStack Query cache, where
 * devtools, a diagnostic dump or a persisted cache could reach it.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientFromSecureStore, type AiClient, type ModelSettings } from '@vigor/ai';

import { useAiClientOverride, usePlatform } from '../db/AppDataProvider';
import { useSettingsQuery } from '../data/queries';
import { useAiPreferences } from './preferences';

/** Local-only cache key: not one of `@vigor/core/queries`' shared roots because
 * nothing outside this app needs to invalidate it — it is invalidated after a
 * settings-screen write to the key, in that screen. The cached value is the
 * built client; the key itself never enters the cache. */
export const AI_API_KEY_QUERY_KEY = ['mobile', 'aiClient'] as const;

export interface AiClientState {
  client: AiClient | null;
  /** True once a non-empty key is stored, even while the client itself is still building. */
  hasApiKey: boolean;
  loading: boolean;
}

const LOADING_STATE: AiClientState = { client: null, hasApiKey: false, loading: true };

export function useAiClient(): AiClientState {
  const override = useAiClientOverride();
  const { secureStore } = usePlatform();
  const settingsQuery = useSettingsQuery();
  const preferencesQuery = useAiPreferences();

  const coachModel = settingsQuery.data?.coachModel;
  const fastModel = settingsQuery.data?.fastModel;
  const serverSideFallback = preferencesQuery.data?.serverSideFallback ?? true;

  const models = useMemo<Partial<ModelSettings> | null>(
    () =>
      coachModel == null || fastModel == null
        ? null
        : { coachModel, fastModel, serverSideFallback },
    [coachModel, fastModel, serverSideFallback],
  );

  const clientQuery = useQuery({
    // The models are part of the key so changing one in settings rebuilds the
    // client instead of serving the previous one from cache.
    queryKey: [...AI_API_KEY_QUERY_KEY, models],
    queryFn: () =>
      createClientFromSecureStore(secureStore, {
        // DESIGN.md §6.1 — mobile omits `dangerouslyAllowBrowser`; only the web
        // shell passes it.
        ...(models == null ? {} : { models }),
      }),
    enabled: override === undefined && models != null,
  });

  return useMemo<AiClientState>(() => {
    if (override !== undefined) {
      return { client: override, hasApiKey: override != null, loading: false };
    }
    if (models == null || clientQuery.isPending) return LOADING_STATE;
    const client = clientQuery.data ?? null;
    return { client, hasApiKey: client != null, loading: false };
  }, [override, clientQuery.data, clientQuery.isPending, models]);
}
