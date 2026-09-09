/**
 * The `todayPlan` coach slot — DESIGN.md §9 phase 2: "Ask the coach for
 * today's workout" replaces the rule-based-only planner while it is online
 * and keyed; `PlanCard` keeps the rule-based button as the fallback either
 * way (DESIGN.md §2.4 "offline is the default state").
 */

import type { Id } from '@vigor/core';
import type { ReactNode } from 'react';

import { InlineCoachAsk } from './InlineCoachAsk';

export function TodayPlanSlot(): ReactNode {
  return (
    <InlineCoachAsk
      label="Ask the coach for today’s workout"
      busyLabel="Asking the coach for today’s workout…"
      prompt="Please plan today's workout for me with propose_workout, using my recent training, equipment and readiness."
    />
  );
}

/**
 * "Make it shorter" / "I'm tired today" — DESIGN.md §9 phase 3: quick actions
 * that call `adjust_workout` through the coach. Rendered by `PlanCard` next to
 * the session actions once a workout exists for today.
 */
export function TodayQuickActions({ workoutId }: { workoutId: Id }): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <InlineCoachAsk
        label="Make it shorter"
        prompt={`Please shorten today's workout (workoutId: ${workoutId}) with adjust_workout — I have less time than planned. Trim it to fit, do not add anything.`}
      />
      <InlineCoachAsk
        label="I’m tired today"
        prompt={`I'm tired today. Please lighten today's workout (workoutId: ${workoutId}) with adjust_workout, using a "lighter" intensity override and a reason.`}
      />
    </div>
  );
}
