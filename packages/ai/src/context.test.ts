import {
  makeFoodLog,
  makeGoal,
  makeProfile,
  makeReadiness,
  makeTargets,
  makeWorkout,
  resetFixtureIds,
} from '@vigor/core/fixtures';
import type {
  DayNutrition,
  Insight,
  Memory,
  ProgressionDecision,
  SafetyEvent,
} from '@vigor/core';
import { loadSeed } from '@vigor/library';
import { describe, expect, it } from 'vitest';

import { createClient } from './client';
import {
  buildCoachContext,
  buildLibraryDigest,
  COACH_CONTEXT_TOKEN_LIMIT,
  coachUserContent,
  CONTEXT_MEMORY_LIMIT,
  countCoachContextTokens,
  estimateCoachContextTokens,
  seedLibraryDigest,
  type CoachContextInput,
} from './context';
import { createFakeAiClient } from './testing';

const SEED = loadSeed();
const DIGEST = buildLibraryDigest(SEED.exercises);

function makeMemory(index: number, partial: Partial<Memory> = {}): Memory {
  return {
    id: `mem-${String(index).padStart(3, '0')}`,
    kind: 'preference',
    domain: 'training',
    text: `Memory number ${index}: trains best in the early evening.`,
    source: 'coach',
    confidence: 0.8,
    evidence: [],
    active: true,
    createdAt: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T09:00:00.000Z`,
    updatedAt: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T09:00:00.000Z`,
    expiresAt: null,
    ...partial,
  };
}

function makeNutrition(consumedKcal: number): DayNutrition {
  const targets = makeTargets();
  return {
    date: '2026-09-10',
    targets,
    consumed: { kcal: consumedKcal, proteinG: 96, carbsG: 180, fatG: 40, fiberG: 18 },
    remaining: {
      kcal: targets.kcal - consumedKcal,
      proteinG: targets.proteinG - 96,
      carbsG: targets.carbsG - 180,
      fatG: targets.fatG - 40,
      fiberG: targets.fiberG - 18,
    },
    logs: [makeFoodLog()],
    mealsLogged: 2,
  };
}

/** A full context input: profile, goals, 30 memories, a week of training, today. */
function makeInput(overrides: Partial<CoachContextInput> = {}): CoachContextInput {
  resetFixtureIds();
  const exerciseNames: Record<string, string> = {};
  for (const exercise of SEED.exercises.slice(0, 40)) exerciseNames[exercise.id] = exercise.name;
  const [first, second, third] = SEED.exercises;

  const decisions: ProgressionDecision[] = [
    {
      exerciseId: second.id,
      action: 'increase_load',
      targetLoadKg: 62.5,
      targetRepMin: 6,
      targetRepMax: 10,
      targetSets: 3,
      restSec: 120,
      suggestedExerciseId: null,
      loadDeltaKg: 2.5,
      rationale: {
        codes: ['PROGRESS_LOAD'],
        facts: { previousLoadKg: 60 },
        summary: 'Every set hit the top of the range, so the load goes up one increment.',
      },
    },
    {
      exerciseId: first.id,
      action: 'hold_load',
      targetLoadKg: 40,
      targetRepMin: 6,
      targetRepMax: 10,
      targetSets: 3,
      restSec: 120,
      suggestedExerciseId: null,
      loadDeltaKg: 0,
      rationale: { codes: ['HOLD_BUILD_REPS'], facts: {}, summary: 'Build reps before adding load.' },
    },
  ];

  const insights: Insight[] = [
    {
      id: 'insight-2',
      detector: 'PUSH_PULL_BALANCE',
      period: { from: '2026-08-13', to: '2026-09-10' },
      headline: 'Pulling volume is behind pushing',
      detail: 'Over four weeks you did 46 pushing sets and 28 pulling sets.',
      evidence: [],
      severity: 'notice',
      dismissed: false,
      dismissedAt: null,
      createdAt: '2026-09-09T07:00:00.000Z',
    },
    {
      id: 'insight-1',
      detector: 'PROTEIN_GAP_BY_DAY',
      period: { from: '2026-08-13', to: '2026-09-10' },
      headline: 'Protein dips on weekends',
      detail: 'Saturday and Sunday average 78 % of your protein target.',
      evidence: [],
      severity: 'warning',
      dismissed: false,
      dismissedAt: null,
      createdAt: '2026-09-08T07:00:00.000Z',
    },
  ];

  return {
    today: '2026-09-10',
    unitSystem: 'metric',
    profile: makeProfile({ displayName: 'Ravi', foodRegion: 'IN' }),
    goals: [makeGoal({ id: 'goal-b', type: 'consistency', priority: 2 }), makeGoal({ id: 'goal-a' })],
    memories: Array.from({ length: 34 }, (_, index) => makeMemory(index)),
    recentWorkouts: [
      makeWorkout({
        date: '2026-09-09',
        status: 'completed',
        exercises: [{ exerciseId: second.id, reps: [10, 10, 10], loadKg: 60, rpe: 8 }],
      }),
      makeWorkout({
        date: '2026-09-07',
        status: 'completed',
        exercises: [{ exerciseId: third.id, reps: [8, 8, 7], loadKg: 45, rpe: 8.5 }],
      }),
    ],
    exerciseNames,
    readiness: makeReadiness({ score: 72 }),
    readinessModifier: 'normal',
    nutrition: makeNutrition(1420),
    openSafetyEvents: [],
    plannerDraft: null,
    progressionDecisions: decisions,
    openInsights: insights,
    libraryDigest: DIGEST,
    ...overrides,
  };
}

