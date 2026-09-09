/**
 * React providers for the component tests: the screens read the database and
 * the platform adapters through `AppDataProvider`, so the tests inject an
 * in-memory database and fake adapters through its `override` prop.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AiClient } from '@vigor/ai';
import type { Repositories } from '@vigor/db';
import type { PlatformAdapters } from '@vigor/platform';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDataProvider } from '../src/db/AppDataProvider';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

export function TestProviders({
  repos,
  platform,
  aiClient,
  children,
}: {
  repos: Repositories;
  platform: PlatformAdapters;
  /** Pins `useAiClient()` — omit for `hasApiKey: false`, pass a fake client to test the coach UI. */
  aiClient?: AiClient | null;
  children: ReactNode;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return (
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <AppDataProvider override={{ repos, platform, aiClient: aiClient ?? null }}>
          {children}
        </AppDataProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export * from './fixtures';
