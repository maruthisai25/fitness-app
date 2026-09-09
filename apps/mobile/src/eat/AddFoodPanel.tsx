/**
 * Adding food — DESIGN.md §7.1 "Eat", §6.4 "food parsing".
 *
 * Three ways in, all writing the same `food_logs` + `food_items` rows:
 *
 *  1. Describe it in your own words. The gateway estimates, and nothing is
 *     written until you confirm the parsed items and their confidence.
 *  2. Enter one item by hand — always available, coach or no coach.
 *  3. Log a saved meal in one tap, which also bumps its `timesLogged`.
 *
 * With no coach connected the description box still works: the log is stored
 * with `estimationStatus: 'pending'` and an `estimate_food` job is queued, so
 * the day view shows "estimating…" instead of losing what you typed
 * (DESIGN.md §6.4, §8).
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  queryKeys,
  type FoodItemDraft,
  type FoodLogWithItems,
  type LocalDate,
  type MealSlot,
  type SavedMeal,
} from '@vigor/core';

import { isAiUnavailable, type AiGateway } from '../ai/gateway';
import { useAiGateway } from '../ai/useAiGateway';
import { useInvalidator } from '../data/queries';
import type { AppRepos } from '../db/AppDataProvider';
import { Button, ErrorBanner, TextField } from '../ui/components';
import {
  ActionRow,
  Body,
  Caption,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  EmptyState,
  InlineAction,
  ItemRow,
  Note,
  NumberField,
} from '../ui/primitives';
import { color, fontSize, space } from '../ui/tokens';
import { MEAL_SLOT_LABEL, MEAL_SLOTS, itemQuantityLabel, macroBreakdown, sumDrafts } from './model';

type Mode = 'describe' | 'manual' | 'saved';

const MODE_LABEL: Record<Mode, string> = {
  describe: 'Describe it',
  manual: 'Enter by hand',
  saved: 'Saved meals',
};

interface ManualDraft {
  name: string;
  quantity: string;
  unit: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
}

const EMPTY_MANUAL: ManualDraft = {
  name: '',
  quantity: '1',
  unit: 'serving',
  kcal: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
  fiberG: '',
};

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface AddFoodPanelProps {
  repos: AppRepos;
  /** The day the log lands on. */
  date: LocalDate;
  /** `profile.foodRegion`, so Indian staples are known when it is `IN`. */
  region: string;
  initialSlot?: MealSlot;
  /** Overrides the installed gateway — the component tests inject a fake. */
  gateway?: AiGateway;
  onLogged?: (log: FoodLogWithItems) => void;
}

