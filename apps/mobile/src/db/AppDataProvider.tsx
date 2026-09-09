import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { createRepositories, migrate } from '@vigor/db';
import type { ClosableSqlDriver, Repositories } from '@vigor/db';

import { getPlatformAdapters } from '../platform';
import { createExpoSqlDriver } from './sqliteDriver';

/** The repository surface every screen reads through — DESIGN.md §4.2. */
export type AppRepos = Repositories;

type AppDataState =
  | { status: 'loading' }
  | { status: 'ready'; driver: ClosableSqlDriver; repos: AppRepos }
  | { status: 'error'; error: Error };

const AppDataContext = createContext<AppDataState>({ status: 'loading' });

/**
 * Opens the on-device SQLite database, runs migrations, and builds the
 * repositories every screen reads through — DESIGN.md §4: "Migrations ...
 * applied by a `migrate(driver)` function on app start".
 */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppDataState>({ status: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const driver = await createExpoSqlDriver();
        await migrate(driver);
        const repos = createRepositories(driver);
        if (!cancelled) {
          setState({ status: 'ready', driver, repos });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <AppDataContext.Provider value={state}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataState {
  return useContext(AppDataContext);
}

/** Throws while loading/erroring — use inside a tree gated by `status === 'ready'`. */
export function useRepos(): AppRepos {
  const state = useAppData();
  if (state.status !== 'ready') {
    throw new Error('useRepos() called before the database finished loading');
  }
  return state.repos;
}

/** Stable platform adapters — never rebuilt, so this is safe to call anywhere. */
export function usePlatform() {
  return useMemo(() => getPlatformAdapters(), []);
}
