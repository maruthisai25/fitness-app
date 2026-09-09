import { View } from 'react-native';

import { useRefreshToday, useTodayQuery } from '../../src/data/today';
import { PlanCard } from '../../src/today/PlanCard';
import { ReadinessCard } from '../../src/today/ReadinessCard';
import { Recommendations } from '../../src/today/Recommendations';
import { ErrorBanner, LoadingScreen, Screen, ScreenTitle } from '../../src/ui/components';
import { Body, Caption, Card, Numeral, StatRow, StatTile } from '../../src/ui/kit';
import { SafetyBanner } from '../../src/ui/SafetyBanner';
import { space } from '../../src/ui/tokens';

/**
 * Today — DESIGN.md §7.1: readiness check-in, today's plan, streak, open
 * insights and the plateau/deload recommendation. Nutrition arrives in phase 4;
 * the ring is left to that agent, so this screen shows training and readiness.
 */
export default function TodayScreen() {
  const today = useTodayQuery();
  const refresh = useRefreshToday();

  if (today.isLoading || !today.data) {
    if (today.error) {
      return (
        <Screen>
          <ScreenTitle>Today</ScreenTitle>
          <ErrorBanner
            message={
              today.error instanceof Error ? today.error.message : 'Could not load your day.'
            }
          />
        </Screen>
      );
    }
    return <LoadingScreen label="Loading today…" />;
  }

  const bundle = today.data;
  const { view } = bundle;

  return (
    <Screen>
      <ScreenTitle>Today</ScreenTitle>
      <Body muted>{view.headline}</Body>

      <SafetyBanner />

      <ReadinessCard bundle={bundle} />

      <PlanCard bundle={bundle} onPlanned={() => void refresh()} />

      {view.streak ? (
        <Card title="Consistency">
          <StatRow>
            <StatTile
              label="Current streak"
              value={String(view.streak.current)}
              unit="sessions"
              tone={view.streak.current > 0 ? 'accent' : 'default'}
            />
            <StatTile label="Longest" value={String(view.streak.longest)} unit="sessions" />
          </StatRow>
          <Caption>Rest days never break a streak; only a missed planned session does.</Caption>
        </Card>
      ) : null}

      {view.nutrition.hasTargets ? (
        <Card title="Nutrition" subtitle={`${view.nutrition.mealsLogged} meals logged`}>
          <Numeral
            value={String(Math.round(view.nutrition.remainingForDisplay.proteinG))}
            unit="g protein left"
          />
        </Card>
      ) : null}

      <Recommendations bundle={bundle} onAnswered={() => void refresh()} />

      <View style={{ height: space.xl }} />
    </Screen>
  );
}
