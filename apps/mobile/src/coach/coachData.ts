/**
 * The coach chat's data layer, free of React — DESIGN.md §6, §7.1.
 *
 * Kept out of the hook module so the message-rendering and memory-extraction
 * logic can be unit tested without rendering anything, the same split
 * `session/sessionData.ts` uses for session mode.
 */
import { CONTEXT_MEMORY_LIMIT, extractMemories, type AiClient } from '@vigor/ai';
import type { Id, Memory, Rationale } from '@vigor/core';
import type { Repositories } from '@vigor/db';

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/**
 * The conversation quick actions (Today's plan card, session mode's "ask the
 * coach") write into: the user's most recent one, or a fresh one when they
 * have never talked to the coach. Opening the coach button's conversation
 * list always shows it, so nothing here is hidden from the user.
 */
export async function getOrCreateDefaultConversation(repos: Repositories): Promise<Id> {
  const latest = await repos.conversations.latest();
  if (latest) return latest.id;
  const created = await repos.conversations.create({ title: 'Coach' });
  return created.id;
}

// ---------------------------------------------------------------------------
// Rendering persisted history — DESIGN.md §4.1 "content holds Anthropic
// content blocks (incl. tool_use/tool_result)"
// ---------------------------------------------------------------------------

interface AnyBlock {
  type?: unknown;
  text?: unknown;
  id?: unknown;
  name?: unknown;
  input?: unknown;
  tool_use_id?: unknown;
  content?: unknown;
  is_error?: unknown;
}

function isBlock(value: unknown): value is AnyBlock {
  return typeof value === 'object' && value !== null;
}

function textFromBlocks(blocks: readonly unknown[]): string {
  return blocks
    .filter(isBlock)
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('');
}

interface ToolUseBlock {
  id: string;
  name: string;
  input: unknown;
}

function toolUsesFromBlocks(blocks: readonly unknown[]): ToolUseBlock[] {
  return blocks
    .filter(isBlock)
    .filter(
      (block): block is AnyBlock & { id: string; name: string } =>
        block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string',
    )
    .map((block) => ({ id: block.id, name: block.name, input: block.input }));
}

interface ToolResultBlock {
  toolUseId: string;
  ok: boolean;
  text: string;
}

function contentBlockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(isBlock)
    .map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .join('');
}

function toolResultsFromBlocks(blocks: readonly unknown[]): ToolResultBlock[] {
  return blocks
    .filter(isBlock)
    .filter(
      (block): block is AnyBlock & { tool_use_id: string } =>
        block.type === 'tool_result' && typeof block.tool_use_id === 'string',
    )
    .map((block) => ({
      toolUseId: block.tool_use_id,
      ok: !block.is_error,
      text: contentBlockText(block.content),
    }));
}

export interface ToolCallItem {
  toolUseId: string;
  name: string;
  input: unknown;
  /** `null` when the matching `tool_result` has not been persisted yet. */
  ok: boolean | null;
  resultText: string | null;
}

export interface UserTurnItem {
  kind: 'user';
  messageId: Id;
  text: string;
}

export interface AssistantTurnItem {
  kind: 'assistant';
  messageId: Id;
  text: string;
  tools: ToolCallItem[];
}

export type TurnItem = UserTurnItem | AssistantTurnItem;

interface MessageLike {
  id: Id;
  role: string;
  content: readonly unknown[];
}

/**
 * Turns the flat, persisted message log into what the chat screen renders:
 * one bubble per user turn, one bubble per assistant turn with its tool calls
 * paired to their results (a `tool_result` row is never shown as its own
 * bubble — it is data attached to the `tool_use` that asked for it).
 */
export function buildTurnItems(messages: readonly MessageLike[]): TurnItem[] {
  const resultsById = new Map<string, { ok: boolean; text: string }>();
  for (const message of messages) {
    if (message.role !== 'user') continue;
    for (const result of toolResultsFromBlocks(message.content)) {
      resultsById.set(result.toolUseId, { ok: result.ok, text: result.text });
    }
  }

  const items: TurnItem[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      const isToolResultCarrier = toolResultsFromBlocks(message.content).length > 0;
      if (isToolResultCarrier) continue;
      const text = textFromBlocks(message.content);
      if (text.trim().length === 0) continue;
      items.push({ kind: 'user', messageId: message.id, text });
    } else if (message.role === 'assistant') {
      const text = textFromBlocks(message.content);
      const tools: ToolCallItem[] = toolUsesFromBlocks(message.content).map((use) => {
        const result = resultsById.get(use.id);
        return {
          toolUseId: use.id,
          name: use.name,
          input: use.input,
          ok: result?.ok ?? null,
          resultText: result?.text ?? null,
        };
      });
      if (text.trim().length === 0 && tools.length === 0) continue;
      items.push({ kind: 'assistant', messageId: message.id, text, tools });
    }
  }
  return items;
}

/** Tools whose `ok` JSON result carries a `Rationale` worth a "Why?" panel. */
const RATIONALE_TOOLS = new Set(['propose_workout', 'substitute_exercise']);

/** Pulls the `Rationale` out of a tool's JSON result, when it has one. */
export function rationaleFromToolResult(name: string, resultText: string | null): Rationale | null {
  if (resultText == null || !RATIONALE_TOOLS.has(name)) return null;
  try {
    const parsed = JSON.parse(resultText) as { ok?: boolean; rationale?: Rationale };
    if (parsed.ok && parsed.rationale) return parsed.rationale;
  } catch {
    // Not JSON (or not the shape we expect) — nothing to show.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Memory extraction — DESIGN.md §6.4
// ---------------------------------------------------------------------------

/** Below this the extraction task itself flagged low confidence; skip storing it. */
const MIN_CONFIDENCE_TO_KEEP = 0.35;

export interface RememberedChip {
  memory: Memory;
  confidence: number;
}

/**
 * Runs the fast-model memory-extraction task on the user's latest message and
 * writes whatever it proposes straight away (`source: 'derived'`), returning
 * the rows so the chat screen can show "Remembered: …" chips with undo — the
 * undo is `memories.forget`, so the row and its audit trail both survive.
 */
export async function extractAndRecordMemories(
  client: AiClient,
  repos: Repositories,
  userText: string,
): Promise<RememberedChip[]> {
  const existing = (await repos.memories.listActive({ limit: CONTEXT_MEMORY_LIMIT })).map(
    (memory) => memory.text,
  );
  const { memories, refusal } = await extractMemories({ client, userText, existing });
  if (refusal != null || memories.length === 0) return [];

  const chips: RememberedChip[] = [];
  for (const proposal of memories) {
    if (proposal.confidence < MIN_CONFIDENCE_TO_KEEP) continue;
    const memory = await repos.memories.create({
      kind: proposal.kind,
      domain: proposal.domain,
      text: proposal.text,
      source: 'derived',
      confidence: proposal.confidence,
    });
    chips.push({ memory, confidence: proposal.confidence });
  }
  return chips;
}
