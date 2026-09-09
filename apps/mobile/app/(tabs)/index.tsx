import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useRefreshToday, useTodayQuery } from '../../src/data/today';
import { TodayNutritionCard } from '../../src/eat/TodayNutritionCard';
import { PlanCard } from '../../src/today/PlanCard';
import { ReadinessCard } from '../../src/today/ReadinessCard';
import { Recommendations } from '../../src/today/Recommendations';
import { ErrorBanner, LoadingScreen, Screen, ScreenTitle } from '../../src/ui/components';
import { Body, Caption, Card, StatRow, StatTile } from '../../src/ui/kit';
import { SafetyBanner } from '../../src/ui/SafetyBanner';
import { space } from '../../src/ui/tokens';

/**
 * Today — DESIGN.md §7.1: readiness check-in, today's plan, the nutrition ring
 * with remaining macros, streak, open insights and the plateau/deload
 * recommendation.
 */
export default function TodayScreen() {
  const today = useTodayQuery();
  const refresh = useRefreshToday();
  const router = useRouter();

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

      {/* The Eat module owns the nutrition arithmetic and the copy; Today only
          places the card and says where a tap goes (DESIGN.md §7.1). */}
      <TodayNutritionCard date={view.date} onOpenEat={() => router.push('/eat')} />

      <Recommendations bundle={bundle} onAnswered={() => void refresh()} />

      <View style={{ height: space.xl }} />
    </Screen>
  );
}
