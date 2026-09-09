import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { createRepositories, migrate } from '@vigor/db';
import type { ClosableSqlDriver, Repositories } from '@vigor/db';
import type { PlatformAdapters } from '@vigor/platform';
import type { AiClient } from '@vigor/ai';

import { getPlatformAdapters } from '../platform';
import { seedExerciseLibrary } from './seed';
import { createExpoSqlDriver } from './sqliteDriver';

/** The repository surface every screen reads through — DESIGN.md §4.2. */
export type AppRepos = Repositories;

type AppDataState =
  | { status: 'loading' }
  | { status: 'ready'; driver: ClosableSqlDriver | null; repos: AppRepos }
  | { status: 'error'; error: Error };

const AppDataContext = createContext<AppDataState>({ status: 'loading' });
const PlatformContext = createContext<PlatformAdapters | null>(null);
/**
 * `undefined` means "no override — `useAiClient()` builds a real client from
 * the SecureStore key and the settings row"; `null` or an `AiClient` means a
 * test has pinned the answer (a fake client, or explicitly "no key").
 */
const AiClientOverrideContext = createContext<AiClient | null | undefined>(undefined);

/** Injected by tests so a screen can run against an in-memory database. */
export interface AppDataOverride {
  repos: AppRepos;
  platform?: PlatformAdapters;
  /** Pins `useAiClient()`'s answer — see `@vigor/ai/testing`'s `createFakeAiClient`. */
  aiClient?: AiClient | null;
}

/**
 * Opens the on-device SQLite database, runs migrations, seeds the exercise
 * library on first run, and builds the repositories every screen reads through
 * — DESIGN.md §4: "Migrations ... applied by a `migrate(driver)` function on
 * app start".
 */
export function AppDataProvider({
  children,
  override,
}: {
  children: ReactNode;
  override?: AppDataOverride;
}) {
  const [state, setState] = useState<AppDataState>(
    override ? { status: 'ready', driver: null, repos: override.repos } : { status: 'loading' },
  );
  const started = useRef(false);

  useEffect(() => {
    if (override || started.current) return;
    started.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const driver = await createExpoSqlDriver();
        await migrate(driver);
        const repos = createRepositories(driver);
        // DESIGN.md §9 phase 0 — the library has to exist before the planner,
        // the substitution engine or the Train tab can name an exercise.
        await seedExerciseLibrary(repos);
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
  }, [override]);

  return (
    <PlatformContext.Provider value={override?.platform ?? null}>
      <AiClientOverrideContext.Provider value={override?.aiClient}>
        <AppDataContext.Provider value={state}>{children}</AppDataContext.Provider>
      </AiClientOverrideContext.Provider>
    </PlatformContext.Provider>
  );
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
export function usePlatform(): PlatformAdapters {
  const injected = useContext(PlatformContext);
  return useMemo(() => injected ?? getPlatformAdapters(), [injected]);
}

/**
 * `undefined` when nothing overrode it (the normal app), `null` or an
 * `AiClient` when a test pinned the answer via `AppDataProvider`'s `override`.
 * Read by `useAiClient()` only.
 */
export function useAiClientOverride(): AiClient | null | undefined {
  return useContext(AiClientOverrideContext);
}
