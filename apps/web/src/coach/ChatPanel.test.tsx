/**
 * Coach chat component tests — DESIGN.md §10, §9 phase 2 brief item 7: "a
 * fake client streams a text delta and a tool_use, the UI shows the chip and
 * persists the message".
 */

import { createCoachDeps, systemCoachClock } from '@vigor/ai';
import { createFakeAiClient } from '@vigor/ai/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHarness, renderAt, type Harness } from '../testing/harness';
import { ChatPanel } from './ChatPanel';
import { CoachContext, type CoachContextValue } from './CoachProvider';

let harness: Harness;

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await harness.db.close();
});

function renderChat(coachValue: CoachContextValue): void {
  renderAt(
    harness,
    '/',
    '/',
    <CoachContext.Provider value={coachValue}>
      <ChatPanel />
    </CoachContext.Provider>,
  );
}

describe('ChatPanel', () => {
  it('streams a text delta, shows a tool chip, and persists the turn', async () => {
    const fake = createFakeAiClient({
      turns: [
        {
          textChunks: ['On it', ', checking your history…'],
          toolUses: [{ id: 'tool_1', name: 'get_workouts', input: { from: '2026-08-01', to: '2026-09-10' } }],
        },
        { text: 'You trained twice this week.' },
      ],
    });
    const deps = createCoachDeps({ repos: harness.repos, clock: systemCoachClock() });

    renderChat({
      client: fake.client,
      deps,
      ready: true,
      hasKey: true,
      online: true,
      reloadKey: () => undefined,
      testConnection: async () => ({ ok: true }),
      ensureConversation: async () => {
        const conversation = await harness.repos.conversations.create();
        return conversation.id;
      },
    });

    const input = await screen.findByLabelText('Message the coach');
    // The panel's own effect creates a conversation on mount; wait for it so
    // `submit()` (which no-ops with no conversation yet) has a target.
    await waitFor(async () => {
      expect((await harness.repos.conversations.list()).length).toBe(1);
    });
    fireEvent.change(input, { target: { value: 'What should I train today?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    // The user's bubble renders immediately.
    await screen.findByText('What should I train today?');

    // Tool activity chip, from the tool_use the fake client scripted.
    await screen.findByText(/Looked at recent workouts/i);

    // The final assistant answer, once the turn settles and history refetches.
    await waitFor(() => {
      expect(screen.getByText('You trained twice this week.')).toBeTruthy();
    });

    // Persisted through the repositories — DESIGN.md §7.1 "history survives restarts".
    const conversations = await harness.repos.conversations.list();
    expect(conversations).toHaveLength(1);
    const messages = await harness.repos.conversations.listMessages(conversations[0].id);
    expect(messages.some((message) => message.role === 'user')).toBe(true);
    expect(messages.some((message) => message.role === 'assistant')).toBe(true);
  });

  it('shows the no-key state and keeps the send box disabled', async () => {
    const deps = createCoachDeps({ repos: harness.repos, clock: systemCoachClock() });
    renderChat({
      client: null,
      deps,
      ready: true,
      hasKey: false,
      online: true,
      reloadKey: () => undefined,
      testConnection: async () => ({ ok: false, message: 'no key' }),
      ensureConversation: async () => {
        const conversation = await harness.repos.conversations.create();
        return conversation.id;
      },
    });

    await screen.findByText(/needs an API key/i);
    const input = screen.getByLabelText('Message the coach') as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
  });
});
