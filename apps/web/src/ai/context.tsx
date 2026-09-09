/**
 * Where the real AI gateway gets injected.
 *
 * The app renders with {@link unavailableGateway} unless something above it
 * supplies one, so every Eat screen already runs — and is tested — in its
 * degraded, manual-entry state. When `packages/ai` lands, the orchestrator
 * wraps the app (or any subtree) in `<AiGatewayProvider gateway={realGateway}>`
 * and nothing else changes.
 */

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

import { unavailableGateway, type AiGateway } from './gateway';

const AiGatewayContext = createContext<AiGateway>(unavailableGateway);

export function AiGatewayProvider({
  gateway,
  children,
}: {
  gateway: AiGateway;
  children: ReactNode;
}): ReactNode {
  return <AiGatewayContext.Provider value={gateway}>{children}</AiGatewayContext.Provider>;
}

/** The gateway in force for this subtree. Never null; falls back to unavailable. */
export function useAiGateway(): AiGateway {
  return useContext(AiGatewayContext);
}
