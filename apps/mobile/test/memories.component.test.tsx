/**
 * You → Memories component test — DESIGN.md §10: "the memories screen (forget
 * writes through)".
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import MemoriesScreen from '../app/(tabs)/you/memories';
import { createSessionFixture, TestProviders, type SessionFixture } from './support';

let fixture: SessionFixture;

beforeEach(async () => {
  fixture = await createSessionFixture();
});

afterEach(async () => {
  await fixture.close();
});

/** `render` and `fireEvent` are async in React Native Testing Library 14. */
async function renderScreen() {
  await render(
    <TestProviders repos={fixture.repos} platform={fixture.platform}>
      <MemoriesScreen />
    </TestProviders>,
  );
}

describe('memories screen', () => {
  it('lists an active memory grouped by kind and domain, with source and confidence', async () => {
    const memory = await fixture.repos.memories.create({
      kind: 'preference',
      domain: 'training',
      text: 'Prefers training in the evening',
      source: 'coach',
      confidence: 0.9,
    });

    await renderScreen();

    expect(await screen.findByText('Prefers training in the evening')).toBeTruthy();
    expect(screen.getByText('active · source coach · confidence 90%')).toBeTruthy();
    expect(screen.getByTestId(`memory-${memory.id}`)).toBeTruthy();
  });

  it('forget writes through to the repository', async () => {
    const memory = await fixture.repos.memories.create({
      kind: 'dislike',
      domain: 'training',
      text: 'Does not like burpees',
      source: 'user',
      confidence: 1,
    });

    await renderScreen();
    expect(await screen.findByText('Does not like burpees')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`memory-${memory.id}-forget`));
    await fireEvent.press(await screen.findByTestId(`memory-${memory.id}-forget-confirm`));

    await waitFor(async () => {
      const row = await fixture.repos.memories.get(memory.id);
      expect(row?.active).toBe(false);
    });

    const forgotten = await fixture.repos.memories.listForgotten();
    expect(forgotten.some((entry) => entry.memoryId === memory.id)).toBe(true);
  });

  it('writes a memory the user types straight to the repository', async () => {
    // No API key, no network: this is the path idea.md §2 had no answer for,
    // and it is exactly the row `planner` and `substitution` filter on.
    await renderScreen();

    await fireEvent.press(await screen.findByText('Constraint'));
    await fireEvent.press(screen.getByText('Nutrition'));
    await fireEvent.changeText(screen.getByTestId('add-memory-text'), '  No dairy  ');
    await fireEvent.press(screen.getByTestId('add-memory-save'));

    await waitFor(async () => {
      expect(await fixture.repos.memories.listActive()).toHaveLength(1);
    });

    const [row] = await fixture.repos.memories.listActive();
    expect(row.text).toBe('No dairy');
    expect(row.kind).toBe('constraint');
    expect(row.domain).toBe('nutrition');
    expect(row.source).toBe('user');
    expect(row.confidence).toBe(1);
  });

  it('shows a what-the-coach-knows summary built from the same rows', async () => {
    await fixture.repos.memories.create({
      kind: 'constraint',
      domain: 'training',
      text: 'Bad left knee — avoid deep lunges',
      source: 'coach',
      confidence: 0.8,
    });

    await renderScreen();
    expect(await screen.findByText(/The coach is holding 1 active memory/)).toBeTruthy();
  });
});
