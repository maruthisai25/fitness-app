/**
 * Runs one coach turn and turns its `CoachEvent` stream into render state —
 * DESIGN.md §6.2/§6.3 (tool activity), §6.4 (memory extraction), §7.2 (shared
 * invalidation).
 */

import {
  extractMemories,
  runCoachTurn,
  toAiError,
  type AiError,
  type CoachRefusal,
} from '@vigor/ai';
import type { Id, MemoryDomain, MemoryKind } from '@vigor/core';
import { useCallback, useState } from 'react';

import { useInvalidate, useRepos } from '../data/hooks';
import { useCoach } from './CoachProvider';
import { mutationsForToolCalls, parseToolResult } from './toolPresentation';

export interface LiveToolCall {
  toolUseId: string;
  name: string;
  input: unknown;
  status: 'running' | 'ok' | 'error';
  content?: string;
}

export interface LiveTurn {
  text: string;
  thinking: string;
  toolCalls: LiveToolCall[];
  refusal: CoachRefusal | null;
  error: AiError | null;
}

/** A memory the chat panel shows as a chip — already written, or waiting to be. */
export type MemoryChip =
  | { id: Id; kind: 'remembered'; text: string }
  | { id: string; kind: 'proposed'; text: string; memoryKind: MemoryKind; domain: MemoryDomain; confidence: number };

function emptyTurn(): LiveTurn {
  return { text: '', thinking: '', toolCalls: [], refusal: null, error: null };
}

export function useCoachTurn(): {
  live: LiveTurn | null;
  busy: boolean;
  chips: MemoryChip[];
  send: (conversationId: Id, userText: string) => Promise<void>;
  saveProposedMemory: (chip: MemoryChip & { kind: 'proposed' }) => Promise<void>;
  undoRememberedMemory: (chip: MemoryChip & { kind: 'remembered' }) => Promise<void>;
  dismissChip: (chipId: string) => void;
} {
  const { client, deps } = useCoach();
  const repos = useRepos();
  const invalidate = useInvalidate();
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [busy, setBusy] = useState(false);
  const [chips, setChips] = useState<MemoryChip[]>([]);

  const send = useCallback(
    async (conversationId: Id, userText: string) => {
      if (client == null) return;
      setBusy(true);
      setLive(emptyTurn());
      const finishedToolResults: { name: string; ok: boolean; content: string }[] = [];
      try {
        const result = await runCoachTurn({
          conversationId,
          userText,
          deps,
          client,
          onEvent: (event) => {
            if (event.type === 'text_delta') {
              setLive((prev) => (prev ? { ...prev, text: prev.text + event.text } : prev));
            } else if (event.type === 'thinking_delta') {
              setLive((prev) => (prev ? { ...prev, thinking: prev.thinking + event.text } : prev));
            } else if (event.type === 'tool_start') {
              setLive((prev) =>
                prev
                  ? {
                      ...prev,
                      toolCalls: [
                        ...prev.toolCalls,
                        { toolUseId: event.toolUseId, name: event.name, input: event.input, status: 'running' },
                      ],
                    }
                  : prev,
              );
            } else if (event.type === 'tool_result') {
              finishedToolResults.push({ name: event.name, ok: event.ok, content: event.content });
              setLive((prev) =>
                prev
                  ? {
                      ...prev,
                      toolCalls: prev.toolCalls.map((call) =>
                        call.toolUseId === event.toolUseId
                          ? { ...call, status: event.ok ? 'ok' : 'error', content: event.content }
                          : call,
                      ),
                    }
                  : prev,
              );
            } else if (event.type === 'refusal') {
              setLive((prev) => (prev ? { ...prev, refusal: event.refusal } : prev));
            }
          },
        });

        const mutations = mutationsForToolCalls(result.toolCalls);
        await Promise.all(mutations.map((mutation) => invalidate(mutation)));

        const remembered: MemoryChip[] = [];
        for (const call of finishedToolResults) {
          if (call.name !== 'remember' || !call.ok) continue;
          const parsed = parseToolResult(call.content);
          const memoryId = parsed?.memoryId;
          const text = parsed?.text;
          if (typeof memoryId === 'string' && typeof text === 'string') {
            remembered.push({ id: memoryId, kind: 'remembered', text });
          }
        }

        let proposed: MemoryChip[] = [];
        try {
          const existing = await repos.memories.listActive({ limit: 200 });
          const extraction = await extractMemories({
            client,
            userText,
            existing: existing.map((memory) => memory.text),
            model: client.settings.fastModel,
          });
          proposed = extraction.memories
            .filter((proposal) => !remembered.some((row) => row.text === proposal.text))
            .map((proposal) => ({
              id: `proposal-${crypto.randomUUID()}`,
              kind: 'proposed' as const,
              text: proposal.text,
              memoryKind: proposal.kind,
              domain: proposal.domain,
              confidence: proposal.confidence,
            }));
        } catch {
          // Memory extraction is a nice-to-have on top of the turn itself — a
          // failure here must never take down the chat.
        }

        if (remembered.length > 0 || proposed.length > 0) {
          setChips((prev) => [...remembered, ...proposed, ...prev].slice(0, 20));
        }
        setLive(null);
        setBusy(false);
      } catch (error) {
        setLive((prev) => ({ ...(prev ?? emptyTurn()), error: toAiError(error) }));
        setBusy(false);
      }
    },
    [client, deps, invalidate, repos],
  );

  const saveProposedMemory = useCallback(
    async (chip: MemoryChip & { kind: 'proposed' }) => {
      await repos.memories.create({
        kind: chip.memoryKind,
        domain: chip.domain,
        text: chip.text,
        source: 'derived',
        confidence: chip.confidence,
      });
      await invalidate('remember');
      setChips((prev) => prev.filter((row) => row.id !== chip.id));
    },
    [repos, invalidate],
  );

  const undoRememberedMemory = useCallback(
    async (chip: MemoryChip & { kind: 'remembered' }) => {
      await repos.memories.forget(chip.id, 'Undone from the chat chip.');
      await invalidate('forget');
      setChips((prev) => prev.filter((row) => row.id !== chip.id));
    },
    [repos, invalidate],
  );

  const dismissChip = useCallback((chipId: string) => {
    setChips((prev) => prev.filter((row) => row.id !== chipId));
  }, []);

  return { live, busy, chips, send, saveProposedMemory, undoRememberedMemory, dismissChip };
}
