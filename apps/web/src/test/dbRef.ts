/**
 * The handle the component tests point `useDb()` at.
 *
 * `src/db/provider.tsx` opens a real OPFS-backed SQLite worker, which jsdom
 * cannot host. The tests mock that module and read the live repositories from
 * here instead, so the components still run against a real (in-memory) database
 * from `@vigor/db/testing` — DESIGN.md §10.
 */

import type { Settings } from '@vigor/core';
import type { Repositories } from '@vigor/db';

export interface TestDbContext {
  repos: Repositories;
  settings: Settings;
  refreshSettings: () => Promise<void>;
}

export const dbRef: { current: TestDbContext | null } = { current: null };

export function useDbFromRef(): TestDbContext {
  if (dbRef.current == null) {
    throw new Error('VigorEngine test harness: dbRef was read before renderWithDb() set it.');
  }
  return dbRef.current;
}
