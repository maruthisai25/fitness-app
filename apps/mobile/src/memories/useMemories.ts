/**
 * You → Memories' hooks — DESIGN.md §4.2, §8.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { queryKeys, type Id, type Memory } from '@vigor/core';

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

export function useUpdateMemoryText() {
  const { memories } = useRepos();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: Id; text: string }) => memories.update(input.id, { text: input.text }),
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
