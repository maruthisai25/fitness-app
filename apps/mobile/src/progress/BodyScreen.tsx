/**
 * Body — weight and measurements over time (DESIGN.md §7.1 "Progress").
 *
 * The chart and the comparison come from `buildProgressSeries`; the form
 * writes canonical metric through `@vigor/core/units`.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  addDays,
  buildProgressSeries,
  formatBodyWeight,
  queryKeys,
  toDisplay,
  unitLabel,
  type LocalDate,
  type UnitSystem,
} from '@vigor/core';

import { usePlatform, useRepos } from '../db/AppDataProvider';
import { LoadingScreen, Screen, ScreenBlurb, ScreenTitle } from '../ui/components';
import { LineChart } from '../ui/charts';
import { DateStepper, formatShortDate } from '../ui/DateStepper';
import {
  Caption,
  Card,
  CardTitle,
  DataRow,
  EmptyState,
  ErrorScreen,
  ItemRow,
  Note,
} from '../ui/primitives';
import { BodyMetricForm } from './BodyMetricForm';

/** The chart window, and the "versus" point the summary compares against. */
export const BODY_WINDOW_DAYS = 180;
export const COMPARISON_DAYS_AGO = 30;

export function BodyScreen() {
  const repos = useRepos();
  const { clock } = usePlatform();
  const today = clock.today();
  const [date, setDate] = useState<LocalDate>(today);

  const state = useQuery({
    queryKey: queryKeys.bodyMetrics(),
    queryFn: async () => {
      const [metrics, profile] = await Promise.all([repos.body.listMetrics(), repos.profile.get()]);
      return { metrics, unitSystem: (profile?.unitSystem ?? 'metric') as UnitSystem };
    },
  });

  if (state.isPending) return <LoadingScreen label="Loading measurements…" />;
  if (state.error)
    return <ErrorScreen message={`Could not load measurements: ${state.error.message}`} />;

  const metrics = state.data?.metrics ?? [];
  const unitSystem = state.data?.unitSystem ?? 'metric';
  const forDate = metrics.find((metric) => metric.date === date) ?? null;

  const weightSeries = buildProgressSeries({
    metric: 'body_weight',
    from: addDays(today, -(BODY_WINDOW_DAYS - 1)),
    to: today,
    bodyMetrics: metrics,
    unitSystem,
  });
  const waistSeries = buildProgressSeries({
    metric: 'waist',
    from: addDays(today, -(BODY_WINDOW_DAYS - 1)),
    to: today,
    bodyMetrics: metrics,
    unitSystem,
  });

  const withWeight = metrics.filter((metric) => metric.weightKg != null);
  const latest = withWeight[withWeight.length - 1] ?? null;
  const comparisonCutoff = addDays(today, -COMPARISON_DAYS_AGO);
  const past = [...withWeight].reverse().find((metric) => metric.date <= comparisonCutoff) ?? null;
  const delta =
    latest?.weightKg != null && past?.weightKg != null ? latest.weightKg - past.weightKg : null;

  return (
    <Screen>
      <ScreenTitle>Body</ScreenTitle>
      <ScreenBlurb>
        {unitSystem === 'imperial'
          ? 'Entered in pounds and inches, stored in kilograms and centimetres so the history never depends on which units you were using at the time.'
          : 'Entered and stored in kilograms and centimetres.'}
      </ScreenBlurb>

      {latest ? (
        <Card>
          <CardTitle>Latest versus 30 days ago</CardTitle>
          <DataRow
            label={`Weight on ${formatShortDate(latest.date)}`}
            value={latest.weightKg == null ? '—' : formatBodyWeight(latest.weightKg, unitSystem)}
          />
          {past?.weightKg != null ? (
            <DataRow
              label={`Weight on ${formatShortDate(past.date)}`}
              value={formatBodyWeight(past.weightKg, unitSystem)}
            />
          ) : (
            <Caption>
              No entry from a month or more ago yet, so there is nothing to compare.
            </Caption>
          )}
          {delta != null ? (
            <DataRow
              label="Change"
              value={`${delta > 0 ? '+' : ''}${toDisplay(delta, 'weight', unitSystem)} ${unitLabel(
                'weight',
                unitSystem,
              )}`}
              tone={delta === 0 ? 'neutral' : 'accent'}
            />
          ) : null}
          <Note>{weightSeries.rationale.summary}</Note>
        </Card>
      ) : null}

      <LineChart
        title="Body weight"
        subtitle={`Last ${BODY_WINDOW_DAYS} days.`}
        unit={weightSeries.unit}
        points={weightSeries.points.map((point) => ({
          label: formatShortDate(point.date),
          value: point.display,
        }))}
      />

      {waistSeries.points.length > 0 ? (
        <LineChart
          title="Waist"
          subtitle={waistSeries.rationale.summary}
          unit={waistSeries.unit}
          points={waistSeries.points.map((point) => ({
            label: formatShortDate(point.date),
            value: point.display,
          }))}
          stroke="#5A8CA8"
        />
      ) : null}

      <DateStepper date={date} today={today} onChange={setDate} allowFuture={false} />

      <BodyMetricForm
        key={`${date}-${forDate?.id ?? 'new'}`}
        repos={repos}
        date={date}
        unitSystem={unitSystem}
        initial={forDate}
      />

      {metrics.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          detail="One weight a week is enough to see a trend. Measurements are optional — log the ones you care about."
        />
      ) : (
        <Card>
          <CardTitle>History</CardTitle>
          {[...metrics]
            .reverse()
            .slice(0, 30)
            .map((metric) => (
              <ItemRow
                key={metric.id}
                title={formatShortDate(metric.date)}
                subtitle={[
                  metric.waistCm == null
                    ? null
                    : `waist ${toDisplay(metric.waistCm, 'length', unitSystem)} ${unitLabel('length', unitSystem)}`,
                  metric.notes,
                ]
                  .filter((part): part is string => Boolean(part))
                  .join(' · ')}
                value={
                  metric.weightKg == null ? '—' : formatBodyWeight(metric.weightKg, unitSystem)
                }
                onPress={() => setDate(metric.date)}
              />
            ))}
        </Card>
      )}
    </Screen>
  );
}
