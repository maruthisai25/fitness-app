/**
 * Accepting or dismissing a deload — DESIGN.md §5.3: "Deload is proposed, not
 * imposed; the coach explains and the user accepts."
 *
 * The decision is a real row, not component state: an `insights` row for the
 * week in question, so Today knows next time it opens and the planner can apply
 * the prescription (see `plan.ts`).
 */

import {
  endOfWeek,
  startOfWeek,
  type DeloadRecommendation,
  type Insight,
  type LocalDate,
  type WeekDay,
} from '@vigor/core';
import type { Repositories } from '@vigor/db';

export const DELOAD_ACCEPTED = 'DELOAD_ACCEPTED';
export const DELOAD_DISMISSED = 'DELOAD_DISMISSED';

export type DeloadDecision = 'accepted' | 'dismissed' | 'undecided';

/** The decision already recorded for the week containing `date`. */
export async function readDeloadDecision(
  repos: Repositories,
  date: LocalDate,
  weekStartsOn: WeekDay,
): Promise<DeloadDecision> {
  const weekStart = startOfWeek(date, weekStartsOn);
  const rows = await repos.insights.list({ includeDismissed: true });
  const forWeek = (insight: Insight, detector: string): boolean =>
    insight.detector === detector && insight.period.from === weekStart;
  if (rows.some((row) => forWeek(row, DELOAD_ACCEPTED))) return 'accepted';
  if (rows.some((row) => forWeek(row, DELOAD_DISMISSED))) return 'dismissed';
  return 'undecided';
}

/** Records the user's answer for this week and returns the stored insight. */
export async function recordDeloadDecision(
  repos: Repositories,
  input: {
    date: LocalDate;
    weekStartsOn: WeekDay;
    decision: Exclude<DeloadDecision, 'undecided'>;
    recommendation: DeloadRecommendation;
  },
): Promise<Insight> {
  const weekStart = startOfWeek(input.date, input.weekStartsOn);
  const accepted = input.decision === 'accepted';
  return repos.insights.create({
    detector: accepted ? DELOAD_ACCEPTED : DELOAD_DISMISSED,
    period: { from: weekStart, to: endOfWeek(input.date, input.weekStartsOn) },
    headline: accepted
      ? 'Deload accepted for this week'
      : 'Deload declined — training continues as planned',
    detail: input.recommendation.rationale.summary,
    severity: accepted ? 'notice' : 'info',
    // A declined proposal is not an open item on Today.
    dismissed: !accepted,
    evidence: [],
  });
}
