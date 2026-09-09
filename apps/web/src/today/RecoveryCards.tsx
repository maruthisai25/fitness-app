/**
 * Plateau and deload — DESIGN.md §5.3. Both are detector output: a plateau
 * card lists the suggestions the engine returned, and the deload card is a
 * proposal the user accepts or declines. Neither is imposed.
 */

import { radius, space } from '@vigor/ui-tokens';
import type {
  DeloadRecommendation,
  Exercise,
  LocalDate,
  PlateauResult,
  WeekDay,
} from '@vigor/core';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router';

import { Card, SectionHeading, WhyDisclosure } from '../components/ui';
import { useInvalidate, useRepos } from '../data/hooks';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { recordDeloadDecision, type DeloadDecision } from './deloadDecision';

export function DeloadCard({
  date,
  weekStartsOn,
  recommendation,
  decision,
  onDecided,
}: {
  date: LocalDate;
  weekStartsOn: WeekDay;
  recommendation: DeloadRecommendation;
  decision: DeloadDecision;
  onDecided: () => void;
}): ReactNode {
  const repos = useRepos();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);

  if (!recommendation.recommended || decision !== 'undecided') return null;

  async function decide(next: 'accepted' | 'dismissed'): Promise<void> {
    setBusy(true);
    try {
      await recordDeloadDecision(repos, {
        date,
        weekStartsOn,
        decision: next,
        recommendation,
      });
      await invalidate('dismissInsight');
      onDecided();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tone="raised" style={{ borderColor: themeColor.warn }}>
      <SectionHeading>A lighter week is worth taking</SectionHeading>
      <p style={{ margin: 0, color: themeColor.text }}>{recommendation.rationale.summary}</p>
      <p style={{ color: themeColor.textMuted, fontSize: fontSize.label }}>
        Accepting drops next session’s volume to {Math.round(recommendation.volumeMultiplier * 100)}{' '}
        % and its loads to {Math.round(recommendation.loadMultiplier * 100)} %.
      </p>
      <WhyDisclosure rationale={recommendation.rationale} />
      <div style={{ display: 'flex', gap: space.md, marginTop: space.md, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => void decide('accepted')}
          style={primary}
        >
          Take the deload
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void decide('dismissed')}
          style={secondary}
        >
          Not this week
        </button>
      </div>
    </Card>
  );
}

export function PlateauCards({
  plateaus,
}: {
  plateaus: readonly { plateau: PlateauResult; exercise: Exercise }[];
}): ReactNode {
  if (plateaus.length === 0) return null;
  return (
    <Card>
      <SectionHeading>Stalled lifts</SectionHeading>
      {plateaus.map(({ plateau, exercise }) => (
        <div key={exercise.id} style={{ marginBottom: space.lg }}>
          <Link
            to={`/train/exercise/${exercise.id}`}
            style={{ color: themeColor.text, fontSize: fontSize.subheading }}
          >
            {exercise.name}
          </Link>
          <p style={{ margin: `${space.xs}px 0 0`, color: themeColor.textMuted }}>
            {plateau.rationale.summary}
          </p>
          <ul style={{ margin: `${space.sm}px 0 0`, paddingLeft: space.lg }}>
            {plateau.suggestions.map((suggestion) => (
              <li
                key={`${suggestion.kind}-${suggestion.exerciseId ?? 'none'}`}
                style={{ color: themeColor.text }}
              >
                {suggestion.detail}
              </li>
            ))}
          </ul>
          <WhyDisclosure rationale={plateau.rationale} />
        </div>
      ))}
    </Card>
  );
}

const primary = {
  padding: `${space.sm}px ${space.lg}px`,
  borderRadius: radius.md,
  border: 'none',
  background: themeColor.accent,
  color: themeColor.textOnAccent,
  fontWeight: 600,
  cursor: 'pointer',
} as const;

const secondary = {
  padding: `${space.sm}px ${space.lg}px`,
  borderRadius: radius.md,
  border: `1px solid ${themeColor.border}`,
  background: 'transparent',
  color: themeColor.text,
  cursor: 'pointer',
} as const;
