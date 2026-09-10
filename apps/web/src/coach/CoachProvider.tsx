/**
 * Wires `@vigor/ai` into the app once — DESIGN.md §6, §9 phase 2/3.
 *
 * Everything below this provider reaches the coach through `useCoach()`
 * rather than importing `@vigor/ai` directly, so there is exactly one place
 * that builds `CoachDeps` and the `AiClient` (besides `client.ts` itself,
 * which is the only place that reads the key — DESIGN.md §11).
 */

import {
  createCoachDeps,
  systemCoachClock,
  toAiError,
  type AiClient,
  type CoachDeps,
} from '@vigor/ai';
import type { Id } from '@vigor/core';
import type { Repositories } from '@vigor/db';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { AiGatewayProvider } from '../ai/context';
import { AiJobRunnerProvider } from '../ai/jobRunner';
import { realGateway } from '../ai/realGateway';
import { useProfile, useRepos } from '../data/hooks';
import { useDb } from '../db/provider';
import { webClock } from '../platform/clock';
import { webNetworkStatus } from '../platform/network';
import { CoachDock } from './ChatDock';
import { SessionCoachSlot } from './SessionCoachSlot';
import { CoachSlotProvider } from './slots';
import { TodayInsightsSlot } from './TodayInsightsSlot';
import { TodayPlanSlot } from './TodayPlanSlot';
import { useAiClient } from './useAiClient';

export interface CoachContextValue {
  /** Null while there is no usable key — every screen falls back to offline. */
  client: AiClient | null;
  deps: CoachDeps;
  /** True once the initial key read has settled (avoids an offline flash on boot). */
  ready: boolean;
  hasKey: boolean;
  online: boolean;
  /** Forces `useAiClient` to re-read the SecureStore, e.g. right after saving a key. */
  reloadKey: () => void;
  /** The smallest request that proves the key and model both work (DESIGN.md §11). */
  testConnection: () => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Reuses the most recent open conversation, or starts one. */
  ensureConversation: () => Promise<Id>;
}

// Only reachable if something calls `useCoach()` outside `<CoachProvider>` and
// then tries to run a turn anyway — every real call site checks `client` (or
// the wrapping `ready`/`hasKey`) first, so `repos` here is never dereferenced.
const noopDeps: CoachDeps = createCoachDeps({
  repos: {} as Repositories,
  clock: systemCoachClock(),
});

const CoachContext = createContext<CoachContextValue>({
  client: null,
  deps: noopDeps,
  ready: true,
  hasKey: false,
  online: true,
  reloadKey: () => undefined,
  testConnection: async () => ({ ok: false, message: 'The coach is not available here.' }),
  ensureConversation: async () => {
    throw new Error('CoachProvider not mounted');
  },
});

/** Reachable outside `<CoachProvider>` too (e.g. existing component tests) — coach reads as offline. */
export function useCoach(): CoachContextValue {
  return useContext(CoachContext);
}

export function CoachProvider({ children }: { children: ReactNode }): ReactNode {
  const repos = useRepos();
  const { settings } = useDb();
  const [reloadToken, setReloadToken] = useState(0);
  const { client, ready, hasKey } = useAiClient(settings, reloadToken);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void webNetworkStatus.isOnline().then((value) => {
      if (!cancelled) setOnline(value);
    });
    const unsubscribe = webNetworkStatus.subscribe((value) => setOnline(value));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const deps = useMemo<CoachDeps>(
    () =>
      createCoachDeps({
        repos,
        clock: systemCoachClock(),
        platform: { network: webNetworkStatus },
      }),
    [repos],
  );

  // The Eat tab's prompt tasks (DESIGN.md §6.4) run on the same client and the
  // same connectivity the coach does, so the gateway is built here — one place
  // that knows whether there is a key and whether the browser is online.
  const region = useProfile().data?.foodRegion ?? 'generic';
  const gateway = useMemo(
    () => realGateway(client, { region, online, today: () => webClock.today() }),
    [client, region, online],
  );

  const value = useMemo<CoachContextValue>(
    () => ({
      client,
      deps,
      ready,
      hasKey,
      online,
      reloadKey: () => setReloadToken((token) => token + 1),
      testConnection: async () => {
        if (client == null) {
          return { ok: false, message: 'Save an API key in You → Settings first.' };
        }
        try {
          await client.messages.countTokens({
            model: client.settings.fastModel,
            messages: [{ role: 'user', content: 'ping' }],
          });
          return { ok: true };
        } catch (error) {
          return { ok: false, message: toAiError(error).userMessage };
        }
      },
      ensureConversation: async () => {
        const latest = await repos.conversations.latest();
        if (latest) return latest.id;
        const created = await repos.conversations.create();
        return created.id;
      },
    }),
    [client, deps, ready, hasKey, online, repos],
  );

  return (
    <CoachContext.Provider value={value}>
      <AiGatewayProvider gateway={gateway}>
        {/* Inside the coach context because the queue needs the same client and
            the same connectivity answer the coach uses (DESIGN.md §8). */}
        <AiJobRunnerProvider>
          <CoachSlotProvider
            renderers={{
              todayPlan: () => <TodayPlanSlot />,
              todayInsights: () => <TodayInsightsSlot />,
              sessionCoach: () => <SessionCoachSlot />,
            }}
          >
            {/*
             * A real flex row, not just adjacent DOM nodes — DESIGN.md §7.1's
             * right rail needs to reserve its own width next to whichever route
             * is showing (`AppShell` or full-screen session mode), and the brief
             * requires the page body never to scroll horizontally, which
             * `minWidth: 0` on the content side guarantees even under a very
             * wide table or chart.
             */}
            <div style={{ display: 'flex', minHeight: '100vh' }}>
              <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
              <CoachDock />
            </div>
          </CoachSlotProvider>
        </AiJobRunnerProvider>
      </AiGatewayProvider>
    </CoachContext.Provider>
  );
}

// Re-exported so a component test can drop a scripted value in without going
// through the real SecureStore/network — see `apps/web/src/coach/*.test.tsx`.
export { CoachContext };
