import { AuthenticationError } from '@anthropic-ai/sdk';
import type { Message } from '@vigor/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createAiClient, type AiMessagesApi } from './client';
import { runCoachTurn, selectHistory, type CoachEvent } from './coach';
import { AiError } from './errors';
import { createAiTestEnv, logSession, type AiTestEnv } from './testFixtures';
import { createFakeAiClient, refusalTurn } from './testing';

let env: AiTestEnv | null = null;

async function setup(): Promise<AiTestEnv> {
  env = await createAiTestEnv();
  return env;
}

afterEach(async () => {
  await env?.close();
  env = null;
});

function blockTypes(message: Message): string[] {
  return (message.content as { type: string }[]).map((block) => block.type);
}

describe('runCoachTurn', () => {
  it('persists the user turn, streams the answer and records usage', async () => {
    const scope = await setup();
    const conversation = await scope.db.repos.conversations.create({ title: 'Today' });
    const fake = createFakeAiClient({
      turns: [{ textChunks: ['Take ', 'the ', 'session ', 'easy today.'], usage: { input: 4200, output: 60, cacheRead: 3900 } }],
    });

    const events: CoachEvent[] = [];
    const result = await runCoachTurn({
      conversationId: conversation.id,
      userText: 'What should I do today?',
      deps: scope.deps,
      client: fake.client,
      onEvent: (event) => events.push(event),
    });

    expect(result.text).toBe('Take the session easy today.');
    expect(result.refusal).toBeNull();
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage).toEqual({
      inputTokens: 4200,
      outputTokens: 60,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 3900,
    });

    const stored = await scope.db.repos.conversations.listMessages(conversation.id);
    expect(stored.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(stored[1].model).toBe('claude-opus-5');
    expect(stored[1].usage?.inputTokens).toBe(4200);

    expect(events.map((event) => event.type)).toEqual([
      'user_message',
      'text_delta',
      'text_delta',
      'text_delta',
      'text_delta',
      'usage',
      'assistant_message',
      'done',
    ]);
  });

  it('sends the layered prompt with the cached prefix and the DESIGN.md §6.1 knobs', async () => {
    const scope = await setup();
    const conversation = await scope.db.repos.conversations.create();
    const fake = createFakeAiClient({ turns: [{ text: 'Understood.' }] });

    await runCoachTurn({
      conversationId: conversation.id,
      userText: 'Plan me something short.',
      deps: scope.deps,
      client: fake.client,
    });

    const request = fake.runnerRequests[0];
    expect(request.model).toBe('claude-opus-5');
    expect(request.thinking).toEqual({ type: 'adaptive' });
    expect(request.output_config).toEqual({ effort: 'medium' });
    expect(request.fallbacks).toBe('default');
    expect(request.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(request.stream).toBe(true);

    const system = request.system as { text: string; cache_control?: unknown }[];
    expect(system).toHaveLength(2);
    expect(system.every((block) => block.cache_control != null)).toBe(true);

    const lastMessage = request.messages.at(-1);
    const content = lastMessage?.content as { type: string; text: string }[];
    expect(content[0].text).toContain('<context>');
    expect(content[1].text).toBe('Plan me something short.');
  });

  it('runs tools, persists the tool_use and tool_result blocks, and reports them', async () => {
    const scope = await setup();
    await logSession(scope, {
      exerciseId: scope.exercises.bench.id,
      date: '2026-09-03',
      loadKg: 60,
      reps: [10, 10, 10],
      rpe: 8,
    });
    const conversation = await scope.db.repos.conversations.create();
    const fake = createFakeAiClient({
      turns: [
        {
          text: 'Let me look that up.',
          toolUses: [
            {
              id: 'toolu_1',
              name: 'get_exercise_history',
              input: { exerciseId: scope.exercises.bench.id, limit: 3 },
            },
          ],
        },
        { text: 'You pressed 60 kg for three sets of ten last time.' },
      ],
    });

    const events: CoachEvent[] = [];
    const result = await runCoachTurn({
      conversationId: conversation.id,
      userText: 'How is my bench going?',
      deps: scope.deps,
      client: fake.client,
      onEvent: (event) => events.push(event),
    });

    expect(result.iterations).toBe(2);
    expect(result.toolCalls).toEqual([
      { toolUseId: 'toolu_1', name: 'get_exercise_history', ok: true },
    ]);
    expect(result.text).toContain('60 kg');

    const stored = await scope.db.repos.conversations.listMessages(conversation.id);
    expect(stored.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(blockTypes(stored[1])).toEqual(['text', 'tool_use']);
    expect(blockTypes(stored[2])).toEqual(['tool_result']);
    const toolResult = stored[2].content[0] as { tool_use_id: string; content: string };
    expect(toolResult.tool_use_id).toBe('toolu_1');
    expect(JSON.parse(toolResult.content).ok).toBe(true);

    const kinds = events.map((event) => event.type);
    expect(kinds).toContain('tool_start');
    expect(kinds).toContain('tool_result');
    expect(kinds.indexOf('tool_start')).toBeLessThan(kinds.indexOf('tool_result'));
  });

  it('records a tool failure as an error result instead of losing the turn', async () => {
    const scope = await setup();
    const conversation = await scope.db.repos.conversations.create();
    const fake = createFakeAiClient({
      turns: [
        {
          toolUses: [{ id: 'toolu_bad', name: 'get_workouts', input: { from: 'yesterday', to: 'today' } }],
        },
        { text: 'I could not read those dates — which week did you mean?' },
      ],
    });

    const result = await runCoachTurn({
      conversationId: conversation.id,
      userText: 'Show me last week.',
      deps: scope.deps,
      client: fake.client,
    });

    expect(result.toolCalls).toEqual([{ toolUseId: 'toolu_bad', name: 'get_workouts', ok: false }]);
    const stored = await scope.db.repos.conversations.listMessages(conversation.id);
    const toolResult = stored[2].content[0] as { is_error?: boolean; content: string };
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toContain('Error:');
  });

  it('answers a tool_use the runner could not dispatch, so no call is left dangling', async () => {
    const scope = await setup();
    const conversation = await scope.db.repos.conversations.create();
    const fake = createFakeAiClient({
      turns: [
        { toolUses: [{ id: 'toolu_ghost', name: 'plan_my_whole_year', input: { months: 12 } }] },
        { text: 'I do not have a tool for that — here is what I can do instead.' },
      ],
    });

    const result = await runCoachTurn({
      conversationId: conversation.id,
      userText: 'Plan my whole year.',
      deps: scope.deps,
      client: fake.client,
    });

    expect(result.toolCalls).toEqual([
      { toolUseId: 'toolu_ghost', name: 'plan_my_whole_year', ok: false },
    ]);

    const stored = await scope.db.repos.conversations.listMessages(conversation.id);
    expect(stored.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(blockTypes(stored[2])).toEqual(['tool_result']);
    const toolResult = stored[2].content[0] as {
      tool_use_id: string;
      is_error?: boolean;
      content: string;
    };
    expect(toolResult.tool_use_id).toBe('toolu_ghost');
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toContain('not found');

    // Every tool_use in the stored transcript has a matching tool_result, which
    // is what the API checks when the conversation is replayed next turn.
    const uses = stored.flatMap((message) =>
      (message.content as { type: string; id?: string }[])
        .filter((block) => block.type === 'tool_use')
        .map((block) => block.id),
    );
    const answered = stored.flatMap((message) =>
      (message.content as { type: string; tool_use_id?: string }[])
        .filter((block) => block.type === 'tool_result')
        .map((block) => block.tool_use_id),
    );
    expect(answered).toEqual(uses);
  });

  it('returns a typed refusal rather than throwing', async () => {
    const scope = await setup();
    const conversation = await scope.db.repos.conversations.create();
    const fake = createFakeAiClient({ turns: [refusalTurn('cyber', 'Declined.')] });

    const events: CoachEvent[] = [];
    const result = await runCoachTurn({
      conversationId: conversation.id,
      userText: 'Write me something off-limits.',
      deps: scope.deps,
      client: fake.client,
      onEvent: (event) => events.push(event),
    });

    expect(result.refusal).not.toBeNull();
    expect(result.refusal?.category).toBe('cyber');
    expect(result.text).toBe(result.refusal?.message);
    expect(events.some((event) => event.type === 'refusal')).toBe(true);
    // The turn is still on the record, so replay stays faithful.
    const stored = await scope.db.repos.conversations.listMessages(conversation.id);
    expect(stored).toHaveLength(2);
  });

  it('adds a volatile safety note when the local pre-filter fires', async () => {
    const scope = await setup();
    const conversation = await scope.db.repos.conversations.create();
    const fake = createFakeAiClient({ turns: [{ text: 'Let us stop there and log it.' }] });

    const result = await runCoachTurn({
      conversationId: conversation.id,
      userText: 'My knee is in pain when I squat.',
      deps: scope.deps,
      client: fake.client,
    });

    expect(result.safety.flagged).toBe(true);
    expect(result.safety.kind).toBe('pain');
    const system = fake.runnerRequests[0].system as { text: string; cache_control?: unknown }[];
    expect(system).toHaveLength(3);
    expect(system[2].cache_control).toBeUndefined();
    expect(system[2].text).toContain('SAFETY PRE-FILTER');
  });

  it('maps a transport failure onto AiError and emits it first', async () => {
    const scope = await setup();
    const conversation = await scope.db.repos.conversations.create();
    const messages: AiMessagesApi = {
      create: () => Promise.reject(new Error('unused')),
      countTokens: () => Promise.reject(new Error('unused')),
      toolRunner: () => ({
        params: { model: 'claude-opus-5', max_tokens: 10, messages: [], tools: [] },
        pushMessages: () => undefined,
        done: () => Promise.reject(new Error('unused')),
        // eslint-disable-next-line require-yield
        async *[Symbol.asyncIterator]() {
          throw new AuthenticationError(401, undefined, 'invalid x-api-key', new Headers());
        },
      }),
    };
    const client = createAiClient(messages);

    const events: CoachEvent[] = [];
    await expect(
      runCoachTurn({
        conversationId: conversation.id,
        userText: 'Hello',
        deps: scope.deps,
        client,
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toBeInstanceOf(AiError);

    const errorEvent = events.find((event) => event.type === 'error');
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === 'error') expect(errorEvent.error.kind).toBe('auth');
    // The user's message survives a failed request.
    expect(await scope.db.repos.conversations.listMessages(conversation.id)).toHaveLength(1);
  });
});

describe('selectHistory', () => {
  function message(role: Message['role'], text: string, index: number): Message {
    return {
      id: `m-${index}`,
      conversationId: 'c-1',
      role,
      content: [{ type: 'text', text }],
      model: role === 'assistant' ? 'claude-opus-5' : null,
      usage: null,
      createdAt: `2026-09-10T0${index}:00:00.000Z`,
    };
  }

  it('keeps everything that fits and adds no note', () => {
    const history = [message('user', 'hello', 1), message('assistant', 'hi', 2)];
    const selection = selectHistory(history);
    expect(selection.messages).toHaveLength(2);
    expect(selection.summaryNote).toBeNull();
    expect(selection.droppedCount).toBe(0);
  });

  it('drops the oldest turns past the budget and summarises them once', () => {
    const history = Array.from({ length: 12 }, (_, index) =>
      message(index % 2 === 0 ? 'user' : 'assistant', `turn ${index} ${'x'.repeat(400)}`, index),
    );
    const selection = selectHistory(history, { budgetTokens: 300 });
    expect(selection.messages.length).toBeLessThan(history.length);
    expect(selection.droppedCount).toBeGreaterThan(0);
    expect(selection.summaryNote).toContain('EARLIER IN THIS CONVERSATION');
    expect(selection.summaryNote).toContain('they asked:');
  });

  it('always starts on a user turn', () => {
    const history = [
      message('user', 'one', 1),
      message('assistant', 'two', 2),
      message('user', 'three', 3),
    ];
    const selection = selectHistory(history, { maxMessages: 2 });
    expect(selection.messages.map((entry) => entry.role)).toEqual(['user']);
    expect(selection.droppedCount).toBe(2);
  });

  function toolTranscript(): Message[] {
    const base = message('user', 'How is my bench going?', 1);
    const assistant: Message = {
      ...message('assistant', 'Let me look that up.', 2),
      content: [
        { type: 'text', text: 'Let me look that up.' },
        { type: 'tool_use', id: 'toolu_1', name: 'get_exercise_history', input: { limit: 3 } },
      ],
    };
    const toolResult: Message = {
      ...message('user', '', 3),
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"ok":true}' }],
    };
    return [base, assistant, toolResult, message('assistant', '60 kg for three sets.', 4)];
  }

  it('never starts the replay on a tool_result turn', () => {
    // Tool results are stored with role 'user', so a naive role check would
    // keep one at the front and the API would reject the request.
    const selection = selectHistory(toolTranscript(), { maxMessages: 2 });
    const head = selection.messages[0];
    if (head != null) {
      const blocks = head.content as { type: string }[];
      expect(head.role).toBe('user');
      expect(blocks.some((block) => block.type === 'tool_result')).toBe(false);
    }
    expect(selection.messages).toHaveLength(0);
    expect(selection.droppedCount).toBe(4);
  });

  it('summarises only genuine user questions, never a tool_result placeholder', () => {
    const history = [...toolTranscript(), message('user', 'And my squat?', 5)];
    const selection = selectHistory(history, { maxMessages: 1 });
    expect(selection.summaryNote).toContain('How is my bench going?');
    expect(selection.summaryNote).not.toContain('(no text)');
  });

  it('is deterministic', () => {
    const history = Array.from({ length: 20 }, (_, index) =>
      message(index % 2 === 0 ? 'user' : 'assistant', `turn ${index}`, index),
    );
    expect(JSON.stringify(selectHistory(history, { maxMessages: 6 }))).toBe(
      JSON.stringify(selectHistory(history, { maxMessages: 6 })),
    );
  });
});
