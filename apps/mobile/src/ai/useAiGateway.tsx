/**
 * React access to the AI gateway.
 *
 * By default the hook follows the module-level registry that
 * `installAiGateway` writes to, so no provider is required and the orchestrator
 * can wire `packages/ai` in from a single call site. `AiGatewayProvider`
 * overrides it for a subtree, which is what the component tests use.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { useProfileQuery } from '../data/queries';
import { usePlatform } from '../db/AppDataProvider';
import { getAiGateway, installAiGateway, subscribeToAiGateway, type AiGateway } from './gateway';
import { realGateway } from './realGateway';
import { useAiClient } from './useAiClient';
import { useOnlineStatus } from './useOnlineStatus';

const AiGatewayContext = createContext<AiGateway | null>(null);

export function AiGatewayProvider({
  gateway,
  children,
}: {
  gateway: AiGateway;
  children: ReactNode;
}) {
  return <AiGatewayContext.Provider value={gateway}>{children}</AiGatewayContext.Provider>;
}

export function useAiGateway(): AiGateway {
  const override = useContext(AiGatewayContext);
  const [registered, setRegistered] = useState<AiGateway>(() => getAiGateway());

  useEffect(() => subscribeToAiGateway(setRegistered), []);

  return override ?? registered;
}

/**
 * Keeps the registry pointed at the right gateway. Mounted once, above the
 * routes, so every Eat screen sees the coach appear the moment a key is saved
 * and fall back to manual entry the moment the device goes offline.
 */
export function AiGatewayInstaller({ children }: { children?: ReactNode }) {
  const { client } = useAiClient();
  const online = useOnlineStatus();
  const { clock } = usePlatform();
  const profile = useProfileQuery();
  const region = profile.data?.foodRegion ?? 'generic';

  useEffect(() => {
    installAiGateway(realGateway(client, { region, online, today: clock.today() }));
  }, [client, online, region, clock]);

  return <>{children ?? null}</>;
}
