/**
 * Test helper: renders a component inside the same TanStack Query provider the
 * app uses, with retries off so a failing query surfaces immediately.
 *
 * Repositories are passed to the components under test as props, so the tests
 * can hand them a real migrated in-memory database from `@vigor/db/testing`
 * without touching the app's database provider.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export async function renderWithProviders(ui: ReactElement): Promise<{ client: QueryClient }> {
  const client = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  await render(ui, { wrapper: Wrapper });
  return { client };
}
