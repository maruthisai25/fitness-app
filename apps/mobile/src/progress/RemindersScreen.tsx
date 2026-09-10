/**
 * Reminder settings — DESIGN.md §7.3 and the six types of `idea.md` §24.
 *
 * Six local notifications, each with a time and each with a rule that can keep
 * it quiet: the workout reminder skips a day you already trained, the
 * missed-workout follow-up only looks at yesterday, the meal-log reminder skips
 * if you logged in the last three hours, the protein reminder only fires after
 * 18:00 with more than 40 g left, the weekly review fires on the day your week
 * starts, and the measurement nudge waits a fortnight after your last one.
 *
 * The rules live in `packages/core/reminders`; this screen edits the times and
 * shows each rule's own explanation of what it decided.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import {
  WEEKDAY_NAMES,
  decideReminders,
  isLocalTime,
  queryKeys,
  type LocalTime,
  type ReminderKind,
  type ReminderTimes,
  type WeekDay,
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
  TextField,
  ToggleRow,
} from '../ui/components';
import {
  ActionRow,
  Caption,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  DataRow,
  InlineAction,
  Note,
  ErrorScreen,
} from '../ui/primitives';
import { cancelAllReminders, readReminderState, syncReminders } from './reminders';

const REMINDER_FIELDS: {
  key: keyof ReminderTimes;
  kind: ReminderKind;
  label: string;
  hint: string;
}[] = [
  {
    key: 'workout',
    kind: 'workout',
    label: 'Workout',
    hint: 'Stays quiet on a day you have already finished a session.',
  },
  {
    key: 'missedWorkout',
    kind: 'missed_workout',
    label: 'Missed workout',
    hint: 'The morning after a session you skipped or abandoned. Once, for yesterday only.',
  },
  {
    key: 'mealLog',
    kind: 'meal_log',
    label: 'Meal log',
    hint: 'Stays quiet if you logged anything in the last three hours.',
  },
  {
    key: 'protein',
    kind: 'protein',
    label: 'Protein',
    hint: 'Never before 18:00, and only when more than 40 g is still left.',
  },
  {
    key: 'weeklyReview',
    kind: 'weekly_review',
    label: 'Weekly review',
    hint: 'Fires on your review day, once the previous week is ready and unread.',
  },
  {
    key: 'measurement',
    kind: 'measurement',
    label: 'Progress measurement',
    hint: 'Due once a fortnight has passed since your last weight or tape measurement.',
  },
];

export function RemindersScreen() {
  const repos = useRepos();
  const { clock, notifications } = usePlatform();
  const invalidate = useInvalidator();
  const today = clock.today();

  const [drafts, setDrafts] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const state = useQuery({
    queryKey: [...queryKeys.settings(), 'reminders', today],
    queryFn: async () => {
      // Reading only: scheduling happens in the handlers below and on
      // foreground, never as a side effect of rendering.
      const reminderState = await readReminderState(repos, { today });
      return { settings: reminderState.settings, decisions: decideReminders(reminderState) };
    },
  });

  const settings = state.data?.settings ?? null;
  const times =
    drafts ??
    Object.fromEntries(
      REMINDER_FIELDS.map((field) => [field.key, settings?.reminderTimes[field.key] ?? '']),
    );

  async function saveTimes(): Promise<void> {
    const next: ReminderTimes = {
      workout: null,
      missedWorkout: null,
      mealLog: null,
      protein: null,
      weeklyReview: null,
      measurement: null,
    };
    for (const field of REMINDER_FIELDS) {
      const raw = (times[field.key] ?? '').trim();
      if (raw.length === 0) continue;
      if (!isLocalTime(raw)) {
        setError(
          `${field.label} needs a 24-hour time like 07:30, or leave it blank to turn it off.`,
        );
        return;
      }
      next[field.key] = raw as LocalTime;
    }

    setBusy(true);
    setError(null);
    try {
      await repos.settings.set('reminderTimes', next);
      invalidate('saveSettings');
      const reminderState = await readReminderState(repos, { today });
      await syncReminders(notifications, reminderState);
      setDrafts(null);
      setStatus('Saved and rescheduled.');
      await state.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function setEnabled(enabled: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        const granted = await notifications.requestPermission();
        if (!granted) {
          setError('Your device refused notification permission, so nothing can be scheduled.');
          return;
        }
      }
      await repos.settings.set('notificationsEnabled', enabled);
      invalidate('saveSettings');
      if (enabled) {
        const reminderState = await readReminderState(repos, { today });
        await syncReminders(notifications, reminderState);
      } else {
        await cancelAllReminders(notifications);
      }
      setStatus(enabled ? 'Reminders are on.' : 'Reminders are off and everything is cancelled.');
      await state.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function setWeekStart(day: WeekDay): Promise<void> {
    setBusy(true);
    try {
      await repos.settings.set('weekStartsOn', day);
      invalidate('saveSettings');
      const reminderState = await readReminderState(repos, { today });
      await syncReminders(notifications, reminderState);
      await state.refetch();
    } finally {
      setBusy(false);
    }
  }

  /** `null` puts the review back on the day the week starts. */
  async function setReviewDay(day: WeekDay | null): Promise<void> {
    setBusy(true);
    try {
      await repos.settings.set('weeklyReviewDay', day);
      invalidate('saveSettings');
      const reminderState = await readReminderState(repos, { today });
      await syncReminders(notifications, reminderState);
      await state.refetch();
    } finally {
      setBusy(false);
    }
  }

  if (state.isPending) return <LoadingScreen label="Loading reminders…" />;
  if (state.error)
    return <ErrorScreen message={`Could not load reminders: ${state.error.message}`} />;
  if (!settings) return <ErrorScreen message="Settings did not load." />;

  return (
    <Screen>
      <ScreenTitle>Reminders</ScreenTitle>
      <ScreenBlurb>
        Local notifications only — nothing is scheduled on a server, and each one has a rule that
        keeps it quiet when it would be nagging you about something you already did.
      </ScreenBlurb>

      {error ? <ErrorBanner message={error} /> : null}
      {status ? <Note tone="good">{status}</Note> : null}

      <Card>
        <CardTitle>Notifications</CardTitle>
        <ToggleRow
          label="Send reminders"
          hint={
            notifications.supportsBackgroundDelivery()
              ? 'These arrive with the screen off.'
              : 'On this platform they only arrive while the app is open.'
          }
          value={settings.notificationsEnabled}
          onValueChange={(value) => void setEnabled(value)}
        />
      </Card>

      <Card>
        <CardTitle>Times</CardTitle>
        <Caption>24-hour clock. Leave one blank to turn that reminder off.</Caption>
        {REMINDER_FIELDS.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            hint={field.hint}
            placeholder="07:30"
            value={times[field.key] ?? ''}
            onChangeText={(value) => setDrafts({ ...times, [field.key]: value })}
          />
        ))}
        <Button label="Save times" onPress={() => void saveTimes()} loading={busy} />
        {drafts ? (
          <ActionRow>
            <InlineAction label="Discard changes" tone="bad" onPress={() => setDrafts(null)} />
          </ActionRow>
        ) : null}
      </Card>

      <Card>
        <CardTitle>Week starts on</CardTitle>
        <Caption>
          Where every week boundary falls: the weekly review covers the week that ends here, and the
          Progress charts are grouped by it.
        </Caption>
        <ChipRow>
          {WEEKDAY_NAMES.map((name, index) => (
            <Chip
              key={name}
              label={name.slice(0, 3)}
              selected={settings.weekStartsOn === index}
              onPress={() => void setWeekStart(index as WeekDay)}
            />
          ))}
        </ChipRow>
      </Card>

      <Card>
        <CardTitle>Weekly review day</CardTitle>
        <Caption>
          The day the review is built and the reminder fires. Left on &ldquo;week start&rdquo; it
          follows the day above, which is the moment the previous week is complete.
        </Caption>
        <ChipRow>
          <Chip
            label="Week start"
            selected={settings.weeklyReviewDay == null}
            onPress={() => void setReviewDay(null)}
          />
          {WEEKDAY_NAMES.map((name, index) => (
            <Chip
              key={name}
              label={name.slice(0, 3)}
              selected={settings.weeklyReviewDay === index}
              onPress={() => void setReviewDay(index as WeekDay)}
            />
          ))}
        </ChipRow>
      </Card>

      <Card>
        <CardTitle>What each rule decided</CardTitle>
        <Caption>Recomputed every time the app comes to the front.</Caption>
        {(state.data?.decisions ?? []).map((decision) => (
          <View key={decision.kind}>
            <DataRow
              label={
                REMINDER_FIELDS.find((field) => field.kind === decision.kind)?.label ??
                decision.kind
              }
              value={
                decision.scheduledFor == null
                  ? 'off'
                  : decision.fires
                    ? `due now (${decision.scheduledFor})`
                    : decision.scheduledFor
              }
              tone={decision.scheduledFor == null ? 'neutral' : decision.fires ? 'accent' : 'good'}
            />
            <Caption>{decision.rationale.summary}</Caption>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
