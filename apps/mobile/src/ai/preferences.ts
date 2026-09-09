/**
 * Local-only AI preferences — DESIGN.md §6.1.
 *
 * `ModelSettings.serverSideFallback` is not one of the fixed `settings` table
 * keys `@vigor/db` accepts (DESIGN.md §4.1 lists them), so this app-local
 * toggle lives in the platform `SecureStore` next to the API key itself,
 * keyed separately. It only ever affects the request this device sends —
 * nothing here is exported or shared.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePlatform } from '../db/AppDataProvider';

const AI_PREFERENCES_STORE_KEY = 'vigor-ai-preferences';

export const AI_PREFERENCES_QUERY_KEY = ['mobile', 'aiPreferences'] as const;

export interface AiPreferences {
  /** DESIGN.md §6.1 — on by default; the settings screen lets the user turn it off. */
  serverSideFallback: boolean;
}

export const DEFAULT_AI_PREFERENCES: AiPreferences = { serverSideFallback: true };

function decode(raw: string | null): AiPreferences {
  if (raw == null) return DEFAULT_AI_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Partial<AiPreferences>;
    return { ...DEFAULT_AI_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_AI_PREFERENCES;
  }
}

export function useAiPreferences() {
  const { secureStore } = usePlatform();
  return useQuery({
    queryKey: AI_PREFERENCES_QUERY_KEY,
    queryFn: async () => decode(await secureStore.get(AI_PREFERENCES_STORE_KEY)),
  });
}

export function useSetAiPreferences() {
  const { secureStore } = usePlatform();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AiPreferences>) => {
      const current = decode(await secureStore.get(AI_PREFERENCES_STORE_KEY));
      const next: AiPreferences = { ...current, ...patch };
      await secureStore.set(AI_PREFERENCES_STORE_KEY, JSON.stringify(next));
      return next;
    },
    onSuccess: (next) => queryClient.setQueryData(AI_PREFERENCES_QUERY_KEY, next),
  });
}
