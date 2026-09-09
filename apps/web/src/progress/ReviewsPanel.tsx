/**
 * Progress → Weekly review. DESIGN.md §5.9: the stats are deterministic and
 * stored first; the coach summary arrives later through the `weekly_review`
 * AI job. Until it does, the screen says so rather than showing an empty box.
 */

import { addDays, type WeeklyReview } from '@vigor/core';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';

import { BarChart } from '../components/charts';
import { Card, EmptyState, Notice, Pill, Section, Stat } from '../components/ui';
import { useDb } from '../db/provider';
import { webClock } from '../platform/clock';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { useWeeklyReviews } from './data';
import { lastCompletedWeekStart, markWeeklyReviewSeen, resyncForeground } from './foreground';

const NO_SUMMARY = 'Summary arrives when the coach is connected.';

export function ReviewsPanel(): ReactNode {
  const { repos, settings, refreshSettings } = useDb();
  const reviews = useWeeklyReviews();

  // Opening this screen is what "you have reviewed your week" means. It is
  // recorded in `settings.lastReviewViewedWeek`, so the weekly-review reminder
  // is quiet from here on — and only for that week. The review row itself
  // cannot say this, because the foreground runner writes it moments before the
  // reminder is decided.
  useEffect(() => {
    void (async () => {
      await markWeeklyReviewSeen(
        repos,
        lastCompletedWeekStart(webClock.today(), settings.weekStartsOn),
      );
      await refreshSettings();
      resyncForeground();
    })();
  }, [repos, refreshSettings, settings.weekStartsOn]);

  if (reviews.isPending) return <EmptyState>Loading your reviews…</EmptyState>;
  if ((reviews.data ?? []).length === 0) {
    return (
      <EmptyState>
        No weekly review yet. One is built automatically the first time you open the app after a
        week ends.
      </EmptyState>
    );
  }

  return (
    <Section title="Weeks">
      {(reviews.data ?? []).map((review) => (
        <Card key={review.id} style={{ marginBottom: space.md }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: space.md,
              flexWrap: 'wrap',
            }}
          >
            <Link
              to={`/progress/reviews/${review.weekStart}`}
              className="tabular"
              style={{ color: themeColor.text, fontSize: fontSize.body, fontWeight: 600 }}
            >
              {review.weekStart} → {addDays(review.weekStart, 6)}
            </Link>
            <Pill tone={review.summary ? 'good' : 'muted'}>
              {review.summary ? 'summarised' : 'stats only'}
            </Pill>
          </div>
          <p
            className="tabular"
            style={{
              margin: `${space.xs}px 0 0`,
              color: themeColor.textMuted,
              fontSize: fontSize.caption,
            }}
          >
            {review.training.workoutsCompleted}/{review.training.workoutsPlanned} sessions ·{' '}
            {review.training.totalSets} sets · {Math.round(review.nutrition.averageKcal)} kcal/day
            avg
          </p>
        </Card>
      ))}
    </Section>
  );
}

export function ReviewDetail(): ReactNode {
  const { weekStart } = useParams();
  const reviews = useWeeklyReviews();

  if (reviews.isPending) return <EmptyState>Loading…</EmptyState>;
  const review = (reviews.data ?? []).find((row) => row.weekStart === weekStart) ?? null;
  if (!review) {
    return (
      <EmptyState>
        No review stored for that week.{' '}
        <Link to="/progress/reviews" style={{ color: themeColor.accent }}>
          Back to reviews
        </Link>
      </EmptyState>
    );
  }

  return <ReviewBody review={review} />;
}

function ReviewBody({ review }: { review: WeeklyReview }): ReactNode {
  const volume = review.training.volumeByMuscleGroup;
  return (
    <div>
      <p style={{ margin: `0 0 ${space.lg}px` }}>
        <Link to="/progress/reviews" style={{ color: themeColor.accent, fontSize: fontSize.label }}>
          ‹ All reviews
        </Link>
      </p>

      <h2
        className="tabular"
        style={{ margin: `0 0 ${space.lg}px`, color: themeColor.text, fontSize: fontSize.heading }}
      >
        {review.weekStart} → {addDays(review.weekStart, 6)}
      </h2>

      <Section title="What the coach said">
        {review.summary ? (
          <Card>
            <p style={{ margin: 0, color: themeColor.text, lineHeight: 1.6 }}>{review.summary}</p>
            {review.recommendation && (
              <p
                style={{
                  margin: `${space.md}px 0 0`,
                  color: themeColor.accent,
                  lineHeight: 1.6,
                  fontWeight: 600,
                }}
              >
                {review.recommendation}
              </p>
            )}
          </Card>
        ) : (
          <Notice tone="accent">{NO_SUMMARY}</Notice>
        )}
      </Section>

      <Section title="Training">
        <Card>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
              gap: space.lg,
            }}
          >
            <Stat
              label="Sessions"
              value={`${review.training.workoutsCompleted} / ${review.training.workoutsPlanned}`}
              tone={review.training.completionRate >= 1 ? 'good' : 'text'}
            />
            <Stat label="Working sets" value={String(review.training.totalSets)} />
            <Stat
              label="Volume"
              value={String(Math.round(review.training.totalVolumeKg))}
              unit="kg"
            />
            <Stat
              label="Missed"
              value={String(review.training.missedSessions)}
              tone={review.training.missedSessions > 0 ? 'warn' : 'good'}
            />
            <Stat
              label="Average RPE"
              value={review.training.averageRpe == null ? '—' : String(review.training.averageRpe)}
            />
          </div>
        </Card>
        {volume.length > 0 && (
          <div style={{ marginTop: space.lg }}>
            <BarChart
              title="Volume by muscle group"
              subtitle="Working-set volume across the week."
              unit="kg"
              points={volume.map((entry) => ({ label: entry.muscle, value: entry.volumeKg }))}
            />
          </div>
        )}
      </Section>

      <Section title="Personal records">
        {review.training.personalRecords.length === 0 ? (
          <EmptyState>No records set this week.</EmptyState>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {review.training.personalRecords.map((record, index) => (
              <li
                key={`${record.exerciseId}-${record.kind}-${index}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: `${space.sm}px 0`,
                  borderTop: `1px solid ${themeColor.border}`,
                  color: themeColor.text,
                  fontSize: fontSize.label,
                }}
              >
                <span>
                  {record.exerciseName} · {record.kind.replace(/_/g, ' ')}
                </span>
                <span className="tabular" style={{ color: themeColor.accent }}>
                  {record.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Nutrition">
        <Card>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
              gap: space.lg,
            }}
          >
            <Stat label="Days logged" value={String(review.nutrition.daysLogged)} />
            <Stat
              label="Calories/day"
              value={String(Math.round(review.nutrition.averageKcal))}
              unit="kcal"
            />
            <Stat
              label="Protein/day"
              value={String(Math.round(review.nutrition.averageProteinG))}
              unit="g"
            />
            <Stat
              label="Fiber/day"
              value={String(Math.round(review.nutrition.averageFiberG))}
              unit="g"
            />
          </div>
          {review.nutrition.missedTargets.length > 0 && (
            <p
              style={{
                margin: `${space.md}px 0 0`,
                color: themeColor.warn,
                fontSize: fontSize.label,
              }}
            >
              Missed most days: {review.nutrition.missedTargets.join(', ')}.
            </p>
          )}
        </Card>
      </Section>
    </div>
  );
}
