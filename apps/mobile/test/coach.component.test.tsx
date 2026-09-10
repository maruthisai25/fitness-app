/**
 * Coach chat component test — DESIGN.md §10: "a fake client streams a text
 * delta and a tool_use, the UI shows the chip and persists the message".
 *
 * Runs the real `CoachThread` against a real (in-memory) database and
 * `@vigor/ai/testing`'s scripted client, so it covers the whole round trip:
 * `runCoachTurn` executing the real `get_workouts` tool, the chip rendering
 * while it runs, and every turn landing in `conversations`/`messages`.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createFakeAiClient } from '@vigor/ai/testing';
import type { PlatformAdapters } from '@vigor/platform';

import { CoachThread } from '../src/coach/CoachThread';
import { createSessionFixture, TestProviders, type SessionFixture } from './support';

let fixture: SessionFixture;

beforeEach(async () => {
  fixture = await createSessionFixture();
});

afterEach(async () => {
  await fixture.close();
});

/** The chat composer needs `isOnline()` to resolve true; the shared fixture
 * defaults every adapter to safely-offline, so this test overrides just that. */
function onlinePlatform(): PlatformAdapters {
  return {
    ...fixture.platform,
    network: { isOnline: async () => true, subscribe: () => () => undefined },
  };
}

describe('coach chat', () => {
  it('streams a tool call and persists the whole turn', async () => {
    const conversation = await fixture.repos.conversations.create({ title: 'Test chat' });
    const fake = createFakeAiClient({
      turns: [
        {
          text: 'Let me check your recent sessions.',
          toolUses: [
            { id: 'call_1', name: 'get_workouts', input: { from: '2026-08-01', to: '2026-09-10' } },
          ],
        },
        { text: 'You had one planned session this week.' },
      ],
    });

    await render(
      <TestProviders repos={fixture.repos} platform={onlinePlatform()} aiClient={fake.client}>
        <CoachThread conversationId={conversation.id} />
      </TestProviders>,
    );

    const input = await screen.findByTestId('coach-input');
    await fireEvent.changeText(input, 'What did I do this week?');
    await fireEvent.press(screen.getByTestId('coach-send'));

    // The tool chip shows while (or just after) the turn runs.
    await waitFor(() => expect(screen.getAllByText(/recent sessions/).length).toBeGreaterThan(0));

    // The final assistant answer appears once the whole turn has landed.
    expect(await screen.findByText('You had one planned session this week.')).toBeTruthy();

    await waitFor(async () => {
      const messages = await fixture.repos.conversations.listMessages(conversation.id);
      expect(messages.some((message) => message.role === 'user')).toBe(true);
      expect(
        messages.some(
          (message) =>
            message.role === 'assistant' && JSON.stringify(message.content).includes('get_workouts'),
        ),
      ).toBe(true);
      expect(
        messages.some(
          (message) =>
            message.role === 'user' && JSON.stringify(message.content).includes('tool_result'),
        ),
      ).toBe(true);
    });
  });

  it('shows the "add a key" state without an AI client', async () => {
    const conversation = await fixture.repos.conversations.create({ title: 'No key yet' });

    await render(
      <TestProviders repos={fixture.repos} platform={onlinePlatform()} aiClient={null}>
        <CoachThread conversationId={conversation.id} />
      </TestProviders>,
    );

    expect(await screen.findByText(/Add your Anthropic key/)).toBeTruthy();
    expect(screen.queryByTestId('coach-input')).toBeNull();
  });
});
