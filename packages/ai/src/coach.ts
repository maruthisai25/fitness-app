/**
 * The coach turn — DESIGN.md §6.2, §6.3, §4.1 (`conversations`, `messages`).
 *
 * One call to {@link runCoachTurn} does the whole round trip:
 *
 *   1. screens the message with the local safety pre-filter (§6.5);
 *   2. persists the user turn, so nothing is lost if the request fails;
 *   3. rebuilds the layered context and picks the history that fits the budget;
 *   4. streams the model's answer through `onEvent` while the tool runner
 *      executes tools locally;
 *   5. appends every assistant turn — text, `tool_use` and the matching
 *      `tool_result` blocks — to `messages`, so replaying the conversation
 *      reproduces it exactly;
 *   6. records usage on each assistant row.
 *
 * There is no server compaction here on purpose: an offline-first app cannot
 * depend on a server-side summary it may never be able to fetch again. When the
 * history outgrows its budget the older turns collapse into one deterministic
 * system-side note (see {@link selectHistory}).
 */

import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTextBlockParam,
  BetaToolResultContentBlockParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { Id, Message, TokenUsage } from '@vigor/core';

import {
  refusalOf,
  systemBlock,
  textOf,
  usageOf,
  type AiClient,
  type AiMessageStream,
} from './client';
import {
  buildCoachContext,
  collectCoachContext,
  coachUserContent,
  estimateCoachContextTokens,
  type CoachContext,
  type CollectCoachContextOptions,
} from './context';
import type { CoachDeps } from './deps';
import { toAiError, type AiError, type CoachRefusal } from './errors';
import { SAFETY_PREFILTER_NOTE, screenForSafety, type SafetyScreenResult } from './safety';
import { createCoachTools, type CoachTool } from './tools';

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * What a chat screen renders as the turn happens. Every event is emitted
 * synchronously from the streaming loop, so a UI can append text as it arrives
 * and show tool activity without polling.
 */
export type CoachEvent =
  /** The user's row, already written to `messages`. */
  | { type: 'user_message'; message: Message }
  /** A chunk of the visible answer. */
  | { type: 'text_delta'; text: string }
  /** A chunk of summarised thinking, when the model emits any. */
  | { type: 'thinking_delta'; text: string }
  /** A tool is about to run locally, with the input the model chose. */
  | { type: 'tool_start'; toolUseId: string; name: string; input: unknown }
  /** That tool finished. `content` is the JSON string the model will read. */
  | { type: 'tool_result'; toolUseId: string; name: string; ok: boolean; content: string }
  /** One assistant turn is complete and persisted. */
  | { type: 'assistant_message'; message: Message }
  /** Running token totals for the turn. */
  | { type: 'usage'; usage: TokenUsage }
  /** The model declined. Not an error — the turn ends normally. */
  | { type: 'refusal'; refusal: CoachRefusal }
  /** The request failed. `runCoachTurn` throws this same error afterwards. */
  | { type: 'error'; error: AiError }
  /** The turn is over. */
  | { type: 'done'; result: CoachTurnResult };

export type CoachEventHandler = (event: CoachEvent) => void;

// ---------------------------------------------------------------------------
// History budget
// ---------------------------------------------------------------------------

/** Roughly a third of the window, leaving room for context, tools and output. */
export const DEFAULT_HISTORY_TOKEN_BUDGET = 24000;

/** Even inside the budget, this many messages is plenty of conversation. */
export const DEFAULT_HISTORY_MAX_MESSAGES = 40;

/** Ceiling on tool round trips in one turn. */
export const DEFAULT_MAX_ITERATIONS = 8;

export interface HistorySelection {
  /** Newest messages that fit, oldest first, starting on a user turn. */
  messages: BetaMessageParam[];
  /** One deterministic note about what was dropped, or null when nothing was. */
  summaryNote: string | null;
  droppedCount: number;
}

/** ~4 characters per token; deliberately cheap and slightly pessimistic. */
function estimateMessageTokens(message: Message): number {
  return Math.ceil(JSON.stringify(message.content).length / 4);
}

/**
 * True when a stored row is a tool_result turn. Those are persisted with
 * `role: 'user'` because that is the role the API requires for them, so role
 * alone cannot tell a real user turn from a tool answer.
 */
function isToolResultTurn(message: Message): boolean {
  return message.content.some(
    (block) =>
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: unknown }).type === 'tool_result',
  );
}

