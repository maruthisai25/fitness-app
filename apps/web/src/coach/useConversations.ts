/**
 * TanStack Query wrappers over `repos.conversations` — DESIGN.md §7.2, §4.1.
 * The chat panel's own hooks; not general enough for `apps/web/src/data/hooks.ts`.
 */

import { queryKeys, type Conversation, type Id, type Message } from '@vigor/core';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useRepos } from '../data/hooks';

export function useConversationList(): UseQueryResult<Conversation[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.conversations(),
    queryFn: () => repos.conversations.list({ limit: 50 }),
  });
}

export function useConversationMessages(conversationId: Id | null): UseQueryResult<Message[]> {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.messages(conversationId ?? 'none'),
    queryFn: () =>
      conversationId ? repos.conversations.listMessages(conversationId) : Promise.resolve([]),
    enabled: conversationId != null,
  });
}
