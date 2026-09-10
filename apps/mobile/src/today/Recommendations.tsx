/**
 * Plateau and deload recommendations, plus the open insight list —
 * DESIGN.md §5.3 ("Deload is proposed, not imposed ... the user accepts") and
 * §7.1 ("open insights").
 *
 * Accepting or dismissing writes an `insights` row so the answer survives a
 * restart, and an accepted deload is what makes the next plan lighter.
 */
import { View } from 'react-native';

import {
  useAnswerDeload,
  useAnswerPlateau,
  useDismissInsight,
  type PlateauCard,
  type TodayBundle,
} from '../data/today';
import { useVigorNavigation } from '../navigation';
import { TextAction } from '../ui/components';
import { Body, Caption, Card, EmptyState, SectionHeading, WhyDisclosure } from '../ui/kit';
import { space } from '../ui/tokens';

function AnswerRow({
  onAccept,
  onDismiss,
  acceptLabel,
  subject,
  busy,
}: {
  onAccept: () => void;
  onDismiss: () => void;
  acceptLabel: string;
  /** What is being accepted or put off, so "Not now" is not ambiguous. */
  subject: string;
  busy?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: space.xl, marginTop: space.md }}>
      <TextAction label={acceptLabel} busy={busy} onPress={onAccept} />
      <TextAction
        label="Not now"
        tone="muted"
        hint={`Leaves ${subject} as it is`}
        busy={busy}
        onPress={onDismiss}
      />
    </View>
  );
}

export function Recommendations({ bundle, onAnswered }: { bundle: TodayBundle; onAnswered: () => void }) {
  const answerDeload = useAnswerDeload();
  const answerPlateau = useAnswerPlateau();
  const dismissInsight = useDismissInsight();
  const nav = useVigorNavigation();

  const handled = new Set(bundle.handledPlateauExerciseIds);
  const plateaus = bundle.plateaus.filter((plateau) => !handled.has(plateau.exerciseId));
  const showDeload = bundle.deload.recommended && !bundle.deloadHandled;

  async function answerDeloadWith(accepted: boolean) {
    await answerDeload.mutateAsync({ accepted, recommendation: bundle.deload });
    onAnswered();
  }

  async function answerPlateauWith(plateau: PlateauCard, accepted: boolean) {
    await answerPlateau.mutateAsync({ accepted, plateau });
    onAnswered();
  }

  const insights = bundle.view.openInsights;

  return (
    <View>
      {showDeload ? (
        <Card title="A lighter week is worth taking" subtitle="Deload · proposed, not imposed">
          <Body>{bundle.deload.rationale.summary}</Body>
          <Caption>
            {`Accepting drops next session's volume to ${Math.round(
              bundle.deload.volumeMultiplier * 100,
            )} % and loads to ${Math.round(bundle.deload.loadMultiplier * 100)} %.`}
          </Caption>
          <WhyDisclosure rationale={bundle.deload.rationale} />
          <AnswerRow
            acceptLabel="Accept the deload"
            subject="next week's plan"
            busy={answerDeload.isPending}
            onAccept={() => void answerDeloadWith(true)}
            onDismiss={() => void answerDeloadWith(false)}
          />
        </Card>
      ) : null}

      {bundle.deloadAccepted ? (
        <Card>
          <Body muted>
            Deload accepted — the next plan comes back lighter until you ask for more.
          </Body>
        </Card>
      ) : null}

      {plateaus.map((plateau) => (
        <Card
          key={plateau.exerciseId}
          title={`${plateau.exerciseName} has stalled`}
          subtitle="Plateau detector"
        >
          <Body>{plateau.rationale.summary}</Body>
          {plateau.suggestions.map((suggestion, index) => {
            const swapId = suggestion.kind === 'variation_swap' ? suggestion.exerciseId : null;
            return (
              <View key={`${suggestion.kind}-${index}`} style={{ marginTop: space.sm }}>
                <Caption>{suggestion.detail}</Caption>
                {swapId ? (
                  <TextAction
                    label="See the variation"
                    hint={suggestion.detail}
                    onPress={() => nav.openExercise(swapId)}
                  />
                ) : null}
              </View>
            );
          })}
          <WhyDisclosure rationale={plateau.rationale} />
          <AnswerRow
            acceptLabel="Change something"
            subject={plateau.exerciseName}
            busy={answerPlateau.isPending}
            onAccept={() => void answerPlateauWith(plateau, true)}
            onDismiss={() => void answerPlateauWith(plateau, false)}
          />
        </Card>
      ))}

      <SectionHeading>Insights</SectionHeading>
      {insights.length === 0 ? (
        <EmptyState
          title="Nothing to flag"
          blurb="Detectors run as your history grows — trends, balance, consistency."
        />
      ) : (
        insights.map((insight, index) => {
          const id = 'id' in insight ? insight.id : null;
          return (
            <Card key={id ?? `${insight.detector}-${index}`} title={insight.headline}>
              <Body muted>{insight.detail}</Body>
              {id ? (
                <View style={{ marginTop: space.md }}>
                  <TextAction
                    label="Dismiss"
                    tone="muted"
                    hint={`Hides "${insight.headline}"`}
                    onPress={() => {
                      dismissInsight.mutate(id);
                      onAnswered();
                    }}
                  />
                </View>
              ) : null}
            </Card>
          );
        })
      )}
    </View>
  );
}
