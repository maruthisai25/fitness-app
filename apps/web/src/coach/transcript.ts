/**
 * Turns the persisted `messages` rows (Anthropic content blocks — DESIGN.md
 * §4.1) into the blocks the chat panel renders. Pure and independently
 * testable: the same function reads a conversation on reload as renders it
 * live, so history and a fresh turn never look different once it lands.
 */

import type { Message, Rationale } from '@vigor/core';

import { parseToolResult } from './toolPresentation';

export type ChatBlock =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; ok: boolean; content: string }
  | { kind: 'proposedWorkout'; id: string; workoutId: string; title: string; rationale: Rationale };

interface TextBlock {
  type: 'text';
  text: string;
}
interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}
interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | { type: string; text?: string }[];
  is_error?: boolean;
}

function isTextBlock(block: unknown): block is TextBlock {
  return isRecord(block) && block.type === 'text' && typeof block.text === 'string';
}
function isToolUseBlock(block: unknown): block is ToolUseBlock {
  return (
    isRecord(block) &&
    block.type === 'tool_use' &&
    typeof block.id === 'string' &&
    typeof block.name === 'string'
  );
}
function isToolResultBlock(block: unknown): block is ToolResultBlock {
  return isRecord(block) && block.type === 'tool_result' && typeof block.tool_use_id === 'string';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toolResultText(content: ToolResultBlock['content']): string {
  if (typeof content === 'string') return content;
  return content.map((block) => (block.type === 'text' ? (block.text ?? '') : `[${block.type}]`)).join('\n');
}

/** Builds the render blocks for one conversation, oldest first. */
export function buildTranscript(messages: readonly Message[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  const toolNameByUseId = new Map<string, string>();

  for (const message of messages) {
    const content = message.content as unknown[];

    if (message.role === 'assistant') {
      for (const block of content) {
        if (isTextBlock(block)) {
          if (block.text.trim().length > 0) {
            blocks.push({ kind: 'assistant', id: `${message.id}-${blocks.length}`, text: block.text });
          }
        } else if (isToolUseBlock(block)) {
          toolNameByUseId.set(block.id, block.name);
        }
      }
      continue;
    }

    // role 'user': either the person's own chat text, or a relayed batch of
    // `tool_result` blocks the coach loop appended after running tools —
    // DESIGN.md §6.2 step 5.
    const textBlocks = content.filter(isTextBlock);
    if (textBlocks.length > 0) {
      const text = textBlocks.map((block) => block.text).join('');
      if (text.trim().length > 0) blocks.push({ kind: 'user', id: message.id, text });
      continue;
    }

    for (const block of content) {
      if (!isToolResultBlock(block)) continue;
      const name = toolNameByUseId.get(block.tool_use_id) ?? 'tool';
      const ok = block.is_error !== true;
      const text = toolResultText(block.content);

      if (name === 'propose_workout' && ok) {
        const parsed = parseToolResult(text);
        if (parsed && typeof parsed.workoutId === 'string') {
          blocks.push({
            kind: 'proposedWorkout',
            id: `${message.id}-${block.tool_use_id}`,
            workoutId: parsed.workoutId,
            title: typeof parsed.title === 'string' ? parsed.title : 'Proposed workout',
            rationale: parsed.rationale as Rationale,
          });
          continue;
        }
      }
      blocks.push({ kind: 'tool', id: `${message.id}-${block.tool_use_id}`, name, ok, content: text });
    }
  }

  return blocks;
}
