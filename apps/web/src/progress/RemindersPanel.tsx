/**
 * Progress → Reminders. DESIGN.md §7.3 owns the rules; this screen only chooses
 * the times and shows what the engine decided.
 *
 * DESIGN.md §7.4 is blunt about the web adapter — "Web Notifications only when
 * the tab is open; the settings page says so" — and so is this page.
 */

import {
  decideReminders,
  weekdayName,
  type LocalDate,
  type LocalTime,
  type ReminderDecision,
  type ReminderKind,
  type WeekDay,
} from '@vigor/core';
import { space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { Field, PrimaryButton, Select } from '../components/form';
import { Card, EmptyState, Notice, Pill, Section } from '../components/ui';
import { useDb } from '../db/provider';
import { webClock } from '../platform/clock';
import { webNotifications } from '../platform/notifications';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { loadReminderState, localTimeNow, syncReminders } from './foreground';

const KIND_LABEL: Record<ReminderKind, string> = {
  workout: 'Workout',
  meal_log: 'Meal log',
  protein: 'Protein',
  weekly_review: 'Weekly review',
};

const KIND_RULE: Record<ReminderKind, string> = {
  workout: 'Stays quiet once a workout is completed today.',
  meal_log: 'Stays quiet if you logged a meal in the last 3 hours.',
  protein: 'Fires only after 18:00, and only if more than 40 g of protein is still left.',
  weekly_review: 'Fires on your week-start day, once, until that week’s review exists.',
};

type TimeKey = 'workout' | 'mealLog' | 'protein' | 'weeklyReview';

const TIME_FIELDS: { key: TimeKey; kind: ReminderKind; label: string }[] = [
  { key: 'workout', kind: 'workout', label: 'Workout reminder' },
  { key: 'mealLog', kind: 'meal_log', label: 'Meal-log reminder' },
  { key: 'protein', kind: 'protein', label: 'Protein reminder' },
  { key: 'weeklyReview', kind: 'weekly_review', label: 'Weekly review reminder' },
];

const WEEKDAYS: WeekDay[] = [0, 1, 2, 3, 4, 5, 6];

export function RemindersPanel({ today }: { today: LocalDate }): ReactNode {
  const { repos, settings, refreshSettings } = useDb();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'unsupported' | 'unknown'>(
    'unknown',
  );
  const [decisions, setDecisions] = useState<ReminderDecision[]>([]);

  useEffect(() => {
    void webNotifications.hasPermission().then((granted) => {
      if (typeof Notification === 'undefined') setPermission('unsupported');
      else setPermission(granted ? 'granted' : 'denied');
    });
  }, []);

  // The preview must answer the same question the scheduler does, from the same
  // rows: `loadReminderState` is the one place those inputs are assembled.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = await loadReminderState(repos, settings, today, localTimeNow());
      if (!cancelled) setDecisions(decideReminders(state));
    })();
    return () => {
      cancelled = true;
    };
  }, [repos, settings, today]);

  async function setTime(key: TimeKey, value: string): Promise<void> {
    setBusy(true);
    try {
      const next: LocalTime | null = value.length === 0 ? null : value;
      await repos.settings.set('reminderTimes', { ...settings.reminderTimes, [key]: next });
      await refreshSettings();
      setNote('Saved.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleNotifications(): Promise<void> {
    setBusy(true);
    try {
      const next = !settings.notificationsEnabled;
      if (next) {
        const granted = await webNotifications.requestPermission();
        setPermission(granted ? 'granted' : 'denied');
      } else {
        await webNotifications.cancelAll();
      }
      await repos.settings.set('notificationsEnabled', next);
      await refreshSettings();
    } finally {
      setBusy(false);
    }
  }

  async function setReviewDay(value: string): Promise<void> {
    setBusy(true);
    try {
      await repos.settings.set('weekStartsOn', Number(value) as WeekDay);
      await refreshSettings();
      setNote('Saved.');
    } finally {
      setBusy(false);
    }
  }

  async function rescheduleNow(): Promise<void> {
    setBusy(true);
    try {
      const result = await syncReminders(repos, settings, today, localTimeNow());
      setDecisions(result.decisions);
      setNote(
        `${result.scheduled.length} reminder${result.scheduled.length === 1 ? '' : 's'} scheduled, ` +
          `${result.cancelled.length} cancelled.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Notice tone="warn">
        <strong>Reminders on the web only fire while this tab is open.</strong> A browser gives a
        page no way to wake itself up, so if you close VigorEngine nothing will arrive until you
        open it again. The mobile app schedules the same reminders with the operating system, which
        does fire with the screen off.
      </Notice>

      <Section title="Notifications" style={{ marginTop: space.xl }}>
        <Card>
          <p style={{ margin: `0 0 ${space.md}px`, color: themeColor.text }}>
            Currently{' '}
            <strong>{settings.notificationsEnabled ? 'on' : 'off'}</strong>
            {permission === 'denied' && settings.notificationsEnabled && (
              <>
                {' '}
                — but this browser has blocked notifications for the site, so nothing can be shown
                until you allow them again in your browser settings.
              </>
            )}
            {permission === 'unsupported' && ' — this browser has no Notification API at all.'}
          </p>
          <PrimaryButton onClick={() => void toggleNotifications()} disabled={busy}>
            {settings.notificationsEnabled ? 'Turn reminders off' : 'Turn reminders on'}
          </PrimaryButton>
        </Card>
      </Section>

      <Section title="Times">
        <Card>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: space.md,
            }}
          >
            {TIME_FIELDS.map((field) => (
              <Field key={field.key} label={field.label} hint={KIND_RULE[field.kind]}>
                <input
                  type="time"
                  aria-label={field.label}
                  value={settings.reminderTimes[field.key] ?? ''}
                  onChange={(event) => void setTime(field.key, event.target.value)}
                  disabled={busy}
                  className="tabular"
                  style={{
                    width: '100%',
                    padding: `${space.sm}px ${space.md}px`,
                    borderRadius: 6,
                    border: `1px solid ${themeColor.border}`,
                    background: themeColor.surface,
                    color: themeColor.text,
                    fontSize: fontSize.body,
                  }}
                />
              </Field>
            ))}
          </div>
          <div style={{ maxWidth: 240 }}>
            <Field
              label="Review day"
              hint="Your week starts on this day, and the weekly review lands on it."
            >
              <Select value={String(settings.weekStartsOn)} onChange={(value) => void setReviewDay(value)}>
                {WEEKDAYS.map((day) => (
                  <option key={day} value={String(day)}>
                    {weekdayName(day)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {note && (
            <p style={{ color: themeColor.good, fontSize: fontSize.label }} role="status">
              {note}
            </p>
          )}
        </Card>
      </Section>

      <Section
        title="What stands right now"
        action={
          <PrimaryButton onClick={() => void rescheduleNow()} disabled={busy}>
            Reschedule
          </PrimaryButton>
        }
      >
        {decisions.length === 0 ? (
          <EmptyState>Working out which reminders apply…</EmptyState>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {decisions.map((decision) => (
              <li
                key={decision.kind}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: space.md,
                  padding: `${space.sm}px 0`,
                  borderTop: `1px solid ${themeColor.border}`,
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ color: themeColor.text, fontSize: fontSize.label }}>
                    {KIND_LABEL[decision.kind]}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      color: themeColor.textMuted,
                      fontSize: fontSize.caption,
                    }}
                  >
                    {decision.rationale.summary}
                  </span>
                </span>
                <Pill tone={decision.fires ? 'accent' : 'muted'}>
                  {decision.fires
                    ? 'due now'
                    : decision.scheduledFor
                      ? `set for ${decision.scheduledFor}`
                      : 'off'}
                </Pill>
              </li>
            ))}
          </ul>
        )}
        <p style={{ color: themeColor.textFaint, fontSize: fontSize.caption }}>
          Evaluated for {webClock.today()} at {localTimeNow()}.
        </p>
      </Section>
    </div>
  );
}