function firstTextOf(message: Message): string {
  for (const block of message.content) {
    if (
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
    ) {
      return (block as { text: string }).text;
    }
  }
  return '';
}

/**
 * Keeps the newest turns that fit and folds the rest into one note. Pure and
 * deterministic: the same stored conversation always produces the same request.
 */
export function selectHistory(
  history: readonly Message[],
  options: { budgetTokens?: number; maxMessages?: number } = {},
): HistorySelection {
  const budget = options.budgetTokens ?? DEFAULT_HISTORY_TOKEN_BUDGET;
  const maxMessages = options.maxMessages ?? DEFAULT_HISTORY_MAX_MESSAGES;

  const usable = history.filter((message) => message.role !== 'system');
  const kept: Message[] = [];
  let spent = 0;
  for (let index = usable.length - 1; index >= 0; index -= 1) {
    const message = usable[index];
    const cost = estimateMessageTokens(message);
    if (kept.length >= maxMessages || (kept.length > 0 && spent + cost > budget)) break;
    kept.unshift(message);
    spent += cost;
  }

  // The API requires the first message to be a real user turn. A tool_result
  // row is stored with `role: 'user'` too, and one at the front would be
  // missing the `tool_use` it answers — a 400 that would brick the
  // conversation on every retry — so those are dropped as well.
  while (kept.length > 0 && (kept[0].role !== 'user' || isToolResultTurn(kept[0]))) kept.shift();

  const dropped = usable.slice(0, usable.length - kept.length);
  const droppedQuestions = dropped.filter(
    (message) =>
      message.role === 'user' &&
      !isToolResultTurn(message) &&
      firstTextOf(message).trim().length > 0,
  );
  const summaryNote =
    dropped.length === 0
      ? null
      : [
          `EARLIER IN THIS CONVERSATION — ${dropped.length} message(s) before the ones you can see, summarised so the transcript stays affordable:`,
          ...droppedQuestions.slice(-10).map((message) => {
            const text = firstTextOf(message).replace(/\s+/g, ' ').trim();
            return `- they asked: ${text.length > 160 ? `${text.slice(0, 157)}…` : text}`;
          }),
          'Treat this as background only. If a detail matters, look it up with a tool rather than guessing what was said.',
        ].join('\n');

  return {
    messages: kept.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content as BetaContentBlockParam[],
    })),
    summaryNote,
    droppedCount: dropped.length,
  };
}

// ---------------------------------------------------------------------------
// Running a turn
// ---------------------------------------------------------------------------

export interface RunCoachTurnOptions {
  conversationId: Id;
  userText: string;
  deps: CoachDeps;
  client: AiClient;
  /** Streamed progress. Optional — the result carries everything too. */
  onEvent?: CoachEventHandler;
  /** A context built earlier this render, e.g. one already token-counted. */
  context?: CoachContext;
  /** Passed through when this call builds the context itself. */
  contextOptions?: CollectCoachContextOptions;
  /** Overrides the tool set — tests pass a subset. */
  tools?: CoachTool[];
  signal?: AbortSignal;
  maxIterations?: number;
  historyBudgetTokens?: number;
  historyMaxMessages?: number;
}

export interface CoachTurnResult {
  conversationId: Id;
  userMessage: Message;
  /** Every assistant and tool_result row written this turn, in order. */
  assistantMessages: Message[];
  /** The visible answer, all text blocks of every assistant turn joined. */
  text: string;
  refusal: CoachRefusal | null;
  stopReason: string | null;
  usage: TokenUsage;
  toolCalls: { toolUseId: string; name: string; ok: boolean }[];
  /** What the local pre-filter saw in the user's message (DESIGN.md §6.5). */
  safety: SafetyScreenResult;
  iterations: number;
  /** Offline estimate of the prompt, for the settings screen's usage panel. */
  contextTokensEstimate: number;
}

interface RecordedToolRun {
  name: string;
  content: string | BetaToolResultContentBlockParam[];
  ok: boolean;
}

function contentToText(content: string | readonly BetaToolResultContentBlockParam[]): string {
  if (typeof content === 'string') return content;
  return content
    .map((block) => (block.type === 'text' ? block.text : `[${block.type}]`))
    .join('\n');
}

