/**
 * Component-test harness — DESIGN.md §10: "component tests for session mode
 * and food log", run against the in-memory `better-sqlite3` driver from
 * `@vigor/db/testing` so the screens exercise the real repositories,
 * migrations and engines.
 *
 * Nothing about the components under test is stubbed. Two things are
 * replaced: the SQLite worker (a real in-memory database stands in for
 * `src/db/workerDriver.ts`) and the AI gateway (a fake whose behaviour each
 * test states outright, or nothing at all for tests that only need the
 * no-key/offline path).
 *
 * One harness, two render helpers:
 * - `renderAt` mounts at an explicit route/path pair, for screens that read
 *   route params (session mode's `:workoutId`) or need a specific coach
 *   context wired in by the caller.
 * - `renderWithProviders` mounts at a plain route with the standard provider
 *   stack (query client, db, AI gateway), for screens that only need the
 *   database.
 *
 * Excluded from the app's tsconfig (see `tsconfig.json`) because it pulls in
 * Node-only test dependencies that must never reach the bundle.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Exercise, Settings, UnitSystem, WorkoutPlan } from '@vigor/core';
import { DEFAULT_SETTINGS, type Repositories } from '@vigor/db';
import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { AiGatewayProvider } from '../ai/context';
import { unavailableGateway, type AiGateway } from '../ai/gateway';
import { DbContextProvider } from '../db/provider';

export const TEST_DATE = '2026-09-10';

export interface Harness {
  db: TestDatabase;
  repos: Repositories;
  settings: Settings;
  close(): Promise<void>;
}

/**
 * A migrated database with a profile and a barbell ready to go.
 * `unitSystem` defaults to metric; pass `imperial` to drive the §5.10
 * display/round-trip rules. `settings` overrides the app settings row
 * (`apiKeyRef`, `coachModel`, etc. — distinct from the profile row above).
 */
export async function createHarness(
  options: { unitSystem?: UnitSystem; settings?: Partial<Settings> } = {},
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

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    onboardingComplete: true,
    ...options.settings,
  };

  return { db, repos, settings, close: () => db.close() };
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

function dbContextValue(harness: Harness) {
  return {
    repos: harness.repos,
    settings: harness.settings,
    refreshSettings: async () => {},
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
      <DbContextProvider value={dbContextValue(harness)}>
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

/**
 * Renders `ui` at a plain route with the database and AI gateway wired in.
 * Defaults to {@link unavailableGateway}, so a screen renders in its
 * offline/no-key state unless a test supplies a fake gateway.
 */
export function renderWithProviders(
  harness: Harness,
  ui: ReactNode,
  options: { gateway?: AiGateway; route?: string } = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DbContextProvider value={dbContextValue(harness)}>
        <AiGatewayProvider gateway={options.gateway ?? unavailableGateway}>
          <MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>
        </AiGatewayProvider>
      </DbContextProvider>
    </QueryClientProvider>,
  );
}