describe('buildLibraryDigest', () => {
  it('lists every non-archived exercise with its id, grouped by pattern', () => {
    expect(DIGEST).toContain('ex_barbell_back_squat');
    expect(DIGEST).toContain('## squat');
    const listed = DIGEST.split('\n').filter((line) => line.startsWith('ex_'));
    expect(listed.length).toBe(SEED.exercises.filter((exercise) => !exercise.archived).length);
  });

  it('is byte-identical across builds from the same seed', () => {
    expect(buildLibraryDigest(SEED.exercises)).toBe(buildLibraryDigest(SEED.exercises));
    expect(seedLibraryDigest()).toBe(DIGEST);
    expect(seedLibraryDigest()).toBe(seedLibraryDigest());
  });

  it('does not depend on the order the exercises arrive in', () => {
    const shuffled = [...SEED.exercises].reverse();
    expect(buildLibraryDigest(shuffled)).toBe(DIGEST);
  });
});

describe('cache prefix stability — DESIGN.md §6.2', () => {
  it('produces a byte-identical prefix from the same fixtures', () => {
    const a = buildCoachContext(makeInput());
    const b = buildCoachContext(makeInput());
    expect(a.prefix).toBe(b.prefix);
    expect(JSON.stringify(a.system)).toBe(JSON.stringify(b.system));
    expect(a.contextBlock).toBe(b.contextBlock);
  });

  it('leaves the cached prefix untouched when only today changes', () => {
    const base = buildCoachContext(makeInput());
    const later = buildCoachContext(
      makeInput({
        today: '2026-09-11',
        readiness: makeReadiness({ date: '2026-09-11', score: 41 }),
        readinessModifier: 'reduce',
        nutrition: makeNutrition(2100),
        openSafetyEvents: [
          {
            id: 'safety-1',
            date: '2026-09-11',
            kind: 'pain',
            text: 'Left knee twinges on the way down',
            source: 'chat',
            resolvedAt: null,
            note: null,
          } satisfies SafetyEvent,
        ],
      }),
    );
    expect(later.prefix).toBe(base.prefix);
    expect(later.contextBlock).not.toBe(base.contextBlock);
  });

  it('puts a cache breakpoint on both stable system blocks and nothing else', () => {
    const context = buildCoachContext(makeInput());
    expect(context.system).toHaveLength(2);
    for (const block of context.system) {
      expect(block.cache_control).toEqual({ type: 'ephemeral' });
    }
  });

  it('changes the prefix when the unit system or the library changes', () => {
    const metric = buildCoachContext(makeInput());
    const imperial = buildCoachContext(makeInput({ unitSystem: 'imperial' }));
    expect(imperial.prefix).not.toBe(metric.prefix);

    const trimmed = buildCoachContext(
      makeInput({ libraryDigest: buildLibraryDigest(SEED.exercises.slice(0, 10)) }),
    );
    expect(trimmed.prefix).not.toBe(metric.prefix);
  });

  it('orders memories, goals, workouts and insights deterministically', () => {
    const context = buildCoachContext(makeInput());
    const block = context.contextBlock;
    expect(block.indexOf('1. hypertrophy')).toBeLessThan(block.indexOf('2. consistency'));
    // Newest memory first, capped at the DESIGN.md §6.2 limit.
    const memoryLines = block.split('\n').filter((line) => line.includes('[preference/training]'));
    expect(memoryLines).toHaveLength(CONTEXT_MEMORY_LIMIT);
    // Warnings before notices.
    expect(block.indexOf('PROTEIN_GAP_BY_DAY')).toBeLessThan(block.indexOf('PUSH_PULL_BALANCE'));
  });

  it('states the safety rules in the cached block and the safety state in the volatile one', () => {
    const clear = buildCoachContext(makeInput());
    expect(clear.prefix).toContain('report_safety');
    expect(clear.contextBlock).toContain('safety state: clear');

    const active = buildCoachContext(
      makeInput({
        openSafetyEvents: [
          {
            id: 'safety-9',
            date: '2026-09-10',
            kind: 'pain',
            text: 'Sharp pain in the right shoulder on overhead press',
            source: 'chat',
            resolvedAt: null,
            note: null,
          } satisfies SafetyEvent,
        ],
      }),
    );
    expect(active.contextBlock).toContain('safety state: ACTIVE');
    expect(active.prefix).toBe(clear.prefix);
  });
});