/** Wraps every tool so the UI sees activity and the transcript can be rebuilt. */
function instrumentTools(
  tools: readonly CoachTool[],
  emit: CoachEventHandler,
  runs: Map<string, RecordedToolRun>,
  parseFailures: Map<string, string>,
): CoachTool[] {
  return tools.map((tool) => {
    const name = tool.name;
    const original = tool.run;
    const originalParse = tool.parse;
    const instrumented: CoachTool = {
      ...tool,
      // The runner validates before it runs, so an input the model got wrong
      // never reaches `run`. Recording the rejection here keeps the persisted
      // transcript identical to what the model was shown.
      parse: (content: unknown) => {
        try {
          return originalParse(content);
        } catch (error) {
          parseFailures.set(name, error instanceof Error ? error.message : String(error));
          throw error;
        }
      },
      run: async (args: never, context?: Parameters<typeof original>[1]) => {
        const toolUseId = context?.toolUse?.id ?? '';
        emit({ type: 'tool_start', toolUseId, name, input: args });
        try {
          const result = await original(args, context);
          runs.set(toolUseId, { name, content: result as string, ok: true });
          emit({
            type: 'tool_result',
            toolUseId,
            name,
            ok: true,
            content: contentToText(result as string),
          });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          // Mirrors the runner's own conversion, so the persisted transcript
          // matches what the model was actually shown.
          runs.set(toolUseId, { name, content: `Error: ${message}`, ok: false });
          emit({ type: 'tool_result', toolUseId, name, ok: false, content: message });
          throw error;
        }
      },
    };
    return instrumented;
  });
}

function toolResultMessageFor(
  message: BetaMessage,
  runs: Map<string, RecordedToolRun>,
  parseFailures: Map<string, string>,
  emit: CoachEventHandler,
): { content: BetaContentBlockParam[]; calls: { toolUseId: string; name: string; ok: boolean }[] } {
  const uses = message.content.filter(
    (block): block is BetaToolUseBlock => block.type === 'tool_use',
  );
  const content: BetaContentBlockParam[] = [];
  const calls: { toolUseId: string; name: string; ok: boolean }[] = [];
  for (const use of uses) {
    let run = runs.get(use.id);
    if (run == null) {
      // Either the input failed validation before `run` was reached, or the
      // model named a tool that does not exist — the runner answers that one
      // itself and never calls into our wrappers. Every `tool_use` must still
      // get a `tool_result`, otherwise the next turn replays an assistant
      // message with a dangling call and the API rejects it with a 400.
      const rejected = parseFailures.get(use.name) ?? `Tool '${use.name}' not found`;
      run = { name: use.name, content: `Error: ${rejected}`, ok: false };
      emit({ type: 'tool_result', toolUseId: use.id, name: use.name, ok: false, content: rejected });
    }
    content.push({
      type: 'tool_result',
      tool_use_id: use.id,
      content: typeof run.content === 'string' ? run.content : run.content,
      ...(run.ok ? {} : { is_error: true }),
    });
    calls.push({ toolUseId: use.id, name: run.name, ok: run.ok });
  }
  return { content, calls };
}

function addUsage(total: TokenUsage, next: TokenUsage): TokenUsage {
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    cacheCreationInputTokens:
      next.cacheCreationInputTokens == null
        ? total.cacheCreationInputTokens
        : (total.cacheCreationInputTokens ?? 0) + next.cacheCreationInputTokens,
    cacheReadInputTokens:
      next.cacheReadInputTokens == null
        ? total.cacheReadInputTokens
        : (total.cacheReadInputTokens ?? 0) + next.cacheReadInputTokens,
  };
}

/**
 * One coach turn, start to finish. Throws {@link AiError} when the request
 * fails; a model refusal comes back on `result.refusal` instead, because
 * DESIGN.md §6.1 requires the coach to show its fallback line and keep working.
 */
