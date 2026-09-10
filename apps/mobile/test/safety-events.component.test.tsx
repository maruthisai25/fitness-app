/**
 * You → Safety component test — DESIGN.md §6.5, §7.1, §8: every
 * `safety_events` row visible with date, kind, text, source, note and
 * resolvedAt; resolve writes through the repository.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SafetyEventsScreen from '../app/(tabs)/you/safety-events';
import { createSessionFixture, TestProviders, type SessionFixture } from './support';

let fixture: SessionFixture;

beforeEach(async () => {
  fixture = await createSessionFixture();
});

afterEach(async () => {
  await fixture.close();
});

async function renderScreen() {
  await render(
    <TestProviders repos={fixture.repos} platform={fixture.platform}>
      <SafetyEventsScreen />
    </TestProviders>,
  );
}

describe('safety events screen', () => {
  it('lists every event with its date, kind, text, source and note, resolved ones included', async () => {
    const resolved = await fixture.repos.safety.create({
      date: '2026-09-01',
      kind: 'symptom',
      text: 'Felt light-headed mid-set',
      source: 'session',
    });
    await fixture.repos.safety.resolve(
      resolved.id,
      'Ate before training next time',
      '2026-09-01T12:00:00.000Z',
    );

    const open = await fixture.repos.safety.create({
      date: '2026-09-08',
      kind: 'pain',
      text: 'Sharp pain in lower back',
      source: 'chat',
    });

    await renderScreen();

    expect(await screen.findByText('Sharp pain in lower back')).toBeTruthy();
    expect(screen.getByText('Pain · 2026-09-08')).toBeTruthy();
    expect(screen.getByText('Reported in coach chat · open')).toBeTruthy();

    expect(screen.getByText('Felt light-headed mid-set')).toBeTruthy();
    expect(screen.getByText('Symptom · 2026-09-01')).toBeTruthy();
    expect(screen.getByText('Reported in session mode · resolved 2026-09-01')).toBeTruthy();
    expect(screen.getByText('Note: Ate before training next time')).toBeTruthy();

    expect(screen.getByText('1 open')).toBeTruthy();
    // A resolved event stays readable — no resolve action on it any more.
    expect(screen.queryByTestId(`safety-event-${resolved.id}-resolve`)).toBeNull();
    expect(screen.getByTestId(`safety-event-${open.id}-resolve`)).toBeTruthy();
  });

  it('shows an empty state when nothing has been reported', async () => {
    await renderScreen();
    expect(await screen.findByText('Nothing reported')).toBeTruthy();
  });

  it('resolve writes an optional note through the repository, reusing the banner’s resolve path', async () => {
    const event = await fixture.repos.safety.create({
      date: '2026-09-09',
      kind: 'dizziness',
      text: 'Dizzy standing up from a set of squats',
      source: 'session',
    });

    await renderScreen();
    expect(await screen.findByText('Dizzy standing up from a set of squats')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`safety-event-${event.id}-resolve`));
    await fireEvent.changeText(
      screen.getByTestId(`safety-event-${event.id}-note`),
      'Settled after water and a longer rest',
    );
    await fireEvent.press(screen.getByTestId(`safety-event-${event.id}-resolve-confirm`));

    await waitFor(async () => {
      const stored = await fixture.repos.safety.get(event.id);
      expect(stored?.resolvedAt).not.toBeNull();
    });
    const stored = await fixture.repos.safety.get(event.id);
    expect(stored?.note).toBe('Settled after water and a longer rest');

    expect(await screen.findByText(/Reported in session mode · resolved/)).toBeTruthy();
    expect(screen.getByText('Note: Settled after water and a longer rest')).toBeTruthy();
    expect(screen.getByText('All resolved')).toBeTruthy();
  });

  it('resolving without a note still closes the event', async () => {
    const event = await fixture.repos.safety.create({
      date: '2026-09-09',
      kind: 'excessive_fatigue',
      text: 'Unusually wiped out after a short session',
      source: 'readiness',
    });

    await renderScreen();
    expect(await screen.findByText('Unusually wiped out after a short session')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`safety-event-${event.id}-resolve`));
    await fireEvent.press(screen.getByTestId(`safety-event-${event.id}-resolve-confirm`));

    await waitFor(async () => {
      const stored = await fixture.repos.safety.get(event.id);
      expect(stored?.resolvedAt).not.toBeNull();
    });
    const stored = await fixture.repos.safety.get(event.id);
    expect(stored?.note).toBeNull();
  });
});
