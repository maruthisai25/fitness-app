import type { Repositories } from '@vigor/db';
import { createRepositories, migrate } from '@vigor/db';
import type { Settings } from '@vigor/core';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

import { createWasmSqlDriver } from './workerDriver';

interface DbContextValue {
  repos: Repositories;
  settings: Settings;
  /** Re-reads `settings` from storage, e.g. after `repos.settings.setMany`. */
  refreshSettings: () => Promise<void>;
}

const DbContext = createContext<DbContextValue | null>(null);

type BootState =
  | { status: 'loading' }
  | { status: 'ready'; value: DbContextValue }
  | { status: 'error'; message: string };

/**
 * Opens the SQLite worker, runs migrations, and loads `settings` once on
 * boot (DESIGN.md §4: "migrations ... applied by a `migrate(driver)`
 * function on app start"). Nothing below this renders until that finishes.
 */
export function DbProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<BootState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const driver = await createWasmSqlDriver();
        await migrate(driver);
        const repos = createRepositories(driver);
        const settings = await repos.settings.getAll();
        if (cancelled) return;
        const refreshSettings = async () => {
          const next = await repos.settings.getAll();
          setState((prev) =>
            prev.status === 'ready'
              ? { status: 'ready', value: { ...prev.value, settings: next } }
              : prev,
          );
        };
        setState({ status: 'ready', value: { repos, settings, refreshSettings } });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return <BootScreen message="Opening your local database…" />;
  }
  if (state.status === 'error') {
    return <BootScreen message={`VigorEngine could not start: ${state.message}`} isError />;
  }
  return <DbContext.Provider value={state.value}>{children}</DbContext.Provider>;
}

function BootScreen({
  message,
  isError = false,
}: {
  message: string;
  isError?: boolean;
}): ReactNode {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        color: isError ? 'var(--vg-color-bad)' : 'var(--vg-color-text-muted)',
        background: 'var(--vg-color-bg)',
      }}
    >
      <p style={{ maxWidth: 420, margin: 0 }}>{message}</p>
    </div>
  );
}

/** Every screen below `DbProvider` reaches the repositories and settings through this. */
export function useDb(): DbContextValue {
  const value = useContext(DbContext);
  if (!value) {
    throw new Error('VigorEngine: useDb() called outside <DbProvider>');
  }
  return value;
}
