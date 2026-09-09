/**
 * Insights — DESIGN.md §5.8.
 *
 * Everything here was produced by a deterministic detector, so every row can
 * show its headline, the detail behind it, the period it covers and the rows
 * it is based on. Dismissing one keeps it in the database; it just stops
 * asking for attention.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { queryKeys, type Insight, type InsightSeverity } from '@vigor/core';

import { useInvalidator } from '../data/queries';
import { useRepos } from '../db/AppDataProvider';
import { ErrorBanner, LoadingScreen, Screen, ScreenBlurb, ScreenTitle } from '../ui/components';
import { formatShortDate } from '../ui/DateStepper';
import {
  ActionRow,
  Body,
  Caption,
  Card,
  CardTitle,
  EmptyState,
  InlineAction,
  Note,
  type ToneName,
  ErrorScreen,
} from '../ui/primitives';
import { useProgressForeground } from './useProgressForeground';

const SEVERITY_TONE: Record<InsightSeverity, ToneName> = {
  info: 'neutral',
  notice: 'warn',
  warning: 'bad',
};

const DETECTOR_LABEL: Record<string, string> = {
  EXERCISE_TREND: 'Estimated 1RM trend',
  PUSH_PULL_BALANCE: 'Push / pull balance',
  SKIPPED_PATTERN: 'Skipped pattern',
  PROTEIN_GAP_BY_DAY: 'Protein by weekday',
  COMPLETION_BY_DURATION: 'Completion by session length',
  FREQUENT_FOODS: 'Frequent foods',
  MISSED_TARGET_STREAK: 'Missed macro targets',
  PLATEAU: 'Plateau',
  DELOAD_RECOMMENDED: 'Deload recommended',
};

export function InsightsScreen() {
  const repos = useRepos();
  const invalidate = useInvalidator();
  const foreground = useProgressForeground();
  const [showEvidence, setShowEvidence] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const insights = useQuery({
    queryKey: [...queryKeys.insights(), showDismissed],
    queryFn: () => repos.insights.list({ includeDismissed: showDismissed }),
  });

  async function dismiss(insight: Insight): Promise<void> {
    setBusy(true);
    try {
      await repos.insights.dismiss(insight.id);
      invalidate('dismissInsight');
    } finally {
      setBusy(false);
    }
  }

  if (insights.isPending) return <LoadingScreen label="Loading insights…" />;
  if (insights.error)
    return <ErrorScreen message={`Could not load insights: ${insights.error.message}`} />;

  const rows = insights.data ?? [];

  return (
    <Screen>
      <ScreenTitle>Insights</ScreenTitle>
      <ScreenBlurb>
        Patterns found in your own logs by fixed rules — no guessing, and every one names the rows
        it came from.
      </ScreenBlurb>

      {foreground.insights ? <Note>{foreground.insights}</Note> : null}
      {foreground.error ? <ErrorBanner message={foreground.error} /> : null}

      <ActionRow>
        <InlineAction
          label={showDismissed ? 'Hide dismissed' : 'Show dismissed too'}
          onPress={() => setShowDismissed(!showDismissed)}
        />
        <InlineAction label="Run the detectors now" onPress={foreground.refresh} />
      </ActionRow>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to report"
          detail="Detectors need a few weeks of sessions and meals before they have anything worth saying. They run once a day when you open the app."
        />
      ) : (
        rows.map((insight) => (
          <Card key={insight.id}>
            <CardTitle>{insight.headline}</CardTitle>
            <Caption tone={SEVERITY_TONE[insight.severity]}>
              {`${DETECTOR_LABEL[insight.detector] ?? insight.detector} · ${formatShortDate(
                insight.period.from,
              )} to ${formatShortDate(insight.period.to)}${insight.dismissed ? ' · dismissed' : ''}`}
            </Caption>
            <Body>{insight.detail}</Body>

            {showEvidence === insight.id ? (
              <View>
                <Caption>{`${insight.evidence.length} row${
                  insight.evidence.length === 1 ? '' : 's'
                } behind this:`}</Caption>
                {insight.evidence.slice(0, 12).map((ref, index) => (
                  <Caption key={`${ref.table}-${ref.id}-${index}`}>
                    {`${ref.table} · ${ref.id}${ref.note ? ` · ${ref.note}` : ''}`}
                  </Caption>
                ))}
              </View>
            ) : null}

            <ActionRow>
              <InlineAction
                label={showEvidence === insight.id ? 'Hide evidence' : 'Show evidence'}
                onPress={() => setShowEvidence(showEvidence === insight.id ? null : insight.id)}
              />
              {insight.dismissed ? null : (
                <InlineAction
                  label="Dismiss"
                  tone="bad"
                  disabled={busy}
                  onPress={() => void dismiss(insight)}
                />
              )}
            </ActionRow>
          </Card>
        ))
      )}
    </Screen>
  );
}
