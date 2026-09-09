/**
 * Daily nutrition targets — DESIGN.md §5.6.
 *
 * "Use recommended" runs the core Mifflin-St Jeor default and shows its
 * rationale; it needs height and weight, and says so plainly when they are
 * missing. Manual numbers never overwrite history: every change writes a new
 * `nutrition_targets` row effective from today.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import {
  computeInitialNutritionTargets,
  queryKeys,
  type NutritionTargets,
  type Rationale,
} from '@vigor/core';

import { useInvalidator } from '../data/queries';
import { usePlatform, useRepos } from '../db/AppDataProvider';
import {
  Button,
  ErrorBanner,
  LoadingScreen,
  Screen,
  ScreenBlurb,
  ScreenTitle,
} from '../ui/components';
import {
  ActionRow,
  Body,
  Caption,
  Card,
  CardTitle,
  DataRow,
  EmptyState,
  InlineAction,
  Note,
  NumberField,
  ErrorScreen,
} from '../ui/primitives';

interface TargetDraft {
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
}

const EMPTY: TargetDraft = { kcal: '', proteinG: '', carbsG: '', fatG: '', fiberG: '' };

function draftOf(targets: NutritionTargets | null): TargetDraft {
  if (!targets) return EMPTY;
  return {
    kcal: String(targets.kcal),
    proteinG: String(targets.proteinG),
    carbsG: String(targets.carbsG),
    fatG: String(targets.fatG),
    fiberG: String(targets.fiberG),
  };
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

interface TargetValues {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export function TargetsScreen({ onNavigate }: { onNavigate: (path: string) => void }) {
  const repos = useRepos();
  const { clock } = usePlatform();
  const invalidate = useInvalidator();
  const today = clock.today();

  const [draft, setDraft] = useState<TargetDraft | null>(null);
  const [recommendation, setRecommendation] = useState<Rationale | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = useQuery({
    queryKey: queryKeys.nutritionTargets(),
    queryFn: async () => {
      const [active, history, profile, goals] = await Promise.all([
        repos.targets.getActive(today),
        repos.targets.list(),
        repos.profile.get(),
        repos.goals.listActive(),
      ]);
      return { active, history, profile, goals };
    },
  });

  /**
   * History is effective-dated, never overwritten — but a second change on the
   * same day is not history, it is the same decision being corrected. Writing a
   * new row for today would leave two rows sharing one `effectiveFrom`, and
   * `getActive` would pick between them arbitrarily, so today's row is updated
   * in place and any earlier day keeps the numbers it was judged against.
   */
  async function writeTargets(input: TargetValues, source: 'user' | 'computed'): Promise<void> {
    const values: TargetValues = {
      kcal: input.kcal,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
      fiberG: input.fiberG,
    };
    const current = await repos.targets.getActive(today);
    if (current && current.effectiveFrom === today) {
      await repos.targets.update(current.id, { ...values, source });
      return;
    }
    await repos.targets.create({ ...values, effectiveFrom: today, source });
  }

  async function useRecommended(): Promise<void> {
    if (!state.data?.profile) {
      setError('Fill in your profile first — the recommendation is built from it.');
      return;
    }
    const result = computeInitialNutritionTargets({
      profile: state.data.profile,
      goals: state.data.goals,
      date: today,
    });
    setRecommendation(result.rationale);
    if (!result.targets) return;

    setBusy(true);
    setError(null);
    try {
      await writeTargets(result.targets, 'computed');
      invalidate('saveNutritionTargets');
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveManual(): Promise<void> {
    if (!draft) return;
    const values = {
      kcal: toNumber(draft.kcal),
      proteinG: toNumber(draft.proteinG),
      carbsG: toNumber(draft.carbsG),
      fatG: toNumber(draft.fatG),
      fiberG: toNumber(draft.fiberG),
    };
    if (values.kcal <= 0) {
      setError('A calorie target above zero is needed before the rest means anything.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await writeTargets(values, 'user');
      invalidate('saveNutritionTargets');
      setDraft(null);
      setRecommendation(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (state.isPending) return <LoadingScreen label="Loading targets…" />;
  if (state.error)
    return <ErrorScreen message={`Could not load targets: ${state.error.message}`} />;

  const active = state.data?.active ?? null;
  const profile = state.data?.profile ?? null;
  const missingBody = profile == null || profile.heightCm == null || profile.weightKg == null;

  return (
    <Screen>
      <ScreenTitle>Targets</ScreenTitle>
      <ScreenBlurb>
        What a day should add up to. Change them whenever you like — the old numbers stay in the
        history, so past days keep being judged against what was true at the time.
      </ScreenBlurb>

      {error ? <ErrorBanner message={error} /> : null}

      {active ? (
        <Card>
          <CardTitle>In force today</CardTitle>
          <Caption>{`Effective from ${active.effectiveFrom} · ${
            active.source === 'computed' ? 'recommended by the engine' : 'set by you'
          }`}</Caption>
          <DataRow label="Calories" value={`${active.kcal} kcal`} />
          <DataRow label="Protein" value={`${active.proteinG} g`} />
          <DataRow label="Carbs" value={`${active.carbsG} g`} />
          <DataRow label="Fat" value={`${active.fatG} g`} />
          <DataRow label="Fiber" value={`${active.fiberG} g`} />
          <ActionRow>
            <InlineAction label="Change these numbers" onPress={() => setDraft(draftOf(active))} />
          </ActionRow>
        </Card>
      ) : (
        <EmptyState
          title="No targets set"
          detail="Use the recommendation below, or type your own. Until then the day log shows what you ate without a comparison."
        />
      )}

      <Card>
        <CardTitle>Use recommended</CardTitle>
        <Body>
          Mifflin-St Jeor for your basal rate, multiplied by your activity level and adjusted for
          your top goal. Protein 1.8 g per kg, fat a quarter of calories, carbs the rest, fiber 14 g
          per 1000 kcal.
        </Body>
        {missingBody ? (
          <View>
            <Note tone="warn">
              Height and weight are needed before calories can be estimated. Add them in You →
              Profile and come back.
            </Note>
            <ActionRow>
              <InlineAction label="Open profile" onPress={() => onNavigate('/you/profile')} />
            </ActionRow>
          </View>
        ) : (
          <Button
            label="Use recommended targets"
            onPress={() => void useRecommended()}
            loading={busy}
          />
        )}
        {recommendation ? <Note>{recommendation.summary}</Note> : null}
      </Card>

      <Card>
        <CardTitle>Your own numbers</CardTitle>
        {draft ? (
          <View>
            <NumberField
              label="Calories"
              suffix="kcal"
              value={draft.kcal}
              onChangeText={(kcal) => setDraft({ ...draft, kcal })}
            />
            <NumberField
              label="Protein"
              suffix="g"
              value={draft.proteinG}
              onChangeText={(proteinG) => setDraft({ ...draft, proteinG })}
            />
            <NumberField
              label="Carbs"
              suffix="g"
              value={draft.carbsG}
              onChangeText={(carbsG) => setDraft({ ...draft, carbsG })}
            />
            <NumberField
              label="Fat"
              suffix="g"
              value={draft.fatG}
              onChangeText={(fatG) => setDraft({ ...draft, fatG })}
            />
            <NumberField
              label="Fiber"
              suffix="g"
              value={draft.fiberG}
              onChangeText={(fiberG) => setDraft({ ...draft, fiberG })}
            />
            <Button label="Save targets" onPress={() => void saveManual()} loading={busy} />
            <Button label="Cancel" variant="secondary" onPress={() => setDraft(null)} />
          </View>
        ) : (
          <Button
            label="Set targets by hand"
            variant="secondary"
            onPress={() => setDraft(draftOf(active))}
          />
        )}
      </Card>

      {state.data && state.data.history.length > 1 ? (
        <Card>
          <CardTitle>History</CardTitle>
          {state.data.history.map((row) => (
            <DataRow
              key={row.id}
              label={row.effectiveFrom}
              value={`${row.kcal} kcal · ${row.proteinG} g protein`}
              hint={row.source === 'computed' ? 'recommended' : 'set by you'}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
