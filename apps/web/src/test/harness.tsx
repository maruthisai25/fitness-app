/**
 * Component-test harness — DESIGN.md §10: "component tests for session mode and
 * food log", run against the in-memory `better-sqlite3` driver.
 *
 * Nothing about the components under test is stubbed. Only two things are
 * replaced: the SQLite worker (a real in-memory database stands in) and the AI
 * gateway (a fake whose behaviour each test states outright).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Settings } from '@vigor/core';
import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';

import { AiGatewayProvider } from '../ai/context';
import { unavailableGateway, type AiGateway } from '../ai/gateway';
import { dbRef } from './dbRef';

export interface Harness {
  db: TestDatabase;
  settings: Settings;
  close(): Promise<void>;
}

/** Opens a migrated in-memory database and points the mocked `useDb` at it. */
export async function createHarness(overrides: Partial<Settings> = {}): Promise<Harness> {
  const db = await createTestDatabase();
  const settings = { ...(await db.repos.settings.getAll()), ...overrides };
  dbRef.current = {
    repos: db.repos,
    settings,
    refreshSettings: async () => {
      dbRef.current = {
        ...(dbRef.current ?? { repos: db.repos, settings, refreshSettings: async () => {} }),
        settings: await db.repos.settings.getAll(),
      };
    },
  };
  return {
    db,
    settings,
    close: async () => {
      dbRef.current = null;
      await db.close();
    },
  };
}

export function renderWithProviders(
  ui: ReactNode,
  options: { gateway?: AiGateway; route?: string } = {},
): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AiGatewayProvider gateway={options.gateway ?? unavailableGateway}>
        <MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>
      </AiGatewayProvider>
    </QueryClientProvider>,
  );
}
