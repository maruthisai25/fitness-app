/**
 * The Progress tab's front door — DESIGN.md §7.1: "strength charts, body
 * weight and measurements, photos compare, consistency, weekly reviews".
 *
 * It is also where the once-a-day work runs: the insight detectors, last
 * week's review, and rescheduling the reminders.
 */
import { useQuery } from '@tanstack/react-query';

import { computeStreak, expandRestDays, addDays, queryKeys } from '@vigor/core';

import { useRepos, usePlatform } from '../db/AppDataProvider';
import { ErrorBanner, LinkRow, Screen, ScreenBlurb, ScreenTitle, Section } from '../ui/components';
import { Caption, Card, CardTitle, Note, Stat, StatRow } from '../ui/primitives';
import { useProgressForeground } from './useProgressForeground';

const STREAK_WINDOW_DAYS = 90;

export function ProgressIndexScreen({ onNavigate }: { onNavigate: (path: string) => void }) {
  const repos = useRepos();
  const { clock } = usePlatform();
  const today = clock.today();
  const foreground = useProgressForeground();

  const summary = useQuery({
    queryKey: [...queryKeys.workouts(), 'progress-summary', today],
    queryFn: async () => {
      const from = addDays(today, -(STREAK_WINDOW_DAYS - 1));
      const [workouts, openInsights, reviews, latestBody] = await Promise.all([
        repos.workouts.listRange({ from, to: today }),
        repos.insights.listOpen({ limit: 20 }),
        repos.reviews.list({ limit: 1 }),
        repos.body.latestMetric(),
      ]);
      const days = expandRestDays(
        from,
        today,
        workouts.map((workout) => ({
          date: workout.date,
          planned: true,
          completed: workout.status === 'completed',
        })),
      );
      return {
        streak: computeStreak({ today, days }),
        openInsights: openInsights.length,
        lastReview: reviews[0] ?? null,
        latestBody,
      };
    },
  });

  return (
    <Screen>
      <ScreenTitle>Progress</ScreenTitle>
      <ScreenBlurb>
        What the logs add up to: strength trends, body measurements, photos, how consistent you have
        been, and the review of each week.
      </ScreenBlurb>

      {foreground.error ? (
        <ErrorBanner message={`Background work failed: ${foreground.error}`} />
      ) : null}

      {summary.data ? (
        <Card>
          <CardTitle>Where you are</CardTitle>
          <StatRow>
            <Stat
              label="Streak"
              value={String(summary.data.streak.current)}
              unit="sessions"
              tone={summary.data.streak.current > 0 ? 'good' : 'neutral'}
            />
            <Stat
              label="Open insights"
              value={String(summary.data.openInsights)}
              tone={summary.data.openInsights > 0 ? 'accent' : 'neutral'}
            />
            <Stat label="Best run" value={String(summary.data.streak.longest)} unit="sessions" />
          </StatRow>
          <Note>{summary.data.streak.rationale.summary}</Note>
        </Card>
      ) : null}

      <Section title="Charts and logs">
        <LinkRow
          title="Strength"
          subtitle="Estimated 1RM, weekly sets and every PR"
          onPress={() => onNavigate('/progress/strength')}
        />
        <LinkRow
          title="Body"
          subtitle="Weight, waist and measurements over time"
          onPress={() => onNavigate('/progress/body')}
        />
        <LinkRow
          title="Photos"
          subtitle="Front, side and back — kept on this device"
          onPress={() => onNavigate('/progress/photos')}
        />
        <LinkRow
          title="Consistency"
          subtitle="Weekly completion, streak and missed sessions"
          onPress={() => onNavigate('/progress/consistency')}
        />
      </Section>

      <Section title="What the app noticed">
        <LinkRow
          title="Insights"
          subtitle={
            summary.data?.openInsights
              ? `${summary.data.openInsights} open`
              : 'Patterns the detectors found'
          }
          onPress={() => onNavigate('/progress/insights')}
        />
        <LinkRow
          title="Weekly reviews"
          subtitle={
            summary.data?.lastReview
              ? `Latest: week of ${summary.data.lastReview.weekStart}`
              : 'Built automatically once a week has finished'
          }
          onPress={() => onNavigate('/progress/reviews')}
        />
        <LinkRow
          title="Reminders"
          subtitle="Workout, meal log, protein and weekly review"
          onPress={() => onNavigate('/progress/reminders')}
        />
      </Section>

      <Card>
        <CardTitle>Background work</CardTitle>
        <Caption>
          {foreground.running
            ? 'Running the detectors…'
            : foreground.lastRunAt
              ? `Last run ${foreground.lastRunAt.slice(11, 16)} UTC`
              : 'Not run yet in this session.'}
        </Caption>
        {foreground.insights ? <Note>{foreground.insights}</Note> : null}
        {foreground.review ? <Note>{foreground.review}</Note> : null}
      </Card>
    </Screen>
  );
}