export async function runCoachTurn(options: RunCoachTurnOptions): Promise<CoachTurnResult> {
  const { conversationId, userText, deps, client } = options;
  const emit: CoachEventHandler = options.onEvent ?? (() => undefined);

  const safety = screenForSafety(userText);
  const priorMessages = await deps.repos.conversations.listMessages(conversationId);
  const userMessage = await deps.repos.conversations.appendMessage(conversationId, {
    role: 'user',
    content: [{ type: 'text', text: userText }],
  });
  emit({ type: 'user_message', message: userMessage });

  const context =
    options.context ??
    buildCoachContext(await collectCoachContext(deps, options.contextOptions ?? {}));

  const history = selectHistory(priorMessages, {
    ...(options.historyBudgetTokens == null ? {} : { budgetTokens: options.historyBudgetTokens }),
    ...(options.historyMaxMessages == null ? {} : { maxMessages: options.historyMaxMessages }),
  });

  // Volatile system blocks sit after the cached breakpoints, so the prefix from
  // `context.system` still reads from cache on every turn.
  const system: BetaTextBlockParam[] = [...context.system];
  if (history.summaryNote != null) system.push(systemBlock(history.summaryNote));
  if (safety.flagged) {
    system.push(
      systemBlock(
        `SAFETY PRE-FILTER: this message matched ${safety.matches.join(', ')} (${safety.severity}). ` +
          `Treat it as a possible pain or symptom report unless an open safety event already covers it: ` +
          `call report_safety first, hold progression, and say something close to — "${SAFETY_PREFILTER_NOTE}"`,
      ),
    );
  }

  const runs = new Map<string, RecordedToolRun>();
  const parseFailures = new Map<string, string>();
  const tools = instrumentTools(options.tools ?? createCoachTools(deps), emit, runs, parseFailures);

  const assistantMessages: Message[] = [];
  const toolCalls: { toolUseId: string; name: string; ok: boolean }[] = [];
  let usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: null,
    cacheReadInputTokens: null,
  };
  let refusal: CoachRefusal | null = null;
  let stopReason: string | null = null;
  let iterations = 0;
  let text = '';

  try {
    const runner = client.messages.toolRunner({
      ...client.requestBase('chat'),
      system,
      tools,
      messages: [
        ...history.messages,
        { role: 'user', content: coachUserContent(context, userText) },
      ],
      stream: true,
      max_iterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    });

    // The runner executes tools when the iterator is resumed, not when the
    // message is yielded, so a turn's tool results only exist once the next
    // iteration starts. Persisting them is deferred by one step for that
    // reason — the transcript still ends up in the right order.
    let pending: BetaMessage | null = null;
    const flushToolResults = async (message: BetaMessage): Promise<void> => {
      const results = toolResultMessageFor(message, runs, parseFailures, emit);
      if (results.content.length === 0) return;
      toolCalls.push(...results.calls);
      const persisted = await deps.repos.conversations.appendMessage(conversationId, {
        role: 'user',
        content: results.content,
      });
      assistantMessages.push(persisted);
      emit({ type: 'assistant_message', message: persisted });
    };

    for await (const stream of runner as AsyncIterable<AiMessageStream>) {
      if (pending != null) {
        await flushToolResults(pending);
        pending = null;
      }
      iterations += 1;
      for await (const event of stream) {
        if (event.type !== 'content_block_delta') continue;
        if (event.delta.type === 'text_delta') {
          text += event.delta.text;
          emit({ type: 'text_delta', text: event.delta.text });
        } else if (event.delta.type === 'thinking_delta') {
          emit({ type: 'thinking_delta', text: event.delta.thinking });
        }
      }

      const message = await stream.finalMessage();
      stopReason = message.stop_reason ?? null;
      const turnUsage = usageOf(message);
      usage = addUsage(usage, turnUsage);
      emit({ type: 'usage', usage });

      const persistedAssistant = await deps.repos.conversations.appendMessage(conversationId, {
        role: 'assistant',
        content: message.content,
        model: message.model,
        usage: turnUsage,
      });
      assistantMessages.push(persistedAssistant);
      emit({ type: 'assistant_message', message: persistedAssistant });

      const turnRefusal = refusalOf(message);
      if (turnRefusal != null) {
        refusal = turnRefusal;
        emit({ type: 'refusal', refusal: turnRefusal });
        break;
      }

      pending = message;

      // The runner only continues after a client tool produced a result, so a
      // paused server-tool turn would otherwise end the loop silently.
      if (message.stop_reason === 'pause_turn') {
        runner.pushMessages({ role: 'assistant', content: message.content });
      }
    }

    if (pending != null) await flushToolResults(pending);
  } catch (error) {
    const aiError = toAiError(error);
    emit({ type: 'error', error: aiError });
    throw aiError;
  }

  if (text.length === 0) {
    text = assistantMessages
      .filter((message) => message.role === 'assistant')
      .map((message) => firstTextOf(message))
      .join('')
      .trim();
  }
  if (refusal != null && text.trim().length === 0) text = refusal.message;

  const result: CoachTurnResult = {
    conversationId,
    userMessage,
    assistantMessages,
    text,
    refusal,
    stopReason,
    usage,
    toolCalls,
    safety,
    iterations,
    contextTokensEstimate: estimateCoachContextTokens(context, userText),
  };
  emit({ type: 'done', result });
  return result;
}

/** The visible text of a finished SDK message. Re-exported for chat screens. */
export { textOf };
