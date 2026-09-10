/**
 * You → Safety — DESIGN.md §6.5, §7.1, §8: every `safety_events` row, kept
 * visible for the record. An open event is also what raises the banner on
 * Today, Train and inside session mode and holds the planner (§5.1 rule 1);
 * resolving one here calls the same repository method the banner's own
 * "Resolve" does, so closing it here lifts the hold everywhere else too.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  orderSafetyEvents,
  queryKeys,
  type SafetyEvent,
  type SafetyEventKind,
  type SafetyEventSource,
} from '@vigor/core';

import { useResolveSafetyEvent } from '../../../src/data/queries';
import { useRepos } from '../../../src/db/AppDataProvider';
import {
  Button,
  ErrorBanner,
  LoadingScreen,
  Screen,
  ScreenBlurb,
  ScreenTitle,
  Section,
  TextField,
} from '../../../src/ui/components';
import { Body, Caption, EmptyState, SectionHeading } from '../../../src/ui/kit';
import { color, space } from '../../../src/ui/tokens';

const KIND_LABEL: Record<SafetyEventKind, string> = {
  pain: 'Pain',
  injury: 'Injury',
  dizziness: 'Dizziness',
  symptom: 'Symptom',
  excessive_fatigue: 'Unusual fatigue',
};

const SOURCE_LABEL: Record<SafetyEventSource, string> = {
  readiness: 'readiness check-in',
  chat: 'coach chat',
  session: 'session mode',
};

function kindLabel(kind: SafetyEventKind): string {
  return KIND_LABEL[kind] ?? kind;
}

function sourceLabel(source: SafetyEventSource): string {
  return SOURCE_LABEL[source] ?? source;
}

function SafetyEventRow({ event, last }: { event: SafetyEvent; last: boolean }) {
  const resolve = useResolveSafetyEvent();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const open = event.resolvedAt == null;

  async function confirmResolve(): Promise<void> {
    await resolve.mutateAsync({
      id: event.id,
      note: note.trim().length > 0 ? note.trim() : undefined,
    });
    setResolving(false);
    setNote('');
  }

  return (
    <View
      testID={`safety-event-${event.id}`}
      style={{
        paddingVertical: space.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: color.border,
        opacity: open ? 1 : 0.7,
      }}
    >
      <Body>{`${kindLabel(event.kind)} · ${event.date}`}</Body>
      <Body muted>{event.text}</Body>
      <Caption>
        {`Reported in ${sourceLabel(event.source)} · ${
          open ? 'open' : `resolved ${(event.resolvedAt ?? '').slice(0, 10)}`
        }`}
      </Caption>
      {event.note ? <Caption>{`Note: ${event.note}`}</Caption> : null}

      {open ? (
        resolving ? (
          <View style={{ marginTop: space.sm }}>
            <TextField
              label="Note (optional)"
              testID={`safety-event-${event.id}-note`}
              value={note}
              onChangeText={setNote}
              placeholder="e.g. settled after a rest day"
            />
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Resolve"
                  testID={`safety-event-${event.id}-resolve-confirm`}
                  onPress={() => void confirmResolve()}
                  loading={resolve.isPending}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setResolving(false);
                    setNote('');
                  }}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={{ marginTop: space.sm, alignItems: 'flex-start' }}>
            <Button
              label="Resolve"
              testID={`safety-event-${event.id}-resolve`}
              onPress={() => setResolving(true)}
            />
          </View>
        )
      ) : null}

      {resolve.isError ? <ErrorBanner message="Could not resolve that event. Try again." /> : null}
    </View>
  );
}

export default function SafetyEventsScreen() {
  const { safety } = useRepos();
  const query = useQuery({
    queryKey: queryKeys.safetyEvents(),
    queryFn: () => safety.list({ includeResolved: true }),
  });

  const events = query.data ?? [];
  const ordered = useMemo(() => orderSafetyEvents(events), [events]);
  const openCount = useMemo(
    () => events.filter((event) => event.resolvedAt == null).length,
    [events],
  );

  if (query.isLoading) return <LoadingScreen label="Loading safety events…" />;

  return (
    <Screen>
      <ScreenTitle>Safety</ScreenTitle>
      <ScreenBlurb>
        Every pain, injury, dizziness or unusual-fatigue report the readiness check-in, the coach or
        a session has logged. While one is open, loads hold and the coach plans around it; resolving
        it here lifts that everywhere else. This is your own record, not medical advice — see a
        professional if something is not settling.
      </ScreenBlurb>

      {query.isError ? <ErrorBanner message="Could not load safety events." /> : null}

      {ordered.length === 0 ? (
        <EmptyState
          title="Nothing reported"
          blurb="Pain, injury, dizziness and unusual fatigue reported in the readiness check-in, chat or a session will show up here."
        />
      ) : (
        <>
          <SectionHeading>
            {openCount === 0 ? 'All resolved' : openCount === 1 ? '1 open' : `${openCount} open`}
          </SectionHeading>
          <Section>
            {ordered.map((event, index) => (
              <SafetyEventRow key={event.id} event={event} last={index === ordered.length - 1} />
            ))}
          </Section>
        </>
      )}
    </Screen>
  );
}
