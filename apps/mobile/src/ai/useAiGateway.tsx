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

import { getAiGateway, subscribeToAiGateway, type AiGateway } from './gateway';

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
