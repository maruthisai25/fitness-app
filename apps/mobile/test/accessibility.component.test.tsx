/**
 * Accessibility contract for the three screens a user touches most —
 * DESIGN.md §9 phase 7 ("accessibility pass").
 *
 * These render the real screens against the real React Native runtime, so the
 * props asserted here are the ones VoiceOver and TalkBack would actually read.
 * What is checked, per WCAG 2.2 AA and the platform conventions:
 *
 *  - 4.1.2 Name, Role, Value — every pressable, input and toggle exposes a
 *    role, a name and, where it has one, a state;
 *  - 2.5.5/2.5.8 Target Size — nothing smaller than 44 pt, by real height or
 *    by `hitSlop`;
 *  - 1.3.2 Meaningful Sequence — inside a set, the reading order is target,
 *    then the inputs, then confirm.
 *
 * Contrast (1.4.3) is a property of the palette rather than of a render, so it
 * is proved separately in `src/ui/tokens.test.ts` against both themes.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import type { TestInstance } from 'test-renderer';

import { AddFoodPanel } from '../src/eat/AddFoodPanel';
import { AiUnavailableError, type AiGateway } from '../src/ai/gateway';
import { CoachThread } from '../src/coach/CoachThread';
import { SessionMode } from '../src/session/SessionMode';
import { useSessionDraft } from '../src/session/store';
import { CoachLauncher } from '../src/ui/CoachLauncher';
import { HIT_TARGET } from '../src/ui/tokens';
import { createSessionFixture, TestProviders, TEST_DATE, type SessionFixture } from './support';

let fixture: SessionFixture;

beforeEach(async () => {
  useSessionDraft.getState().reset();
  fixture = await createSessionFixture();
});

afterEach(async () => {
  await fixture.close();
});

/**
 * A target is big enough when it is 44 pt tall on its own, or when `hitSlop`
 * lifts a single line of text (~20 pt) past 44. Either is a pass under WCAG
 * 2.5.5; the second is what a text action inside a row uses so the row does
 * not grow.
 */
function touchTargetIsBigEnough(node: TestInstance): boolean {
  const style = StyleSheet.flatten(node.props.style) ?? {};
  const height = Number(style.minHeight ?? style.height ?? 0);
  if (height >= HIT_TARGET) return true;

  const slop = node.props.hitSlop;
  if (typeof slop === 'number') return height + slop * 2 + 20 >= HIT_TARGET;
  if (slop && typeof slop === 'object') {
    return height + Number(slop.top ?? 0) + Number(slop.bottom ?? 0) + 20 >= HIT_TARGET;
  }
  return false;
}

function describeTarget(node: TestInstance): string {
  return String(node.props.accessibilityLabel ?? node.props.testID ?? 'unnamed target');
}

/** Every pressable in the subtree, whatever role it announces itself with. */
function pressablesIn(root: TestInstance): TestInstance[] {
  const scope = within(root);
  return [
    ...scope.queryAllByRole('button'),
    ...scope.queryAllByRole('link'),
    ...scope.queryAllByRole('radio'),
    ...scope.queryAllByRole('checkbox'),
  ];
}

// ---------------------------------------------------------------------------
// Session mode
// ---------------------------------------------------------------------------