export function AddFoodPanel({
  repos,
  date,
  region,
  initialSlot = 'breakfast',
  gateway: gatewayOverride,
  onLogged,
}: AddFoodPanelProps) {
  const installedGateway = useAiGateway();
  const gateway = gatewayOverride ?? installedGateway;
  const invalidate = useInvalidator();

  const [mode, setMode] = useState<Mode>('describe');
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<FoodItemDraft[] | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [manual, setManual] = useState<ManualDraft>(EMPTY_MANUAL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const savedMeals = useQuery({
    queryKey: queryKeys.savedMeals(),
    queryFn: () => repos.savedMeals.list(),
  });

  const coachConnected = gateway.isAvailable();

  async function writeLog(input: {
    source: 'ai' | 'manual' | 'saved_meal';
    rawText: string;
    items: FoodItemDraft[];
    estimationStatus?: 'final' | 'pending' | 'failed';
  }): Promise<FoodLogWithItems> {
    const log = await repos.nutrition.createLog({
      date,
      mealSlot: slot,
      rawText: input.rawText,
      source: input.source,
      estimationStatus: input.estimationStatus ?? 'final',
      items: input.items,
    });
    invalidate('logFood');
    onLogged?.(log);
    return log;
  }

  async function queueForCoach(): Promise<void> {
    const raw = text.trim();
    if (raw.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const log = await writeLog({
        source: 'ai',
        rawText: raw,
        items: [],
        estimationStatus: 'pending',
      });
      await repos.aiJobs.enqueue({
        id: `estimate_food:${log.id}`,
        kind: 'estimate_food',
        payload: { foodLogId: log.id, text: raw, region, date },
        resultRef: log.id,
      });
      invalidate('enqueueAiJob');
      setText('');
      setStatus('Saved as “estimating…”. The coach fills in the macros next time it connects.');
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : String(queueError));
    } finally {
      setBusy(false);
    }
  }

  async function estimate(): Promise<void> {
    const raw = text.trim();
    if (raw.length === 0) {
      setError('Type what you ate first — for example “two rotis, dal and a bowl of curd”.');
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const parsed = await gateway.parseFood({ text: raw, region });
      if (parsed.length === 0) {
        setError(
          'The coach could not find any food in that. Try naming the dishes, or enter it by hand.',
        );
        return;
      }
      setDrafts(parsed);
      setExcluded(new Set());
    } catch (parseError) {
      setError(
        isAiUnavailable(parseError)
          ? parseError.message
          : `Estimating failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDrafts(): Promise<void> {
    if (!drafts) return;
    const chosen = drafts.filter((_, index) => !excluded.has(index));
    if (chosen.length === 0) {
      setError('Keep at least one item, or discard the estimate.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await writeLog({ source: 'ai', rawText: text.trim(), items: chosen });
      setDrafts(null);
      setExcluded(new Set());
      setText('');
      setStatus(
        `Logged ${chosen.length} item${chosen.length === 1 ? '' : 's'} to ${MEAL_SLOT_LABEL[slot].toLowerCase()}.`,
      );
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : String(writeError));
    } finally {
      setBusy(false);
    }
  }

  async function addManual(): Promise<void> {
    const name = manual.name.trim();
    if (name.length === 0) {
      setError('Give the item a name so you recognise it in the day log.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const item: FoodItemDraft = {
        name,
        quantity: toNumber(manual.quantity) || 1,
        unit: manual.unit.trim() || 'serving',
        kcal: toNumber(manual.kcal),
        proteinG: toNumber(manual.proteinG),
        carbsG: toNumber(manual.carbsG),
        fatG: toNumber(manual.fatG),
        fiberG: toNumber(manual.fiberG),
        confidence: 1,
        savedMealId: null,
      };
      await writeLog({ source: 'manual', rawText: name, items: [item] });
      setManual(EMPTY_MANUAL);
      setStatus(`Added ${name} to ${MEAL_SLOT_LABEL[slot].toLowerCase()}.`);
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : String(writeError));
    } finally {
      setBusy(false);
    }
  }

  async function logSavedMeal(meal: SavedMeal): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await writeLog({
        source: 'saved_meal',
        rawText: meal.name,
        items: meal.items.map((item) => ({ ...item, savedMealId: meal.id })),
      });
      await repos.savedMeals.markLogged(meal.id);
      invalidate('saveMeal');
      setStatus(`Logged ${meal.name}.`);
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : String(writeError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <ChipRow>
        {(Object.keys(MODE_LABEL) as Mode[]).map((option) => (
          <Chip
            key={option}
            label={MODE_LABEL[option]}
            selected={mode === option}
            onPress={() => {
              setMode(option);
              setError(null);
              setStatus(null);
            }}
          />
        ))}
      </ChipRow>

      <Text style={styles.slotLabel}>Meal</Text>
      <ChipRow>
        {MEAL_SLOTS.map((option) => (
          <Chip
            key={option}
            label={MEAL_SLOT_LABEL[option]}
            selected={slot === option}
            onPress={() => setSlot(option)}
          />
        ))}
      </ChipRow>

      {error ? <ErrorBanner message={error} /> : null}
      {status ? <Note tone="good">{status}</Note> : null}

      {mode === 'describe' ? (
        <View>
          <TextField
            label="What did you eat?"
            hint="Plain words are fine — quantities help the estimate."
            multiline
            numberOfLines={3}
            placeholder="Two rotis, dal, a bowl of curd"
            value={text}
            onChangeText={setText}
            style={styles.multiline}
          />

          {coachConnected ? (
            <Button
              label={busy ? 'Estimating…' : 'Estimate macros'}
              onPress={() => void estimate()}
              loading={busy}
            />
          ) : (
            <View>
              <Note tone="warn">
                The coach is not connected, so nothing can be estimated right now. Connect it in You
                → Settings, save this for later, or enter the item by hand.
              </Note>
              <Button
                label="Save it for the coach"
                onPress={() => void queueForCoach()}
                loading={busy}
              />
              <Button
                label="Enter by hand instead"
                variant="secondary"
                onPress={() => setMode('manual')}
              />
            </View>
          )}

          {drafts ? (
            <Card>
              <CardTitle>Confirm what gets logged</CardTitle>
              <Caption>
                Tap an item to leave it out. Confidence is the coach&apos;s own estimate.
              </Caption>
              {drafts.map((item, index) => {
                const dropped = excluded.has(index);
                return (
                  <ItemRow
                    key={`${item.name}-${index}`}
                    title={dropped ? `${item.name} (left out)` : item.name}
                    subtitle={`${itemQuantityLabel(item)} · ${macroBreakdown(item)} · ${Math.round(
                      item.confidence * 100,
                    )}% confident`}
                    value={`${Math.round(item.kcal)} kcal`}
                    tone={dropped ? 'neutral' : 'accent'}
                    onPress={() =>
                      setExcluded((current) => {
                        const next = new Set(current);
                        if (next.has(index)) next.delete(index);
                        else next.add(index);
                        return next;
                      })
                    }
                  />
                );
              })}
              <Body>
                {`Adds ${Math.round(
                  sumDrafts(drafts.filter((_, index) => !excluded.has(index))).kcal,
                )} kcal to ${MEAL_SLOT_LABEL[slot].toLowerCase()}.`}
              </Body>
              <ActionRow>
                <InlineAction
                  label={`Log ${drafts.length - excluded.size} items`}
                  onPress={() => void confirmDrafts()}
                  disabled={busy}
                />
                <InlineAction
                  label="Discard estimate"
                  tone="bad"
                  onPress={() => {
                    setDrafts(null);
                    setExcluded(new Set());
                  }}
                />
              </ActionRow>
            </Card>
          ) : null}
        </View>
      ) : null}

      {mode === 'manual' ? (
        <View>
          <TextField
            label="Item"
            placeholder="Paneer bhurji"
            value={manual.name}
            onChangeText={(name) => setManual((current) => ({ ...current, name }))}
          />
          <View style={styles.pair}>
            <View style={styles.pairCell}>
              <NumberField
                label="Quantity"
                value={manual.quantity}
                onChangeText={(quantity) => setManual((current) => ({ ...current, quantity }))}
              />
            </View>
            <View style={styles.pairCell}>
              <TextField
                label="Unit"
                placeholder="bowl"
                value={manual.unit}
                onChangeText={(unit) => setManual((current) => ({ ...current, unit }))}
              />
            </View>
          </View>
          <View style={styles.pair}>
            <View style={styles.pairCell}>
              <NumberField
                label="Calories"
                suffix="kcal"
                value={manual.kcal}
                onChangeText={(kcal) => setManual((current) => ({ ...current, kcal }))}
              />
            </View>
            <View style={styles.pairCell}>
              <NumberField
                label="Protein"
                suffix="g"
                value={manual.proteinG}
                onChangeText={(proteinG) => setManual((current) => ({ ...current, proteinG }))}
              />
            </View>
          </View>
          <View style={styles.pair}>
            <View style={styles.pairCell}>
              <NumberField
                label="Carbs"
                suffix="g"
                value={manual.carbsG}
                onChangeText={(carbsG) => setManual((current) => ({ ...current, carbsG }))}
              />
            </View>
            <View style={styles.pairCell}>
              <NumberField
                label="Fat"
                suffix="g"
                value={manual.fatG}
                onChangeText={(fatG) => setManual((current) => ({ ...current, fatG }))}
              />
            </View>
          </View>
          <NumberField
            label="Fiber"
            suffix="g"
            value={manual.fiberG}
            onChangeText={(fiberG) => setManual((current) => ({ ...current, fiberG }))}
          />
          <Button label="Add item" onPress={() => void addManual()} loading={busy} />
        </View>
      ) : null}

      {mode === 'saved' ? (
        <View>
          {savedMeals.data && savedMeals.data.length > 0 ? (
            savedMeals.data.map((meal) => (
              <ItemRow
                key={meal.id}
                title={meal.name}
                subtitle={`${Math.round(meal.kcal)} kcal · ${Math.round(
                  meal.proteinG,
                )} g protein · logged ${meal.timesLogged}×`}
                right={
                  <InlineAction
                    label="Log it"
                    onPress={() => void logSavedMeal(meal)}
                    disabled={busy}
                  />
                }
              />
            ))
          ) : (
            <EmptyState
              title="No saved meals yet"
              detail="Log something, then tap “Save as meal” on it in the day view. After that it is one tap to log again."
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slotLabel: {
    color: color.textMuted,
    fontSize: fontSize.label,
    marginTop: space.lg,
  },
  multiline: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  pair: {
    flexDirection: 'row',
    gap: space.md,
  },
  pairCell: {
    flex: 1,
  },
});
