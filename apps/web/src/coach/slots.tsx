/**
 * Extension points the coach UI fills in later — DESIGN.md §9 phase 2, and the
 * Today brief's "a slot the coach UI will later replace".
 *
 * The Train/Today screens render `<CoachSlot name="…" />` wherever coach
 * content belongs. Until the coach agent wraps the app in a
 * `CoachSlotProvider`, the slot renders its offline fallback, so every screen
 * works with no network and no model (DESIGN.md §2.4).
 */

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

/** Named places the coach can take over. */
export type CoachSlotName =
  /** Today's plan card — "ask the coach for a workout" replaces the rule-based draft. */
  | 'todayPlan'
  /** Under the Today insight list — the coach's phrasing of the week. */
  | 'todayInsights'
  /** Inside session mode, above the current exercise. */
  | 'sessionCoach';

export type CoachSlotRenderers = Partial<Record<CoachSlotName, () => ReactNode>>;

const CoachSlotContext = createContext<CoachSlotRenderers>({});

/** The coach UI wraps the app once and registers whatever it can render. */
export function CoachSlotProvider({
  renderers,
  children,
}: {
  renderers: CoachSlotRenderers;
  children: ReactNode;
}): ReactNode {
  return <CoachSlotContext.Provider value={renderers}>{children}</CoachSlotContext.Provider>;
}

export function useCoachSlot(name: CoachSlotName): (() => ReactNode) | undefined {
  return useContext(CoachSlotContext)[name];
}

/** Renders the coach's content for `name`, or `fallback` while it is offline. */
export function CoachSlot({
  name,
  fallback = null,
}: {
  name: CoachSlotName;
  fallback?: ReactNode;
}): ReactNode {
  const render = useCoachSlot(name);
  return render ? render() : fallback;
}
