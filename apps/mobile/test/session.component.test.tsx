/**
 * Session-mode component tests — DESIGN.md §10.
 *
 * These run the real screen against a real (in-memory) database, so they cover
 * the three promises session mode makes: a confirmed set is written the moment
 * it is confirmed (§7.2), "can't do this" swaps the exercise through the
 * substitution engine (§5.5), and the finish summary reports what the records
 * engine found (§5.7).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SessionMode } from '../src/session/SessionMode';
import { useSessionDraft } from '../src/session/store';
import {
  BACK_SQUAT_ID,
  FRONT_SQUAT_ID,
  TestProviders,
  createSessionFixture,
  type SessionFixture,
} from './support';

let fixture: SessionFixture;

beforeEach(async () => {
  useSessionDraft.getState().reset();
  fixture = await createSessionFixture();
});

afterEach(async () => {
  await fixture.close();
});

/** `render` and `fireEvent` are async in React Native Testing Library 14. */
async function renderSession() {
  await render(
    <TestProviders repos={fixture.repos} platform={fixture.platform}>
      <SessionMode workoutId={fixture.workoutId} onExit={() => undefined} />
    </TestProviders>,
  );
}

async function confirmSet(index: number, reps: string, load: string) {
  await fireEvent.changeText(await screen.findByTestId(`set-${index}-reps`), reps);
  await fireEvent.changeText(screen.getByTestId(`set-${index}-load`), load);
  await fireEvent.press(screen.getByTestId(`set-${index}-confirm`));
}

describe('session mode', () => {
  it('writes the set row as soon as the set is confirmed', async () => {
    await renderSession();
    expect(await screen.findByText('Back squat')).toBeTruthy();

    await confirmSet(0, '8', '62.5');

    await waitFor(async () => {
      const rows = await fixture.repos.sets.listForWorkoutExercise(fixture.workoutExerciseId);
      expect(rows[0].completed).toBe(true);
      expect(rows[0].actualReps).toBe(8);
      expect(rows[0].actualLoadKg).toBe(62.5);
    });

    // The store only ever holds what has not been flushed yet.
    expect(useSessionDraft.getState().inputs[fixture.setIds[0]]).toBeUndefined();
  });

  it('replaces the exercise when the user cannot do it', async () => {
    await renderSession();
    expect(await screen.findByText('Back squat')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('cant-do-this'));
    await fireEvent.press(await screen.findByTestId(`substitute-${FRONT_SQUAT_ID}`));

    await waitFor(async () => {
      const slot = await fixture.repos.workouts.getExercise(fixture.workoutExerciseId);
      expect(slot?.exerciseId).toBe(FRONT_SQUAT_ID);
      expect(slot?.substitutedFromExerciseId).toBe(BACK_SQUAT_ID);
    });
  });

  it('celebrates the records the engine found in the finish summary', async () => {
    await renderSession();
    expect(await screen.findByText('Back squat')).toBeTruthy();

    await confirmSet(0, '8', '60');
    await waitFor(() => expect(screen.getByTestId('set-0-edit')).toBeTruthy());
    await confirmSet(1, '8', '60');
    await waitFor(() => expect(screen.getByTestId('set-1-edit')).toBeTruthy());

    await fireEvent.press(screen.getByText('Finish session'));

    expect(await screen.findByText('Session logged')).toBeTruthy();
    expect(screen.getByText('Personal record')).toBeTruthy();

    const records = await fixture.repos.records.listForExercise(BACK_SQUAT_ID);
    expect(records.some((record) => record.kind === 'e1rm')).toBe(true);
    expect(records.some((record) => record.kind === 'max_load')).toBe(true);
  });
});
