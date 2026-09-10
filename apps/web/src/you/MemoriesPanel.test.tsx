/**
 * Memories screen component tests — DESIGN.md §10, §9 phase 2 brief item 7:
 * "the memories screen (forget writes through)".
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHarness, renderAt, type Harness } from '../testing/harness';
import { MemoriesPanel } from './MemoriesPanel';

let harness: Harness;

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await harness.db.close();
});

function renderPanel(): void {
  renderAt(harness, '/', '/', <MemoriesPanel />);
}

describe('MemoriesPanel', () => {
  it('summarises what the coach knows and groups by kind and domain', async () => {
    await harness.repos.memories.create({
      kind: 'injury',
      domain: 'training',
      text: 'Left knee is sensitive to deep lunges.',
      source: 'coach',
      confidence: 0.9,
    });
    await harness.repos.memories.create({
      kind: 'preference',
      domain: 'nutrition',
      text: 'Prefers vegetarian dinners.',
      source: 'user',
      confidence: 1,
    });

    renderPanel();

    await screen.findByText(/The coach is holding 2 memories/i);
    // By role: "Injury" and "Preference" are also options in the add form's
    // kind picker, so a bare text lookup now matches two nodes.
    expect(screen.getByRole('heading', { name: 'Injury' })).toBeTruthy();
    expect(screen.getByText('Left knee is sensitive to deep lunges.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Preference' })).toBeTruthy();
    expect(screen.getByText('Prefers vegetarian dinners.')).toBeTruthy();
  });

  it('writes a memory the user types straight into the repository, with no coach involved', async () => {
    // The panel is rendered with the unavailable AI gateway (no key, offline),
    // which is exactly the case idea.md §2 was unreachable in before.
    renderPanel();
    await screen.findByRole('heading', { name: 'Add a memory' });

    fireEvent.change(screen.getByLabelText('Memory kind'), { target: { value: 'constraint' } });
    fireEvent.change(screen.getByLabelText('Memory domain'), { target: { value: 'nutrition' } });
    fireEvent.change(screen.getByLabelText('New memory text'), {
      target: { value: '  No dairy  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remember this' }));

    await waitFor(async () => {
      expect(await harness.repos.memories.listActive()).toHaveLength(1);
    });

    const [stored] = await harness.repos.memories.listActive();
    expect(stored.text).toBe('No dairy');
    expect(stored.kind).toBe('constraint');
    expect(stored.domain).toBe('nutrition');
    // The user said it themselves, so the planner treats it as certain.
    expect(stored.source).toBe('user');
    expect(stored.confidence).toBe(1);

    // …and it is on screen, in its group, without a reload.
    expect(await screen.findByText('No dairy')).toBeTruthy();
  });

  it('writes a forget through to the repository and drops the row from the active list', async () => {
    const memory = await harness.repos.memories.create({
      kind: 'dislike',
      domain: 'training',
      text: 'Does not like burpees.',
      source: 'coach',
      confidence: 0.7,
    });

    renderPanel();
    await screen.findByText('Does not like burpees.');

    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
    fireEvent.change(screen.getByLabelText('Reason for forgetting'), {
      target: { value: 'They said it no longer applies.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm forget' }));

    await waitFor(async () => {
      const stored = await harness.repos.memories.get(memory.id);
      expect(stored?.active).toBe(false);
    });

    await waitFor(() => {
      expect(screen.queryByText('Does not like burpees.')).toBeNull();
    });

    const forgotten = await harness.repos.memories.listForgotten();
    expect(forgotten[0]?.reason).toBe('They said it no longer applies.');
  });
});
