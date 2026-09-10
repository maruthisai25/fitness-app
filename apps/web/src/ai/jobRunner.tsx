/**
 * The offline AI job queue, wired into the web shell — DESIGN.md §8.
 *
 * "The `ai_jobs` queue retries with backoff when the Network adapter reports
 * online; jobs are idempotent by `id`."
 *
 * `@vigor/ai` owns the queue itself: the handlers, the backoff, the failure
 * classes. This module only decides *when* a pass runs and what the cache does
 * afterwards. A pass is triggered on the three occasions the answer can have
 * changed:
 *
 *  - the tab comes to the foreground (mount, and every `visibilitychange`);
 *  - the Network adapter reports online again;
 *  - a new API key is saved, which releases the jobs a rejected key parked
 *    ({@link AiJobRunnerValue.retryCredentials}).
 *
 * When a pass finishes any work, the shared `runAiJobs` invalidation fires —
 * that is what turns an Eat log sitting on "estimating…" into its macros
 * without the user reloading anything.
 */

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  createAiJobRunner,
  summariseAiJobs,
  type AiJobQueueSummary,
  type AiJobRunner,
} from '@vigor/ai';
import { invalidationsFor, queryKeys } from '@vigor/core';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useCoach } from '../coach/CoachProvider';
import { useRepos } from '../data/hooks';
import { webNetworkStatus } from '../platform/network';

/** Enough to cover any realistic backlog without reading the whole table. */
const QUEUE_READ_LIMIT = 100;

/** The queue as a number per state — You → Settings renders this. */
export function useAiJobQueue(): UseQueryResult<AiJobQueueSummary> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.aiJobs(),
    queryFn: async () => summariseAiJobs(await repos.aiJobs.list({ limit: QUEUE_READ_LIMIT })),
  });
}

export interface AiJobRunnerValue {
  /** True while a pass is under way. */
  running: boolean;
  /** True when no pass can run at all: no API key, or no connection. */
  idle: boolean;
  /** Runs a pass now — the "Retry" button behind the pending-work row. */
  runNow: () => Promise<void>;
  /**
   * Releases every job parked on a rejected key, then runs a pass. The settings
   * screen calls this the moment a new key is saved, so a meal logged while the
   * old key was dead is estimated instead of sitting on "estimating…" for ever.
   */
  retryCredentials: () => Promise<void>;
}

const IDLE_VALUE: AiJobRunnerValue = {
  running: false,
  idle: true,
  runNow: async () => undefined,
  retryCredentials: async () => undefined,
};

const AiJobRunnerContext = createContext<AiJobRunnerValue>(IDLE_VALUE);

/**
 * The queue runner. Outside the provider this reports an idle one rather than
 * starting a second — exactly one runner exists, mounted at app level.
 */
export function useAiJobRunner(): AiJobRunnerValue {
  return useContext(AiJobRunnerContext);
}

/**
 * Mounted once, inside `CoachProvider` — the one place that already has both
 * the client and the connectivity answer.
 */
export function AiJobRunnerProvider({ children }: { children: ReactNode }): ReactNode {
  const queryClient = useQueryClient();
  const { client, deps, online } = useCoach();

  const [running, setRunning] = useState(false);
  // A pass is a read-modify-write over the whole queue, so two overlapping ones
  // would attempt the same job twice. The ref makes the guard immediate;
  // `running` is only what the UI paints.
  const inFlight = useRef(false);
  // Set when a new key has been saved but the client built from it has not
  // arrived yet, so the release happens on the first pass that can use it.
  const releaseWanted = useRef(false);

  const runner = useMemo<AiJobRunner | null>(
    () => (client == null ? null : createAiJobRunner({ deps, client })),
    [client, deps],
  );

  const invalidate = useCallback(
    async (keys: readonly (readonly unknown[])[]) => {
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
    [queryClient],
  );

  /** One pass, releasing any credential-parked jobs first. */
  const pass = useCallback(
    async () => {
      if (runner == null || inFlight.current) return;
      inFlight.current = true;
      setRunning(true);
      try {
        if (releaseWanted.current) {
          await runner.retryCredentialFailures();
          releaseWanted.current = false;
        }
        const result = await runner.runPending();
        // Only a completed job changed a row a screen is showing; a skipped or
        // failed pass still moved the queue, so the counts refresh either way.
        await invalidate(
          result.ran.some((outcome) => outcome.status === 'done')
            ? invalidationsFor('runAiJobs')
            : [queryKeys.aiJobs()],
        );
      } catch {
        // A queue that cannot run is not an error a screen should show: the
        // jobs stay in the table and the next foreground tries again.
        await invalidate([queryKeys.aiJobs()]);
      } finally {
        inFlight.current = false;
        setRunning(false);
      }
    },
    [invalidate, runner],
  );

  // Foreground: on mount, and whenever the tab becomes visible again.
  useEffect(() => {
    void pass();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void pass();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pass]);

  // Back online — DESIGN.md §8's own trigger. Only the offline → online edge
  // starts a pass; `runPending` skips itself while the adapter says offline.
  useEffect(() => {
    return webNetworkStatus.subscribe((isOnline) => {
      if (isOnline) void pass();
    });
  }, [pass]);

  /**
   * The key that was just saved is not in this runner yet — `useAiClient`
   * rebuilds the client asynchronously — so the parked jobs are only returned
   * to the queue here. Attempting them is left to the pass that runs once the
   * new client lands (the effect above re-fires when `runner` changes), which
   * is what stops a fresh save from burning an attempt on the dead key.
   */
  const retryCredentials = useCallback(async () => {
    releaseWanted.current = true;
    if (runner == null) return;
    try {
      await runner.retryCredentialFailures();
      releaseWanted.current = false;
    } catch {
      // Left set, so the next pass tries the release again.
    }
    await invalidate([queryKeys.aiJobs()]);
  }, [invalidate, runner]);

  const value = useMemo<AiJobRunnerValue>(
    () => ({
      running,
      idle: runner == null || !online,
      runNow: () => pass(),
      retryCredentials,
    }),
    [running, runner, online, pass, retryCredentials],
  );

  return <AiJobRunnerContext.Provider value={value}>{children}</AiJobRunnerContext.Provider>;
}

// Re-exported so a component test can supply a scripted runner state.
export { AiJobRunnerContext };
