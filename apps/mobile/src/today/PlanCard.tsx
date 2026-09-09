/**
 * Today's plan — DESIGN.md §7.1: "today's plan (or 'Ask for a workout')".
 *
 * Offline this runs the rule-based planner (DESIGN.md §5.4) and stores the
 * result with `workouts.createPlanned`. The coach's own card slots in above
 * the button once phase 2 registers it.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { useVigorNavigation } from '../navigation';
import { usePlanToday, type TodayBundle } from '../data/today';
import { Button, ErrorBanner } from '../ui/components';
import { Body, Caption, Card, Numeral, WhyDisclosure } from '../ui/kit';
import { CoachPlanSlot, CoachQuickActionsSlot } from '../ui/slots';
import { space } from '../ui/tokens';

export function PlanCard({ bundle, onPlanned }: { bundle: TodayBundle; onPlanned: () => void }) {
  const nav = useVigorNavigation();
  const plan = usePlanToday();
  const [error, setError] = useState<string | null>(null);
  const card = bundle.view.workout;

  async function planNow() {
    setError(null);
    try {
      await plan.mutateAsync({
        deload: bundle.deloadAccepted
          ? {
              volumeMultiplier: bundle.deload.volumeMultiplier,
              loadMultiplier: bundle.deload.loadMultiplier,
            }
          : null,
      });
      onPlanned();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not draft a workout.');
    }
  }

  if (card.state === 'none') {
    return (
      <Card title="Nothing planned yet" subtitle={bundle.date}>
        <CoachPlanSlot date={bundle.date} onPlanned={onPlanned} />
        <Body muted>
          {bundle.view.safetyActive
            ? 'A safety event is open, so any plan holds your loads and drops a set.'
            : 'The offline planner picks your least recently trained pattern and carries your loads over.'}
        </Body>
        {error ? <ErrorBanner message={error} /> : null}
        <Button label="Plan today's workout" onPress={planNow} loading={plan.isPending} />
        <View style={{ marginTop: space.sm }}>
          <Button
            label="Build one by hand"
            variant="secondary"
            onPress={() => nav.openBuilder(bundle.date)}
          />
        </View>
      </Card>
    );
  }

  const done = card.state === 'completed';
  const live = card.state === 'planned' || card.state === 'in_progress';
  const workoutId = card.workoutId;

  return (
    <Card
      title={card.title ?? 'Today'}
      subtitle={`${card.exerciseCount} exercises · ${card.plannedDurationMin ?? 0} min planned`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
        <Numeral
          value={`${card.setsCompleted}/${card.setsPlanned}`}
          tone={done ? 'good' : 'default'}
        />
        <Caption>sets logged</Caption>
      </View>

      {card.state === 'skipped' ? <Body muted>Today&apos;s session was skipped.</Body> : null}

      <WhyDisclosure rationale={card.rationale} />

      {workoutId != null && live ? (
        <CoachQuickActionsSlot workoutId={workoutId} date={bundle.date} onAdjusted={onPlanned} />
      ) : null}

      {workoutId == null ? null : live ? (
        <>
          <Button
            label={card.state === 'in_progress' ? 'Continue session' : 'Start session'}
            onPress={() => nav.openSession(workoutId)}
          />
          <View style={{ marginTop: space.sm }}>
            <Button
              label="See the plan"
              variant="secondary"
              onPress={() => nav.openWorkout(workoutId)}
            />
          </View>
        </>
      ) : (
        <Button
          label="See the session"
          variant="secondary"
          onPress={() => nav.openWorkout(workoutId)}
        />
      )}
    </Card>
  );
}
