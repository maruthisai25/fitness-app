/**
 * TanStack Query glue — DESIGN.md §7.2.
 *
 * Query keys and invalidation rules live in `@vigor/core/queries` so both
 * shells stay in step; this file is only the wiring that turns a mutation name
 * into the right `invalidateQueries` calls.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { invalidationsFor, type MutationName } from '@vigor/core';

/** Invalidates everything the named mutations are declared to affect. */
export function useInvalidator(): (...mutations: readonly MutationName[]) => void {
  const client = useQueryClient();
  return useCallback(
    (...mutations: readonly MutationName[]) => {
      for (const mutation of mutations) {
        for (const queryKey of invalidationsFor(mutation)) {
          void client.invalidateQueries({ queryKey });
        }
      }
    },
    [client],
  );
}
