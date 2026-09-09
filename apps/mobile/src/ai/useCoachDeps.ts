/**
 * Builds the `CoachDeps` every tool and `runCoachTurn` need — DESIGN.md §6.3.
 *
 * `createCoachDeps` fills in the real engines; this hook only supplies the
 * repositories, the wall clock and the platform adapters the coach may touch
 * (`network`, so a job-queue-style check could read it later).
 */
import { useMemo } from 'react';
import { createCoachDeps, type CoachDeps } from '@vigor/ai';

import { useRepos, usePlatform } from '../db/AppDataProvider';

export function useCoachDeps(): CoachDeps {
  const repos = useRepos();
  const platform = usePlatform();
  return useMemo(
    () => createCoachDeps({ repos, clock: platform.clock, platform }),
    [repos, platform],
  );
}
