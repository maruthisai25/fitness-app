/**
 * What the coach is allowed to touch — DESIGN.md §6.3.
 *
 * Tools never import a repository or an engine directly. They receive a
 * `CoachDeps` and call through it, which is what makes every tool testable
 * against an in-memory database and what keeps DESIGN.md §2.1 true: the engines
 * decide the numbers, the model decides selection.
 */

import {
  assessReadiness,
  computeInitialNutritionTargets,
  decideProgression,
  planWorkout,
  resolveLoadIncrementKg,
  substitute,
  type IsoTimestamp,
  type LocalDate,
} from '@vigor/core';
import type { Repositories } from '@vigor/db';
import type { PlatformAdapters } from '@vigor/platform';

/** Time, injected so every tool result is reproducible in a test. */
export interface CoachClock {
  /** ISO 8601 UTC instant. */
  now(): IsoTimestamp;
  /** The user's local calendar day, `YYYY-MM-DD`. */
  today(): LocalDate;
}

/**
 * The platform adapters the coach may use. Everything is optional: the coach
 * works with none of them, and the job runner simply treats a missing `network`
 * adapter as "assume online".
 */
export type CoachPlatform = Partial<Omit<PlatformAdapters, 'clock'>>;

/**
 * The pure engines from `@vigor/core`, injected so a test can assert that a
 * tool called the engine rather than doing arithmetic of its own.
 */
export interface CoachEngines {
  /** DESIGN.md §5.1 — owns every load and rep target the coach proposes. */
  decideProgression: typeof decideProgression;
  /** DESIGN.md §5.5 — ranks replacements for one exercise. */
  substitute: typeof substitute;
  /** DESIGN.md §5.2 — today's readiness score and modifier. */
  assessReadiness: typeof assessReadiness;
  /** DESIGN.md §5.4 — the offline planner the coach refines. */
  planWorkout: typeof planWorkout;
  /** DESIGN.md §5.1 — the smallest jump the user's equipment allows. */
  resolveLoadIncrementKg: typeof resolveLoadIncrementKg;
  /** DESIGN.md §5.6 — starting targets when the user has none. */
  computeInitialNutritionTargets: typeof computeInitialNutritionTargets;
}

export const DEFAULT_COACH_ENGINES: CoachEngines = {
  decideProgression,
  substitute,
  assessReadiness,
  planWorkout,
  resolveLoadIncrementKg,
  computeInitialNutritionTargets,
};

/** Everything a tool, the coach loop and the job runner need. */
export interface CoachDeps {
  repos: Repositories;
  engines: CoachEngines;
  clock: CoachClock;
  platform: CoachPlatform;
}

export interface CreateCoachDepsInput {
  repos: Repositories;
  clock: CoachClock;
  platform?: CoachPlatform;
  /** Override one engine — used by tests and by nothing in the shipped apps. */
  engines?: Partial<CoachEngines>;
}

/** Fills in the real engines and an empty platform set. */
export function createCoachDeps(input: CreateCoachDepsInput): CoachDeps {
  return {
    repos: input.repos,
    clock: input.clock,
    platform: input.platform ?? {},
    engines: { ...DEFAULT_COACH_ENGINES, ...input.engines },
  };
}

/** A clock over the host's real time, for the apps. */
export function systemCoachClock(): CoachClock {
  return {
    now: () => new Date().toISOString(),
    today: () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = `${now.getMonth() + 1}`.padStart(2, '0');
      const day = `${now.getDate()}`.padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
  };
}
