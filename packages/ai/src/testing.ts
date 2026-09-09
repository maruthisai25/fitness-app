/**
 * A scripted stand-in for `client.beta.messages` — DESIGN.md §10: "tools tested
 * with a fake driver … Live API tests are opt-in behind `VIGOR_LIVE_AI=1`".
 *
 * The fake implements the same `AiMessagesApi` the real client exposes, so
 * every code path under test is the shipped one. It also runs tools exactly
 * where the SDK's runner does — when the iterator is resumed, not when the
 * message is yielded — because the coach loop depends on that ordering.
 *
 * Not exported from `src/index.ts`: tests import it by path
 * (`@vigor/ai/testing`), so it never reaches an app bundle.
 */

import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaMessageTokensCount,
  BetaRawMessageStreamEvent,
  BetaRefusalStopDetails,
  BetaStopReason,
  BetaToolRunnerParams,
  BetaToolUseBlock,
  MessageCountTokensParams,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';

import {
  createAiClient,
  type AiClient,
  type AiMessageStream,
  type AiMessagesApi,
  type AiToolRunner,
  type ModelSettings,
} from './client';
import type { CoachTool } from './tools';

/** One scripted assistant turn. */
export interface FakeTurn {
  /** Visible text, streamed as a single delta unless `textChunks` is given. */
  text?: string;
  textChunks?: string[];
  thinking?: string;
  /** Tool calls the fake runner will actually execute against the real tools. */
  toolUses?: { id: string; name: string; input: unknown }[];
  stopReason?: BetaStopReason;
  stopDetails?: BetaRefusalStopDetails | null;
  model?: string;
  usage?: { input?: number; output?: number; cacheCreate?: number; cacheRead?: number };
}

/** Everything the fake recorded, so a test can assert on the request shape. */
export interface FakeAiClientHandle {
  client: AiClient;
  /** Bodies passed to `messages.create`, in order. */
  createRequests: MessageCreateParamsNonStreaming[];
  /** Bodies passed to `messages.toolRunner`, in order. */
  runnerRequests: BetaToolRunnerParams[];
  /** Bodies passed to `messages.countTokens`, in order. */
  countRequests: MessageCountTokensParams[];
  /** Replaces the remaining scripted chat turns. */
  setTurns(turns: FakeTurn[]): void;
  /** Replaces the remaining scripted `create` responses. */
  setResponses(responses: FakeTurn[]): void;
}

export interface CreateFakeAiClientOptions {
  /** Turns the tool runner yields, in order. Defaults to one plain answer. */
  turns?: FakeTurn[];
  /** Responses `messages.create` returns, in order. */
  responses?: FakeTurn[];
  /** What `countTokens` reports. Default 1234. */
  inputTokens?: number;
  settings?: Partial<ModelSettings>;
}

const DEFAULT_MODEL = 'claude-opus-5';

function contentOf(turn: FakeTurn): BetaContentBlock[] {
  const content: BetaContentBlock[] = [];
  const text = turn.text ?? turn.textChunks?.join('') ?? '';
  if (turn.thinking != null) {
    content.push({ type: 'thinking', thinking: turn.thinking, signature: 'fake-signature' });
  }
  if (text.length > 0) content.push({ type: 'text', text, citations: null });
  for (const use of turn.toolUses ?? []) {
    content.push({
      type: 'tool_use',
      id: use.id,
      name: use.name,
      input: use.input,
    } as BetaToolUseBlock);
  }
  return content;
}

