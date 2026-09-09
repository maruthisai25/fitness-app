/**
 * Today — DESIGN.md §7.1: readiness check-in, today's plan, open insights and
 * the streak. Nutrition arrives in phase 4; the ring's slot is left to that
 * agent, so this screen shows only what phases 1–3 own.
 */

import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { CoachSlot } from '../coach/slots';
import {
  Card,
  EmptyState,
  PageHeading,
  SectionHeading,
  Stat,
  WhyDisclosure,
} from '../components/ui';
import { useInvalidate, useRepos } from '../data/hooks';
import { useDb } from '../db/provider';
import { formatDate, todayLocalDate } from '../lib/localDate';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { readDeloadDecision, type DeloadDecision } from './deloadDecision';
import { PlanCard } from './PlanCard';
import { ReadinessCard } from './ReadinessCard';
import { DeloadCard, PlateauCards } from './RecoveryCards';
import { useTodayView } from './useTodayView';

export function TodaySection(): ReactNode {
  const date = todayLocalDate();
  const repos = useRepos();
  const invalidate = useInvalidate();
  const { settings } = useDb();
  const { data, isPending, refetch } = useTodayView(date);
  const [deloadDecision, setDeloadDecision] = useState<DeloadDecision>('undecided');

  useEffect(() => {
    let cancelled = false;
    void readDeloadDecision(repos, date, settings.weekStartsOn).then((decision) => {
      if (!cancelled) setDeloadDecision(decision);
    });
    return () => {
      cancelled = true;
    };
  }, [repos, date, settings.weekStartsOn]);

  if (isPending || !data) {
    return (
      <div style={{ padding: space.xl }}>
        <PageHeading title="Today" subtitle="Reading your logs…" />
      </div>
    );
  }

  const { view } = data;

  async function dismissInsight(insightId: string): Promise<void> {
    await repos.insights.dismiss(insightId);
    await invalidate('dismissInsight');
  }

  return (
    <div style={{ padding: space.xl, maxWidth: 900 }}>
      <PageHeading title="Today" subtitle={`${formatDate(date, 'long')} · ${view.headline}`} />

      <div style={{ display: 'grid', gap: space.lg }}>
        <ReadinessCard date={date} row={data.readinessRow} assessment={data.readiness} />

        <PlanCard
          date={date}
          view={view}
          workoutsToday={data.workoutsToday}
          deload={data.deload}
          deloadAccepted={deloadDecision === 'accepted'}
          safetyActive={view.safetyActive}
        />

        <DeloadCard
          date={date}
          weekStartsOn={settings.weekStartsOn}
          recommendation={data.deload}
          decision={deloadDecision}
          onDecided={() => {
            void readDeloadDecision(repos, date, settings.weekStartsOn).then(setDeloadDecision);
            void refetch();
          }}
        />

        <PlateauCards plateaus={data.plateaus} />

        <Card>
          <SectionHeading>Consistency</SectionHeading>
          <div style={{ display: 'flex', gap: space.xl, flexWrap: 'wrap' }}>
            <Stat label="Current streak" value={data.streak.current} unit="sessions" />
            <Stat label="Longest" value={data.streak.longest} unit="sessions" />
          </div>
          <p style={{ color: themeColor.textMuted, marginBottom: 0 }}>
            {data.streak.rationale.summary}
          </p>
          <WhyDisclosure rationale={data.streak.rationale} />
        </Card>

        <Card>
          <SectionHeading>Open insights</SectionHeading>
          {view.openInsights.length === 0 ? (
            <EmptyState>
              No open insights. Detectors run as your history grows — trends, balance and
              consistency show up here.
            </EmptyState>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.insights.map((insight) => (
                <li
                  key={insight.id}
                  style={{
                    borderTop: `1px solid ${themeColor.border}`,
                    paddingTop: space.md,
                    marginTop: space.md,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: space.md,
                      flexWrap: 'wrap',
                    }}
                  >
                    <strong style={{ color: themeColor.text }}>{insight.headline}</strong>
                    <button
                      type="button"
                      onClick={() => void dismissInsight(insight.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: themeColor.accent,
                        cursor: 'pointer',
                        fontSize: fontSize.label,
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                  {insight.detail && (
                    <p style={{ margin: `${space.xs}px 0 0`, color: themeColor.textMuted }}>
                      {insight.detail}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <CoachSlot name="todayInsights" />
        </Card>
      </div>
    </div>
  );
}