describe('token budget — DESIGN.md §11', () => {
  it('stays under the 8k ceiling on a full fixture (offline estimate)', () => {
    const context = buildCoachContext(makeInput());
    const estimate = estimateCoachContextTokens(context, 'What should I train today?');
    expect(estimate).toBeLessThan(COACH_CONTEXT_TOKEN_LIMIT);
  });

  it('counts through the SDK endpoint with the same system and user turn', async () => {
    const fake = createFakeAiClient({ inputTokens: 5321 });
    const context = buildCoachContext(makeInput());
    const count = await countCoachContextTokens(fake.client, context, {
      userText: 'What should I train today?',
    });
    expect(count).toBe(5321);
    expect(fake.countRequests).toHaveLength(1);
    expect(fake.countRequests[0].model).toBe('claude-opus-5');
    expect(fake.countRequests[0].system).toBe(context.system);
  });

  it('puts the volatile context before the user message in the user turn', () => {
    const context = buildCoachContext(makeInput());
    const content = coachUserContent(context, 'Give me a 40 minute session.');
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: 'text', text: context.contextBlock });
    expect(content[1]).toEqual({ type: 'text', text: 'Give me a 40 minute session.' });
  });
});

/**
 * DESIGN.md §10: live API tests are opt-in. This is the §11 check with the real
 * `count_tokens` endpoint; it needs `ANTHROPIC_API_KEY` and `VIGOR_LIVE_AI=1`.
 */
describe.runIf(process.env.VIGOR_LIVE_AI === '1')('live token count', () => {
  it('keeps the assembled coach context under 8k tokens', async () => {
    const client = createClient({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
    const context = buildCoachContext(makeInput());
    const count = await countCoachContextTokens(client, context, {
      userText: 'What should I train today? I have 45 minutes.',
    });
    expect(count).toBeLessThan(COACH_CONTEXT_TOKEN_LIMIT);
  }, 60_000);
});