describe('session mode accessibility', () => {
  async function renderSession() {
    await render(
      <TestProviders repos={fixture.repos} platform={fixture.platform}>
        <SessionMode workoutId={fixture.workoutId} onExit={() => undefined} />
      </TestProviders>,
    );
    await screen.findByText('Back squat');
  }

  it('names every control in a set, and states whether it is on or off', async () => {
    await renderSession();

    const confirm = screen.getByTestId('set-0-confirm');
    expect(confirm.props.accessibilityRole).toBe('button');
    expect(confirm.props.accessibilityLabel).toBe('Confirm set 1');
    expect(confirm.props.accessibilityState).toMatchObject({ disabled: false, busy: false });

    // Inputs are named and say what the engine is asking for.
    const reps = screen.getByTestId('set-0-reps');
    expect(reps.props.accessibilityLabel).toBe('Set 1 reps');
    expect(reps.props.accessibilityHint).toBe('Target is 5');

    const load = screen.getByTestId('set-0-load');
    expect(load.props.accessibilityLabel).toBe('Set 1 load in kg');
    expect(load.props.accessibilityHint).toBe('Target is 60 kg');

    expect(screen.getByTestId('set-0-notes').props.accessibilityLabel).toBe('Set 1 notes');

    // The RPE picker is a set of chips — one row per set, so scope to set 1.
    // Only the chosen chip reads as selected.
    const firstSet = () => within(screen.getByTestId('set-0'));
    const rpeEight = firstSet().getByRole('button', { name: /^8$/ });
    expect(rpeEight.props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(rpeEight);
    expect(firstSet().getByRole('button', { name: /^8$/ }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(firstSet().getByRole('button', { name: /^9$/ }).props.accessibilityState).toMatchObject({
      selected: false,
    });

    // "Why?" is a disclosure, so it reports whether it is open.
    const why = screen.getByTestId('exercise-why');
    expect(why.props.accessibilityLabel).toBe('Why?');
    expect(why.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(why);
    expect(screen.getByTestId('exercise-why').props.accessibilityState).toMatchObject({
      expanded: true,
    });
  });

  it('reads a set as target, then inputs, then confirm', async () => {
    await renderSession();

    const card = screen.getByTestId('set-0');
    const order = within(card)
      .getAllByTestId(/^set-0-/)
      .map((node) => String(node.props.testID));

    expect(order).toEqual(
      expect.arrayContaining(['set-0-target', 'set-0-reps', 'set-0-load', 'set-0-confirm']),
    );
    expect(order.indexOf('set-0-target')).toBeLessThan(order.indexOf('set-0-reps'));
    expect(order.indexOf('set-0-reps')).toBeLessThan(order.indexOf('set-0-load'));
    expect(order.indexOf('set-0-load')).toBeLessThan(order.indexOf('set-0-confirm'));

    // The target element speaks the whole prescription, not a fragment of it.
    expect(screen.getByTestId('set-0-target').props.accessibilityLabel).toBe(
      'Set 1. Target 5 reps × 60 kg. First time logging this set',
    );
    // …and so does the exercise header above the sets.
    expect(screen.getByTestId('exercise-target').props.accessibilityLabel).toBe(
      'Target: 2 × 5–8 reps at 60 kg. Rest 120 seconds between sets.',
    );
  });

  it('gives every control on the screen a 44 pt target', async () => {
    await renderSession();

    const targets = pressablesIn(screen.getByTestId('set-0'));
    expect(targets.length).toBeGreaterThan(0);

    const tooSmall = targets.filter((node) => !touchTargetIsBigEnough(node)).map(describeTarget);
    expect(tooSmall).toEqual([]);

    // The whole-screen actions too — abandon, "can't do this", finish.
    for (const testID of ['abandon-session', 'cant-do-this']) {
      expect(touchTargetIsBigEnough(screen.getByTestId(testID))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------

describe('reduced motion', () => {
  function reduceMotion(enabled: boolean) {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(enabled);
  }

  async function renderSession() {
    await render(
      <TestProviders repos={fixture.repos} platform={fixture.platform}>
        <SessionMode workoutId={fixture.workoutId} onExit={() => undefined} />
      </TestProviders>,
    );
    await screen.findByText('Back squat');
  }

  async function confirmSet(index: number, reps: string, load: string) {
    await fireEvent.changeText(await screen.findByTestId(`set-${index}-reps`), reps);
    await fireEvent.changeText(screen.getByTestId(`set-${index}-load`), load);
    await fireEvent.press(screen.getByTestId(`set-${index}-confirm`));
  }

  /** Which countdown intervals the rest timer registered. */
  function tickDelays(spy: jest.SpyInstance): number[] {
    return spy.mock.calls
      .map((call) => Number(call[1]))
      .filter((delay) => delay === 500 || delay === 1000);
  }

  it('steps the rest countdown once a second instead of twice', async () => {
    reduceMotion(true);
    const intervals = jest.spyOn(globalThis, 'setInterval');

    await renderSession();
    await confirmSet(0, '8', '60');

    await waitFor(() => expect(screen.getByTestId('set-0-skip-rest')).toBeTruthy());
    expect(tickDelays(intervals)).toContain(1000);
    expect(tickDelays(intervals)).not.toContain(500);

    // The countdown is still announced — the information stays, the flicker goes.
    const rest = screen.getByTestId('set-0')  ;
    expect(within(rest).getByText(/^Rest /).props.accessibilityLiveRegion).toBe('polite');
  });

  it('ticks twice a second when motion is allowed', async () => {
    reduceMotion(false);
    const intervals = jest.spyOn(globalThis, 'setInterval');

    await renderSession();
    await confirmSet(0, '8', '60');

    await waitFor(() => expect(screen.getByTestId('set-0-skip-rest')).toBeTruthy());
    expect(tickDelays(intervals)).toContain(500);
  });

  it('puts the PR celebration in place without animating it, and says it out loud', async () => {
    reduceMotion(true);
    const timing = jest.spyOn(Animated, 'timing');
    const spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    await renderSession();
    await confirmSet(0, '8', '60');
    await waitFor(() => expect(screen.getByTestId('set-0-edit')).toBeTruthy());
    await confirmSet(1, '8', '60');
    await waitFor(() => expect(screen.getByTestId('set-1-edit')).toBeTruthy());
    await fireEvent.press(screen.getByText('Finish session'));

    expect(await screen.findByTestId('pr-celebration')).toBeTruthy();
    expect(timing).not.toHaveBeenCalled();
    expect(spoken).toHaveBeenCalledWith(
      expect.stringContaining('Personal record: new estimated 1rm on Back squat'),
    );
  });

  it('animates the PR celebration when motion is allowed', async () => {
    reduceMotion(false);
    const timing = jest.spyOn(Animated, 'timing');

    await renderSession();
    await confirmSet(0, '8', '60');
    await waitFor(() => expect(screen.getByTestId('set-0-edit')).toBeTruthy());
    await confirmSet(1, '8', '60');
    await waitFor(() => expect(screen.getByTestId('set-1-edit')).toBeTruthy());
    await fireEvent.press(screen.getByText('Finish session'));

    expect(await screen.findByTestId('pr-celebration')).toBeTruthy();
    expect(timing).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Food log
// ---------------------------------------------------------------------------

const PARSED = [
  {
    name: 'Roti',
    quantity: 2,
    unit: 'piece',
    kcal: 240,
    proteinG: 8,
    carbsG: 46,
    fatG: 2,
    fiberG: 4,
    confidence: 0.8,
    savedMealId: null,
  },
];

function fakeGateway(): AiGateway {
  return {
    isAvailable: () => true,
    parseFood: async () => PARSED,
    generateRecipe: () => Promise.reject(new AiUnavailableError()),
    generateMealPlan: () => Promise.reject(new AiUnavailableError()),
  };
}

describe('food log accessibility', () => {
  async function renderFoodLog() {
    await render(
      <TestProviders repos={fixture.repos} platform={fixture.platform}>
        <AddFoodPanel
          repos={fixture.repos}
          date={TEST_DATE}
          region="IN"
          gateway={fakeGateway()}
        />
      </TestProviders>,
    );
  }

  it('names its mode and meal chips and says which one is chosen', async () => {
    await renderFoodLog();

    const describeIt = screen.getByRole('button', { name: 'Describe it' });
    expect(describeIt.props.accessibilityState).toMatchObject({ selected: true, disabled: false });
    expect(
      screen.getByRole('button', { name: 'Enter by hand' }).props.accessibilityState,
    ).toMatchObject({ selected: false });

    const breakfast = screen.getByRole('button', { name: 'Breakfast' });
    const lunch = screen.getByRole('button', { name: 'Lunch' });
    expect(breakfast.props.accessibilityState).toMatchObject({ selected: true });
    expect(lunch.props.accessibilityState).toMatchObject({ selected: false });

    await fireEvent.press(lunch);
    expect(
      screen.getByRole('button', { name: 'Lunch' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      screen.getByRole('button', { name: 'Breakfast' }).props.accessibilityState,
    ).toMatchObject({ selected: false });
  });

  it('labels the description field and every estimated item, at a 44 pt target', async () => {
    await renderFoodLog();

    const field = screen.getByLabelText('What did you eat?');
    expect(field.props.accessibilityHint).toBe('Plain words are fine — quantities help the estimate.');

    await fireEvent.changeText(field, 'two rotis');
    await fireEvent.press(screen.getByRole('button', { name: 'Estimate macros' }));

    // A parsed item is one element carrying its whole line, not four scraps.
    const item = await screen.findByRole('button', { name: /^Roti, 240 kcal/ });
    expect(item.props.accessibilityLabel).toContain('80% confident');
    expect(touchTargetIsBigEnough(item)).toBe(true);

    const confirm = screen.getByRole('button', { name: 'Log 1 items' });
    expect(confirm.props.accessibilityState).toMatchObject({ disabled: false });
    expect(touchTargetIsBigEnough(confirm)).toBe(true);

    // Everything tappable on the panel clears the target size.
    const root = screen.root;
    expect(root).not.toBeNull();
    const tooSmall = pressablesIn(root!)
      .filter((node) => !touchTargetIsBigEnough(node))
      .map(describeTarget);
    expect(tooSmall).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Coach entry
// ---------------------------------------------------------------------------

describe('coach entry accessibility', () => {
  it('announces the floating coach button with a name, a hint and a real target', async () => {
    await render(
      <TestProviders repos={fixture.repos} platform={fixture.platform}>
        <CoachLauncher />
      </TestProviders>,
    );

    const launcher = screen.getByTestId('coach-launcher');
    expect(launcher.props.accessibilityRole).toBe('button');
    expect(launcher.props.accessibilityLabel).toBe('Open the coach');
    expect(launcher.props.accessibilityHint).toBe(
      'Opens the coach chat, which can see your history',
    );
    expect(launcher.props.accessibilityState).toMatchObject({ disabled: false });
    expect(touchTargetIsBigEnough(launcher)).toBe(true);
  });

  it('labels the composer and reports when Send is unavailable', async () => {
    const conversation = await fixture.repos.conversations.create({ title: 'A11y chat' });
    const online = {
      ...fixture.platform,
      network: { isOnline: async () => true, subscribe: () => () => undefined },
    };
    const fakeClient = { messages: {}, beta: {} } as never;

    await render(
      <TestProviders repos={fixture.repos} platform={online} aiClient={fakeClient}>
        <CoachThread conversationId={conversation.id} />
      </TestProviders>,
    );

    const input = await screen.findByTestId('coach-input');
    expect(input.props.accessibilityLabel).toBe('Message the coach');
    expect(input.props.accessibilityHint).toBe("Ask about training, nutrition or today's plan");

    // Nothing typed yet, so Send is disabled — and says so.
    const send = screen.getByTestId('coach-send');
    expect(send.props.accessibilityRole).toBe('button');
    expect(send.props.accessibilityLabel).toBe('Send');
    expect(send.props.accessibilityState).toMatchObject({ disabled: true, busy: false });
    expect(touchTargetIsBigEnough(send)).toBe(true);

    await fireEvent.changeText(input, 'What should I train today?');
    expect(screen.getByTestId('coach-send').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });
});
