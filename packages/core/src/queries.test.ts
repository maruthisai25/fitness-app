import { describe, expect, it } from 'vitest';

import {
  INVALIDATIONS,
  QUERY_ROOTS,
  invalidationsFor,
  matchesPrefix,
  queryKeys,
  type MutationName,
} from './queries';

describe('query keys — DESIGN.md §7.2', () => {
  it('starts every key with a known root', () => {
    const roots = new Set<string>(Object.values(QUERY_ROOTS));
    const built = [
      queryKeys.profile(),
      queryKeys.activeGoals(),
      queryKeys.availableEquipment(),
      queryKeys.settings(),
      queryKeys.exercise('ex-1'),
      queryKeys.exerciseSearch('bench'),
      queryKeys.exerciseStats('ex-1'),
      queryKeys.exerciseHistory('ex-1', 10),
      queryKeys.workout('w-1'),
      queryKeys.workoutsRecent(7),
      queryKeys.workoutsRange('2026-09-01', '2026-09-10'),
      queryKeys.workoutsByDate('2026-09-10'),
      queryKeys.sets('we-1'),
      queryKeys.personalRecords(),
      queryKeys.readiness('2026-09-10'),
      queryKeys.readinessRange('2026-09-01', '2026-09-10'),
      queryKeys.bodyMetricsRange('2026-09-01', '2026-09-10'),
      queryKeys.progressPhotos(),
      queryKeys.nutritionDay('2026-09-10'),
      queryKeys.nutritionRange('2026-09-01', '2026-09-10'),
      queryKeys.nutritionTargets(),
      queryKeys.savedMeals(),
      queryKeys.inventory(),
      queryKeys.recipe('r-1'),
      queryKeys.mealPlans(),
      queryKeys.activeMemories(),
      queryKeys.openInsights(),
      queryKeys.weeklyReview('2026-09-07'),
      queryKeys.conversations(),
      queryKeys.messages('c-1'),
      queryKeys.queuedAiJobs(),
      queryKeys.openSafetyEvents(),
      queryKeys.today('2026-09-10'),
    ];

    for (const key of built) {
      expect(roots.has(key[0] as string)).toBe(true);
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it('produces stable, comparable keys', () => {
    expect(queryKeys.nutritionDay('2026-09-10')).toEqual(queryKeys.nutritionDay('2026-09-10'));
    expect(queryKeys.nutritionDay('2026-09-10')).not.toEqual(queryKeys.nutritionDay('2026-09-11'));
  });

  it('distinguishes an exercise from its stats and history', () => {
    expect(queryKeys.exercise('ex-1')).toEqual(['exercises', 'ex-1']);
    expect(queryKeys.exerciseStats('ex-1')).toEqual(['exercises', 'ex-1', 'stats']);
    expect(queryKeys.exerciseHistory('ex-1')).toEqual(['exercises', 'ex-1', 'history', null]);
  });
});

describe('invalidation map', () => {
  it('covers every mutation with at least one root', () => {
    for (const [mutation, roots] of Object.entries(INVALIDATIONS)) {
      expect(roots.length, mutation).toBeGreaterThan(0);
    }
  });

  it('refreshes Today after anything the Today screen shows', () => {
    const touchingToday: MutationName[] = [
      'recordSet',
      'finishWorkout',
      'saveReadiness',
      'logFood',
      'reportSafety',
      'dismissInsight',
    ];
    for (const mutation of touchingToday) {
      expect(INVALIDATIONS[mutation], mutation).toContain(QUERY_ROOTS.today);
    }
  });

  it('returns key prefixes, not whole keys', () => {
    const prefixes = invalidationsFor('recordSet');
    expect(prefixes).toContainEqual(['sets']);
    expect(prefixes).toContainEqual(['personalRecords']);
    expect(prefixes.every((prefix) => prefix.length === 1)).toBe(true);
  });

  it('invalidates everything after an import', () => {
    expect(invalidationsFor('importBundle').length).toBe(Object.keys(QUERY_ROOTS).length);
  });
});

describe('matchesPrefix', () => {
  it('matches the way TanStack Query does', () => {
    expect(matchesPrefix(queryKeys.exerciseStats('ex-1'), ['exercises'])).toBe(true);
    expect(matchesPrefix(queryKeys.exerciseStats('ex-1'), ['exercises', 'ex-1'])).toBe(true);
    expect(matchesPrefix(queryKeys.exerciseStats('ex-1'), ['exercises', 'ex-2'])).toBe(false);
    expect(matchesPrefix(queryKeys.profile(), ['profile', 'extra'])).toBe(false);
  });

  it('makes a recordSet invalidation hit the exercise stats cache', () => {
    const key = queryKeys.exerciseStats('ex-1');
    expect(invalidationsFor('recordSet').some((prefix) => matchesPrefix(key, prefix))).toBe(true);
    expect(invalidationsFor('saveRecipe').some((prefix) => matchesPrefix(key, prefix))).toBe(false);
  });
});
