/**
 * Weekly reviews — DESIGN.md §5.9.
 *
 * The stats are deterministic and stored the moment a week ends; the coach's
 * prose is an `ai_job` that fills `summary` and `recommendation` later. Until
 * it lands the screen says so rather than inventing a sentence.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { queryKeys, type WeeklyReview } from '@vigor/core';

import { useRepos } from '../db/AppDataProvider';
import { ErrorBanner, LoadingScreen, Screen, ScreenBlurb, ScreenTitle } from '../ui/components';
import { formatShortDate } from '../ui/DateStepper';
import {
  ActionRow,
  Body,
  Caption,
  Card,
  CardTitle,
  DataRow,
  EmptyState,
  InlineAction,
  ItemRow,
  Note,
  Stat,
  StatRow,
  ErrorScreen,
} from '../ui/primitives';
import { useProgressForeground } from './useProgressForeground';

const NO_SUMMARY = 'Summary arrives when the coach is connected.';

function ReviewDetail({ review }: { review: WeeklyReview }) {
  const { training, nutrition } = review;
  return (
    <View>
      <StatRow>
        <Stat
          label="Sessions"
          value={`${training.workoutsCompleted}/${training.workoutsPlanned}`}
          tone={training.completionRate >= 0.75 ? 'good' : 'warn'}
        />
        <Stat label="Sets" value={String(training.totalSets)} />
        <Stat label="Volume" value={String(Math.round(training.totalVolumeKg))} unit="kg" />
      </StatRow>

      <DataRow label="Missed sessions" value={String(training.missedSessions)} />
      <DataRow
        label="Average RPE"
        value={training.averageRpe == null ? '—' : String(training.averageRpe)}
      />
      <DataRow
        label="Average session"
        value={
          training.averageDurationMin == null
            ? '—'
            : `${Math.round(training.averageDurationMin)} min`
        }
      />

      {training.volumeByMuscleGroup.length > 0 ? (
        <View>
          <Caption>Volume by muscle group</Caption>
          {training.volumeByMuscleGroup.slice(0, 8).map((entry) => (
            <DataRow
              key={entry.muscle}
              label={entry.muscle}
              value={`${entry.sets} sets · ${Math.round(entry.volumeKg)} kg`}
            />
          ))}
        </View>
      ) : null}

      {training.personalRecords.length > 0 ? (
        <View>
          <Caption>Records set</Caption>
          {training.personalRecords.map((record, index) => (
            <ItemRow
              key={`${record.exerciseId}-${record.kind}-${index}`}
              title={record.exerciseName}
              subtitle={`${record.kind} · ${formatShortDate(record.date)}`}
              value={String(Math.round(record.value))}
              tone="accent"
            />
          ))}
        </View>
      ) : null}

      <Caption>Nutrition</Caption>
      <DataRow label="Days logged" value={String(nutrition.daysLogged)} />
      <DataRow label="Average calories" value={`${Math.round(nutrition.averageKcal)} kcal`} />
      <DataRow label="Average protein" value={`${Math.round(nutrition.averageProteinG)} g`} />
      <DataRow
        label="Protein target hit"
        value={`${Math.round(nutrition.targetHitRate.proteinG * 100)}% of logged days`}
        tone={nutrition.targetHitRate.proteinG >= 0.7 ? 'good' : 'warn'}
      />
      {nutrition.missedTargets.length > 0 ? (
        <Note tone="warn">{`Missed more often than not: ${nutrition.missedTargets.join(', ')}.`}</Note>
      ) : null}
    </View>
  );
}

export function ReviewsScreen() {
  const repos = useRepos();
  const foreground = useProgressForeground();
  const [openId, setOpenId] = useState<string | null>(null);

  const reviews = useQuery({
    queryKey: queryKeys.weeklyReviews(),
    queryFn: () => repos.reviews.list({ limit: 26 }),
  });

  if (reviews.isPending) return <LoadingScreen label="Loading reviews…" />;
  if (reviews.error)
    return <ErrorScreen message={`Could not load reviews: ${reviews.error.message}`} />;

  const rows = reviews.data ?? [];

  return (
    <Screen>
      <ScreenTitle>Weekly reviews</ScreenTitle>
      <ScreenBlurb>
        Built automatically once a week has finished — the numbers first, the coach&apos;s reading
        of them when it is connected.
      </ScreenBlurb>

      {foreground.review ? <Note>{foreground.review}</Note> : null}
      {foreground.error ? <ErrorBanner message={foreground.error} /> : null}

      <ActionRow>
        <InlineAction label="Check for a finished week" onPress={foreground.refresh} />
      </ActionRow>

      {rows.length === 0 ? (
        <EmptyState
          title="No reviews yet"
          detail="The first one lands as soon as a full week has passed. Nothing to set up."
        />
      ) : (
        rows.map((review) => (
          <Card key={review.id}>
            <CardTitle>{`Week of ${formatShortDate(review.weekStart)}`}</CardTitle>
            <Caption>
              {`${review.training.workoutsCompleted} of ${review.training.workoutsPlanned} sessions · ${review.nutrition.daysLogged} days logged · built ${review.generatedAt.slice(0, 10)}`}
            </Caption>

            {review.summary ? <Body>{review.summary}</Body> : <Note tone="warn">{NO_SUMMARY}</Note>}
            {review.recommendation ? <Note tone="accent">{review.recommendation}</Note> : null}

            {openId === review.id ? <ReviewDetail review={review} /> : null}

            <ActionRow>
              <InlineAction
                label={openId === review.id ? 'Hide the numbers' : 'Show the numbers'}
                onPress={() => setOpenId(openId === review.id ? null : review.id)}
              />
            </ActionRow>
          </Card>
        ))
      )}
    </Screen>
  );
}