export function fakeMessage(turn: FakeTurn): BetaMessage {
  const hasTools = (turn.toolUses ?? []).length > 0;
  return {
    id: `msg_fake_${Math.abs(hashOf(JSON.stringify(turn)))}`,
    type: 'message',
    role: 'assistant',
    model: turn.model ?? DEFAULT_MODEL,
    content: contentOf(turn),
    stop_reason: turn.stopReason ?? (hasTools ? 'tool_use' : 'end_turn'),
    stop_sequence: null,
    stop_details: turn.stopDetails ?? null,
    container: null,
    context_management: null,
    diagnostics: null,
    usage: {
      input_tokens: turn.usage?.input ?? 100,
      output_tokens: turn.usage?.output ?? 20,
      cache_creation_input_tokens: turn.usage?.cacheCreate ?? 0,
      cache_read_input_tokens: turn.usage?.cacheRead ?? 0,
      cache_creation: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as unknown as BetaMessage;
}

function hashOf(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function eventsOf(turn: FakeTurn, message: BetaMessage): BetaRawMessageStreamEvent[] {
  const events: BetaRawMessageStreamEvent[] = [
    { type: 'message_start', message } as BetaRawMessageStreamEvent,
  ];
  let index = 0;
  if (turn.thinking != null) {
    events.push({
      type: 'content_block_delta',
      index,
      delta: { type: 'thinking_delta', thinking: turn.thinking },
    } as BetaRawMessageStreamEvent);
    index += 1;
  }
  const chunks = turn.textChunks ?? (turn.text == null ? [] : [turn.text]);
  for (const chunk of chunks) {
    events.push({
      type: 'content_block_delta',
      index,
      delta: { type: 'text_delta', text: chunk },
    } as BetaRawMessageStreamEvent);
  }
  events.push({ type: 'message_stop' } as BetaRawMessageStreamEvent);
  return events;
}

function makeStream(message: BetaMessage, events: BetaRawMessageStreamEvent[]): AiMessageStream {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
    async finalMessage() {
      return message;
    },
  };
}

async function runFakeTool(
  tools: readonly unknown[],
  use: { id: string; name: string; input: unknown },
): Promise<{ content: string; isError: boolean }> {
  const tool = tools.find(
    (candidate): candidate is CoachTool =>
      typeof candidate === 'object' && candidate !== null && (candidate as { name?: string }).name === use.name,
  );
  if (tool == null) return { content: `Error: no tool named ${use.name}`, isError: true };
  try {
    const parsed = tool.parse(use.input);
    const result = await tool.run(parsed, {
      toolUse: { type: 'tool_use', id: use.id, name: use.name, input: use.input } as BetaToolUseBlock,
      toolUseBlock: { type: 'tool_use', id: use.id, name: use.name, input: use.input } as BetaToolUseBlock,
    });
    return { content: typeof result === 'string' ? result : JSON.stringify(result), isError: false };
  } catch (error) {
    return {
      content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

class FakeToolRunner implements AiToolRunner {
  readonly params: BetaToolRunnerParams;
  private readonly turns: FakeTurn[];
  private last: BetaMessage | null = null;

  constructor(params: BetaToolRunnerParams, turns: FakeTurn[]) {
    this.params = { ...params, messages: [...params.messages] };
    this.turns = turns;
  }

  pushMessages(...messages: BetaMessageParam[]): void {
    this.params.messages.push(...messages);
  }

  async done(): Promise<BetaMessage> {
    if (this.last == null) throw new Error('FakeToolRunner produced no messages');
    return this.last;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AiMessageStream> {
    for (const turn of this.turns) {
      const message = fakeMessage(turn);
      this.last = message;
      yield makeStream(message, eventsOf(turn, message));

      const uses = (turn.toolUses ?? []).map((use) => use);
      if (uses.length === 0) return;

      // Resumed: this is where the real runner executes tools too.
      const results: BetaContentBlockParam[] = [];
      for (const use of uses) {
        const outcome = await runFakeTool(this.params.tools, use);
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: outcome.content,
          ...(outcome.isError ? { is_error: true } : {}),
        });
      }
      this.params.messages.push(
        { role: 'assistant', content: message.content as BetaContentBlockParam[] },
        { role: 'user', content: results },
      );
    }
  }
}

/**
 * Builds a client whose every call is scripted. Nothing reaches the network,
 * and the recorded request bodies let a test assert on effort, thinking,
 * fallbacks and the cached prefix.
 */
export function createFakeAiClient(
  options: CreateFakeAiClientOptions = {},
): FakeAiClientHandle {
  let turns = options.turns ?? [{ text: 'Sounds good.' }];
  let responses = options.responses ?? [];
  const createRequests: MessageCreateParamsNonStreaming[] = [];
  const runnerRequests: BetaToolRunnerParams[] = [];
  const countRequests: MessageCountTokensParams[] = [];

  const messages: AiMessagesApi = {
    async create(params) {
      createRequests.push(params);
      const next = responses.shift();
      if (next == null) throw new Error('createFakeAiClient: no scripted response left for create()');
      return fakeMessage(next);
    },
    async countTokens(params) {
      countRequests.push(params);
      return {
        input_tokens: options.inputTokens ?? 1234,
        context_management: null,
      } as BetaMessageTokensCount;
    },
    toolRunner(params) {
      runnerRequests.push(params);
      return new FakeToolRunner(params, turns);
    },
  };

  return {
    client: createAiClient(messages, options.settings),
    createRequests,
    runnerRequests,
    countRequests,
    setTurns(next) {
      turns = next;
    },
    setResponses(next) {
      responses = next;
    },
  };
}

/** A turn that carries structured JSON, for the task tests. */
export function jsonTurn(value: unknown, extra: Partial<FakeTurn> = {}): FakeTurn {
  return { text: JSON.stringify(value), ...extra };
}

/** A refused turn, for the refusal-handling tests. */
export function refusalTurn(
  category = 'reasoning_extraction',
  explanation = 'Declined by policy.',
): FakeTurn {
  return {
    text: '',
    stopReason: 'refusal',
    stopDetails: { type: 'refusal', category, explanation } as unknown as BetaRefusalStopDetails,
  };
}
