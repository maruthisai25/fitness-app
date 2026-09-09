/**
 * Slots the phase-2 coach UI fills in.
 *
 * DESIGN.md §9 phases 1 and 3 ship an offline Today tab; phase 2 adds the
 * coach. Rather than rewrite this screen then, Today renders a slot here: the
 * coach agent calls `registerCoachPlanSlot(Component)` once at start-up and
 * its card appears above the offline "Plan today's workout" button. Until it
 * does, nothing renders and the offline path is the whole story.
 */
import type { ComponentType } from 'react';

import type { Id, LocalDate } from '@vigor/core';

export interface CoachPlanSlotProps {
  date: LocalDate;
  /** Call after the coach writes a planned workout so Today refreshes. */
  onPlanned: () => void;
}

let registered: ComponentType<CoachPlanSlotProps> | null = null;

/** Registers (or clears, with `null`) the coach's "ask for a workout" card. */
export function registerCoachPlanSlot(component: ComponentType<CoachPlanSlotProps> | null): void {
  registered = component;
}

export function CoachPlanSlot(props: CoachPlanSlotProps) {
  const Component = registered;
  return Component ? <Component {...props} /> : null;
}

/**
 * The coach's "make it shorter" / "I'm tired today" quick actions — DESIGN.md
 * §7.1 Today tab, phase 2 row of §9. Rendered once a workout already exists
 * for the day, next to the Start/See-plan buttons.
 */
export interface CoachQuickActionsSlotProps {
  workoutId: Id;
  date: LocalDate;
  /** Call after the coach adjusts today's plan so Today refreshes. */
  onAdjusted: () => void;
}

let registeredQuickActions: ComponentType<CoachQuickActionsSlotProps> | null = null;

export function registerCoachQuickActionsSlot(
  component: ComponentType<CoachQuickActionsSlotProps> | null,
): void {
  registeredQuickActions = component;
}

export function CoachQuickActionsSlot(props: CoachQuickActionsSlotProps) {
  const Component = registeredQuickActions;
  return Component ? <Component {...props} /> : null;
}
