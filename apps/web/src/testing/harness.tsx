/**
 * Component-test harness — DESIGN.md §10: "component tests for session mode",
 * run against the in-memory `better-sqlite3` driver from `@vigor/db/testing`
 * so the screens exercise the real repositories, migrations and engines.
 *
 * Excluded from the app's tsconfig (see `tsconfig.json`) because it pulls in
 * Node-only test dependencies that must never reach the bundle.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { Exercise, Settings, UnitSystem, WorkoutPlan } from '@vigor/core';
import { DEFAULT_SETTINGS, type Repositories } from '@vigor/db';
import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { DbContextProvider } from '../db/provider';

export const TEST_DATE = '2026-09-10';

export interface Harness {
  db: TestDatabase;
  repos: Repositories;
  settings: Settings;
}

/**
 * A migrated database with a profile, a barbell and two squat patterns.
 * `unitSystem` defaults to metric; pass `imperial` to drive the §5.10
 * display/round-trip rules.
 */
export async function createHarness(
  options: { unitSystem?: UnitSystem } = {},
): Promise<Harness> {
  const db = await createTestDatabase();
  const repos = db.repos;

  await repos.profile.save({
    displayName: 'You',
    unitSystem: options.unitSystem ?? 'metric',
    trainingLocation: 'gym',
    preferredDurationMin: 45,
    fitnessLevel: 'intermediate',
  });
  await repos.equipment.create({
    name: 'Barbell',
    category: 'barbell',
    available: true,
    loadIncrementKg: 2.5,
  });

  return { db, repos, settings: { ...DEFAULT_SETTINGS, onboardingComplete: true } };
}

/** Adds one library exercise; defaults describe a barbell back squat. */
export async function addExercise(
  repos: Repositories,
  overrides: Partial<Exercise> & Pick<Exercise, 'name' | 'slug'>,
): Promise<Exercise> {
  return repos.exercises.create({
    movementPattern: 'squat',
    primaryMuscles: ['quads'],
    secondaryMuscles: ['glutes'],
    equipment: ['barbell'],
    difficulty: 3,
    instructions: 'Brace, sit down between your hips, drive the floor away.',
    cues: ['Chest tall', 'Knees track over toes'],
    isCustom: false,
    loadType: 'external',
    defaultRepRange: { min: 8, max: 12 },
    archived: false,
    ...overrides,
  });
}

/** A one-exercise planned session with `sets` rows ready for session mode. */
export function planFor(
  exerciseId: string,
  options: {
    sets?: number;
    loadKg?: number | null;
    restSec?: number;
    repMin?: number;
    repMax?: number;
  } = {},
): WorkoutPlan {
  return {
    date: TEST_DATE,
    title: 'Lower body — squat focus',
    focus: ['quads'],
    plannedDurationMin: 45,
    source: 'rule',
    exercises: [
      {
        exerciseId,
        order: 0,
        targetSets: options.sets ?? 1,
        targetRepMin: options.repMin ?? 8,
        targetRepMax: options.repMax ?? 12,
        targetLoadKg: options.loadKg === undefined ? 60 : options.loadKg,
        restSec: options.restSec ?? 120,
        tempo: null,
        substitutedFromExerciseId: null,
        progressionDecision: null,
        notes: null,
      },
    ],
    readinessId: null,
    notes: null,
    rationale: {
      codes: ['RULE_BASED_PLAN'],
      facts: { test: true },
      summary: 'Squat led today because it has gone the longest without a session.',
    },
  };
}

/** Renders `element` at `route` with the harness database wired in. */
export function renderAt(
  harness: Harness,
  route: string,
  path: string,
  element: ReactNode,
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DbContextProvider
        value={{
          repos: harness.repos,
          settings: harness.settings,
          refreshSettings: async () => {},
        }}
      >
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={element} />
            <Route path="*" element={<div>elsewhere</div>} />
          </Routes>
        </MemoryRouter>
      </DbContextProvider>
    </QueryClientProvider>,
  );
}
