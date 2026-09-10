/**
 * You → Memories' hooks — DESIGN.md §4.2, §8.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { queryKeys, type Id, type Memory, type MemoryDomain, type MemoryKind } from '@vigor/core';

import { useInvalidate } from '../data/queries';
import { useRepos } from '../db/AppDataProvider';

/** Every row, active and forgotten — the You → Memories screen shows both. */
export function useMemoriesQuery(): UseQueryResult<Memory[]> {
  const { memories } = useRepos();
  return useQuery({
    queryKey: queryKeys.memories(),
    queryFn: () => memories.list({ includeInactive: true }),
  });
}

/**
 * Writing a memory by hand — DESIGN.md §8, `idea.md` §2.
 *
 * The coach used to be the only author, which meant "no dairy" or "my knee
 * hates lunges" could not be recorded without an API key and a network. This
 * goes straight through the repository with `source: 'user'`, the same row the
 * offline planner and the substitution engine filter on.
 */
export function useCreateMemory() {
  const { memories } = useRepos();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { kind: MemoryKind; domain: MemoryDomain; text: string }) =>
      memories.create({ ...input, source: 'user', confidence: 1 }),
    onSuccess: () => invalidate('remember'),
  });
}

export function useUpdateMemoryText() {
  const { memories } = useRepos();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: Id; text: string }) =>
      memories.update(input.id, { text: input.text }),
    onSuccess: () => invalidate('remember'),
  });
}

/** Soft-delete with an optional reason — DESIGN.md §4.2 keeps the audit trail. */
export function useForgetMemory() {
  const { memories } = useRepos();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: Id; reason?: string }) => memories.forget(input.id, input.reason),
    onSuccess: () => invalidate('forget'),
  });
}

export function useRestoreMemory() {
  const { memories } = useRepos();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: Id) => memories.restore(id),
    onSuccess: () => invalidate('remember'),
  });
}

/** Hard delete — DESIGN.md §8: "every memory row must be deletable". */
export function useRemoveMemory() {
  const { memories } = useRepos();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: Id) => memories.remove(id),
    onSuccess: () => invalidate('forget'),
  });
}
