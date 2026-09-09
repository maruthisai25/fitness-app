/**
 * Coach chat hooks — DESIGN.md §6.2, §6.4, §7.1.
 *
 * The data work (rendering the message log, extracting memories) lives in
 * `./coachData`, React-free; this module binds it to TanStack Query and to
 * `runCoachTurn` from `@vigor/ai`, and streams progress into `./coachStream`
 * so the chat screen re-renders as the turn happens instead of only once it
 * finishes.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { runCoachTurn, toAiError, type CoachTurnResult } from '@vigor/ai';
import { queryKeys, type Conversation, type Id, type Message } from '@vigor/core';

import { useInvalidate } from '../data/queries';
import { useRepos } from '../db/AppDataProvider';
import { useAiClient } from '../ai/useAiClient';
import { useCoachDeps } from '../ai/useCoachDeps';
import { extractAndRecordMemories, getOrCreateDefaultConversation } from './coachData';
import { useCoachStream } from './coachStream';

export function useConversationsQuery(): UseQueryResult<Conversation[]> {
  const { conversations } = useRepos();
  return useQuery({ queryKey: queryKeys.conversations(), queryFn: () => conversations.list() });
}

export function useCreateConversation() {
  const { conversations } = useRepos();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => conversations.create(title ? { title } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.conversations() }),
  });
}

const DEFAULT_CONVERSATION_QUERY_KEY = [...queryKeys.conversations(), 'default'] as const;

/**
 * The conversation Today's plan card and session mode's "ask the coach" write
 * into — the user's most recent one, created on first use. Every mount shares
 * one in-flight request through the query cache, so asking twice in a row
 * cannot create two conversations.
 */
export function useDefaultConversationId(): Id | null {
  const repos = useRepos();
  const query = useQuery({
    queryKey: DEFAULT_CONVERSATION_QUERY_KEY,
    queryFn: () => getOrCreateDefaultConversation(repos),
  });
  return query.data ?? null;
}

export function useMessagesQuery(conversationId: Id | null): UseQueryResult<Message[]> {
  const { conversations } = useRepos();
  return useQuery({
    queryKey: queryKeys.messages(conversationId ?? 'none'),
    queryFn: () => conversations.listMessages(conversationId as Id),
    enabled: conversationId != null && conversationId.length > 0,
  });
}

export function useSendCoachMessage(conversationId: Id) {
  const deps = useCoachDeps();
  const { client } = useAiClient();
  const queryClient = useQueryClient();
  // Imperative access: these are action calls made from inside `mutationFn`,
  // not a reactive read, so `getState()` avoids subscribing this hook to
  // every streamed character (the chat screen already does that itself via
  // `useConversationStream`).
  const stream = useCoachStream.getState();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (userText: string): Promise<CoachTurnResult> => {
      if (client == null) {
        throw toAiError(new Error('The coach has no Anthropic client configured yet.'));
      }
      stream.begin(conversationId, userText);
      try {
        const result = await runCoachTurn({
          conversationId,
          userText,
          deps,
          client,
          onEvent: (event) => {
            switch (event.type) {
              case 'text_delta':
                stream.appendText(conversationId, event.text);
                break;
              case 'thinking_delta':
                stream.appendThinking(conversationId, event.text);
                break;
              case 'tool_start':
                stream.toolStart(conversationId, event.toolUseId, event.name, event.input);
                break;
              case 'tool_result':
                stream.toolResult(conversationId, event.toolUseId, event.ok, event.content);
                break;
              case 'refusal':
                stream.setRefusal(conversationId, event.refusal);
                break;
              default:
                break;
            }
          },
        });

        // Memory extraction — DESIGN.md §6.4. Best-effort: a failure here must
        // never sink an otherwise-successful turn.
        try {
          const chips = await extractAndRecordMemories(client, deps.repos, userText);
          if (chips.length > 0) {
            stream.setRemembered(
              conversationId,
              chips.map((chip) => ({
                id: chip.memory.id,
                text: chip.memory.text,
                confidence: chip.confidence,
              })),
            );
          }
        } catch {
          // Nothing to show; the turn itself already succeeded.
        }

        // Every coach tool writes through a repository this app also reads
        // through TanStack Query — invalidate everything a tool could have
        // touched rather than tracking exactly which one ran.
        await invalidate(
          'createWorkout',
          'updateWorkout',
          'substituteExercise',
          'reportSafety',
          'remember',
          'forget',
          'saveProfile',
          'saveNutritionTargets',
          'logFood',
          'updateInventory',
          'saveRecipe',
          'saveMeal',
        );
        await queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });

        return result;
      } catch (cause) {
        const aiError = toAiError(cause);
        stream.setError(conversationId, aiError);
        throw aiError;
      } finally {
        stream.finish(conversationId);
      }
    },
  });
}
