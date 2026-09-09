/**
 * Progress → Insights. DESIGN.md §5.8: deterministic detectors, run on app open
 * at most once per calendar day. Each row carries its headline, detail and the
 * evidence rows it was derived from, and can be dismissed.
 */

import type { Insight } from '@vigor/core';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Card, EmptyState, LinkButton, Notice, Pill, Section } from '../components/ui';
import { useDb } from '../db/provider';
import { useInvalidate } from '../eat/data';
import { webClock } from '../platform/clock';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { useOpenInsights } from './data';
import { runDetectorsOnce } from './foreground';

const DETECTOR_LABEL: Record<string, string> = {
  EXERCISE_TREND: 'Strength trend',
  PUSH_PULL_BALANCE: 'Push / pull balance',
  SKIPPED_PATTERN: 'Scheduling',
  PROTEIN_GAP_BY_DAY: 'Protein by weekday',
  COMPLETION_BY_DURATION: 'Session length',
  FREQUENT_FOODS: 'Frequent foods',
  MISSED_TARGET_STREAK: 'Missed targets',
};

export function InsightsPanel(): ReactNode {
  const { repos } = useDb();
  const invalidate = useInvalidate();
  const insights = useOpenInsights();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function dismiss(insight: Insight): Promise<void> {
    setBusy(true);
    try {
      await repos.insights.dismiss(insight.id);
      await invalidate('dismissInsight');
    } finally {
      setBusy(false);
    }
  }

  async function rerun(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const fresh = await runDetectorsOnce(repos, webClock.today(), { force: true });
      await invalidate('dismissInsight');
      setNote(
        fresh.length === 0
          ? 'Nothing new — every detector agreed with what is already here.'
          : `${fresh.length} new insight${fresh.length === 1 ? '' : 's'}.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Notice>
        Seven detectors read your logs once a day and only report what the numbers actually
        support. None of this needs the coach or a network connection.
      </Notice>

      <Section
        title="Open insights"
        action={
          <LinkButton tone="accent" onClick={() => void rerun()} disabled={busy}>
            Run them now
          </LinkButton>
        }
        style={{ marginTop: space.xl }}
      >
        {note && (
          <p style={{ color: themeColor.textMuted, fontSize: fontSize.label }} role="status">
            {note}
          </p>
        )}
        {insights.isPending && <EmptyState>Loading…</EmptyState>}
        {insights.data && insights.data.length === 0 && (
          <EmptyState>
            Nothing to flag. Keep logging and the detectors will speak up when a pattern is real.
          </EmptyState>
        )}
        {(insights.data ?? []).map((insight) => (
          <Card
            key={insight.id}
            tone={insight.severity === 'warning' ? 'warn' : 'surface'}
            style={{ marginBottom: space.md }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: space.md,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: space.xs, marginBottom: space.xs, flexWrap: 'wrap' }}>
                  <Pill
                    tone={
                      insight.severity === 'warning'
                        ? 'bad'
                        : insight.severity === 'notice'
                          ? 'warn'
                          : 'muted'
                    }
                  >
                    {DETECTOR_LABEL[insight.detector] ?? insight.detector}
                  </Pill>
                  <Pill>
                    {insight.period.from} → {insight.period.to}
                  </Pill>
                </div>
                <p style={{ margin: 0, color: themeColor.text, fontSize: fontSize.body, fontWeight: 600 }}>
                  {insight.headline}
                </p>
                <p
                  style={{
                    margin: `${space.xs}px 0 0`,
                    color: themeColor.textMuted,
                    fontSize: fontSize.label,
                    lineHeight: 1.5,
                  }}
                >
                  {insight.detail}
                </p>
                {insight.evidence.length > 0 && (
                  <details style={{ marginTop: space.sm }}>
                    <summary
                      style={{
                        cursor: 'pointer',
                        color: themeColor.textFaint,
                        fontSize: fontSize.caption,
                      }}
                    >
                      What this is based on ({insight.evidence.length} row
                      {insight.evidence.length === 1 ? '' : 's'})
                    </summary>
                    <ul
                      className="tabular"
                      style={{
                        margin: `${space.xs}px 0 0`,
                        paddingLeft: space.xl,
                        color: themeColor.textFaint,
                        fontSize: fontSize.caption,
                      }}
                    >
                      {insight.evidence.map((ref, index) => (
                        <li key={`${ref.table}-${ref.id}-${index}`}>
                          {ref.table} · {ref.id}
                          {ref.note ? ` · ${ref.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <LinkButton onClick={() => void dismiss(insight)} disabled={busy}>
                Dismiss
              </LinkButton>
            </div>
          </Card>
        ))}
      </Section>
    </div>
  );
}
