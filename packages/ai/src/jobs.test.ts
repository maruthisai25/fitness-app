import { AuthenticationError } from '@anthropic-ai/sdk';
import type { NetworkStatus } from '@vigor/platform';
import { afterEach, describe, expect, it } from 'vitest';

import { createAiClient, type AiClient, type AiMessagesApi } from './client';
import { CREDENTIAL_PREFIX, createAiJobRunner, PERMANENT_PREFIX, backoffMs } from './jobs';
import { createAiTestEnv, TEST_TODAY, type AiTestEnv } from './testFixtures';
import { createFakeAiClient, jsonTurn, refusalTurn, type FakeTurn } from './testing';

let env: AiTestEnv | null = null;

async function setup(): Promise<AiTestEnv> {
  env = await createAiTestEnv();
  return env;
}

afterEach(async () => {
  await env?.close();
  env = null;
});

function offlineNetwork(): NetworkStatus {
  return {
    isOnline: async () => false,
    subscribe: () => () => undefined,
  };
}

const FOOD_REPLY: FakeTurn = jsonTurn({
  items: [
    { name: 'Roti', quantity: 2, unit: 'roti', kcal: 240, proteinG: 8, carbsG: 46, fatG: 3, fiberG: 4, confidence: 0.8 },
  ],
  note: null,
});

async function queueFoodLog(scope: AiTestEnv): Promise<string> {
  const log = await scope.db.repos.nutrition.createLog({
    date: TEST_TODAY,
    mealSlot: 'lunch',
    rawText: 'two rotis',
    source: 'ai',
    estimationStatus: 'pending',
  });
  return log.id;
}

describe('backoffMs', () => {
  it('doubles from 30 s and stops at 30 minutes', () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(20)).toBe(30 * 60_000);
  });
});

describe('enqueue', () => {
  it('is idempotent by id', async () => {
    const scope = await setup();
    const runner = createAiJobRunner({ deps: scope.deps, client: createFakeAiClient().client });
    const first = await runner.enqueue({ id: 'job-1', kind: 'estimate_food', payload: { foodLogId: 'x' } });
    const second = await runner.enqueue({ id: 'job-1', kind: 'estimate_food', payload: { foodLogId: 'y' } });
    expect(second.id).toBe(first.id);
    expect((second.payload as { foodLogId: string }).foodLogId).toBe('x');
    expect(await scope.db.repos.aiJobs.list()).toHaveLength(1);
  });
});

describe('runPending — estimate_food', () => {
  it('lands the estimate on the log that was showing "estimating…"', async () => {
    const scope = await setup();
    const logId = await queueFoodLog(scope);
    const fake = createFakeAiClient({ responses: [FOOD_REPLY] });
    const runner = createAiJobRunner({ deps: scope.deps, client: fake.client });
    await runner.enqueue({ id: 'job-food', kind: 'estimate_food', payload: { foodLogId: logId } });

    const summary = await runner.runPending();
    expect(summary.skipped).toBeNull();
    expect(summary.ran).toEqual([
      { jobId: 'job-food', kind: 'estimate_food', status: 'done', attempts: 1, resultRef: logId, error: null },
    ]);

    const log = await scope.db.repos.nutrition.getLog(logId);
    expect(log?.estimationStatus).toBe('final');
    expect(log?.items).toHaveLength(1);
    expect(log?.items[0].name).toBe('Roti');
    expect((await scope.db.repos.aiJobs.get('job-food'))?.status).toBe('done');
  });

  it('marks a refused estimate permanently failed and flags the log', async () => {
    const scope = await setup();
    const logId = await queueFoodLog(scope);
    const fake = createFakeAiClient({ responses: [refusalTurn()] });
    const runner = createAiJobRunner({ deps: scope.deps, client: fake.client });
    await runner.enqueue({ id: 'job-refused', kind: 'estimate_food', payload: { foodLogId: logId } });

    const summary = await runner.runPending();
    expect(summary.ran[0].status).toBe('permanently_failed');
    const job = await scope.db.repos.aiJobs.get('job-refused');
    expect(job?.status).toBe('failed');
    expect(job?.lastError?.startsWith(PERMANENT_PREFIX)).toBe(true);
    expect((await scope.db.repos.nutrition.getLog(logId))?.estimationStatus).toBe('failed');
  });

  it('never retries a permanently failed job', async () => {
    const scope = await setup();
    const fake = createFakeAiClient();
    const runner = createAiJobRunner({ deps: scope.deps, client: fake.client });
    await runner.enqueue({ id: 'job-gone', kind: 'estimate_food', payload: { foodLogId: 'missing' } });

    const first = await runner.runPending();
    expect(first.ran[0].status).toBe('permanently_failed');

    const second = await runner.runPending({ now: '2027-01-01T00:00:00.000Z' });
    expect(second.ran).toEqual([
      expect.objectContaining({ jobId: 'job-gone', status: 'skipped' }),
    ]);
    expect((await scope.db.repos.aiJobs.get('job-gone'))?.attempts).toBe(1);
  });
});

describe('runPending — retry and backoff', () => {
  it('leaves a retryable failure alone until its backoff has elapsed, then retries it', async () => {
    const scope = await setup();
    const logId = await queueFoodLog(scope);
    // No scripted response: the fake throws, which maps to an `unknown` AiError
    // and therefore stays retryable.
    const fake = createFakeAiClient({ responses: [] });
    const runner = createAiJobRunner({ deps: scope.deps, client: fake.client });
    await runner.enqueue({ id: 'job-retry', kind: 'estimate_food', payload: { foodLogId: logId } });

    const first = await runner.runPending();
    expect(first.ran[0].status).toBe('failed');
    expect(first.ran[0].attempts).toBe(1);

    // Too soon: the job is reported as skipped, not attempted again.
    const failedJob = await scope.db.repos.aiJobs.get('job-retry');
    const tooSoon = await runner.runPending({ now: failedJob?.updatedAt });
    expect(tooSoon.ran[0].status).toBe('skipped');
    expect((await scope.db.repos.aiJobs.get('job-retry'))?.attempts).toBe(1);

    // Past the backoff, with a working reply this time.
    fake.setResponses([FOOD_REPLY]);
    const later = await runner.runPending({ now: '2026-09-11T06:00:00.000Z' });
    expect(later.ran[0].status).toBe('done');
    expect(later.ran[0].attempts).toBe(2);
    expect((await scope.db.repos.nutrition.getLog(logId))?.estimationStatus).toBe('final');
  });

  it('stops retrying once the attempt ceiling is reached', async () => {
    const scope = await setup();
    const logId = await queueFoodLog(scope);
    const fake = createFakeAiClient({ responses: [] });
    const runner = createAiJobRunner({
      deps: scope.deps,
      client: fake.client,
      maxAttempts: 2,
      baseBackoffMs: 0,
    });
    await runner.enqueue({ id: 'job-cap', kind: 'estimate_food', payload: { foodLogId: logId } });

    await runner.runPending();
    await runner.runPending({ now: '2026-09-11T06:00:00.000Z' });
    expect((await scope.db.repos.aiJobs.get('job-cap'))?.attempts).toBe(2);

    const third = await runner.runPending({ now: '2026-09-12T06:00:00.000Z' });
    expect(third.ran[0].status).toBe('skipped');
    expect((await scope.db.repos.aiJobs.get('job-cap'))?.attempts).toBe(2);
  });
});

describe('runPending — offline', () => {
  it('does nothing at all when the network adapter says the device is offline', async () => {
    const scope = await setup();
    const logId = await queueFoodLog(scope);
    scope.deps.platform.network = offlineNetwork();
    const runner = createAiJobRunner({ deps: scope.deps, client: createFakeAiClient().client });
    await runner.enqueue({ id: 'job-offline', kind: 'estimate_food', payload: { foodLogId: logId } });

    const summary = await runner.runPending();
    expect(summary).toEqual({ ran: [], skipped: 'offline' });
    expect((await scope.db.repos.aiJobs.get('job-offline'))?.status).toBe('queued');
    expect((await scope.db.repos.nutrition.getLog(logId))?.estimationStatus).toBe('pending');
  });
});

describe('runPending — the other job kinds', () => {
  it('fills a weekly review\'s prose', async () => {
    const scope = await setup();
    const review = await scope.db.repos.reviews.upsert({
      weekStart: '2026-09-01',
      training: {
        workoutsCompleted: 3,
        workoutsPlanned: 4,
        completionRate: 0.75,
        totalSets: 40,
        totalVolumeKg: 18000,
        volumeByMuscleGroup: [],
        personalRecords: [],
        missedSessions: 1,
        averageRpe: 8,
        averageDurationMin: 45,
      },
      nutrition: {
        daysLogged: 5,
        averageKcal: 2300,
        averageProteinG: 120,
        averageCarbsG: 250,
        averageFatG: 70,
        averageFiberG: 22,
        targetHitRate: { kcal: 0.6, proteinG: 0.2, carbsG: 0.8, fatG: 0.8, fiberG: 0.2 },
        missedTargets: ['proteinG'],
      },
    });

    const fake = createFakeAiClient({
      responses: [
        jsonTurn({
          summary: 'Three sessions out of four, and protein landed at 120 g against your 150 g target on five logged days.',
          recommendation: 'Put a protein source in breakfast on training days.',
        }),
      ],
    });
    const runner = createAiJobRunner({ deps: scope.deps, client: fake.client });
    await runner.enqueue({ id: 'job-review', kind: 'weekly_review', payload: { weeklyReviewId: review.id } });

    const summary = await runner.runPending();
    expect(summary.ran[0].status).toBe('done');
    const stored = await scope.db.repos.reviews.get(review.id);
    expect(stored?.summary).toContain('Three sessions');
    expect(stored?.recommendation).toContain('breakfast');
  });

  it('rewrites open insights in place', async () => {
    const scope = await setup();
    const insight = await scope.db.repos.insights.create({
      detector: 'PUSH_PULL_BALANCE',
      period: { from: '2026-08-13', to: '2026-09-10' },
      headline: 'push:pull 1.64',
      detail: '46 push sets vs 28 pull sets',
      severity: 'notice',
    });

    const fake = createFakeAiClient({
      responses: [
        jsonTurn({
          insights: [
            {
              id: insight.id,
              headline: 'Pulling volume trails pushing',
              detail: 'Across four weeks you logged 46 pushing sets and 28 pulling sets.',
            },
          ],
        }),
      ],
    });
    const runner = createAiJobRunner({ deps: scope.deps, client: fake.client });
    await runner.enqueue({ id: 'job-insight', kind: 'insight_phrasing', payload: {} });

    const summary = await runner.runPending();
    expect(summary.ran[0].status).toBe('done');
    const stored = await scope.db.repos.insights.get(insight.id);
    expect(stored?.headline).toBe('Pulling volume trails pushing');
  });

  it('stores a generated recipe', async () => {
    const scope = await setup();
    await scope.db.repos.inventory.add({ name: 'Paneer', quantity: 200, unit: 'g', useBy: '2026-09-11' });

    const fake = createFakeAiClient({
      responses: [
        jsonTurn({
          title: 'Paneer bhurji',
          ingredients: [{ name: 'Paneer', quantity: 200, unit: 'g', note: null }],
          steps: ['Crumble the paneer.', 'Cook with onion and spices.'],
          timeMinutes: 15,
          servings: 2,
          perServing: { kcal: 320, proteinG: 22, carbsG: 8, fatG: 22, fiberG: 2 },
          tags: ['vegetarian'],
          usesFromPantry: ['Paneer'],
          why: 'The paneer needs using by Friday.',
        }),
      ],
    });
    const runner = createAiJobRunner({ deps: scope.deps, client: fake.client });
    await runner.enqueue({ id: 'job-recipe', kind: 'recipe', payload: { timeMinutes: 20, save: true } });

    const summary = await runner.runPending();
    expect(summary.ran[0].status).toBe('done');
    const recipes = await scope.db.repos.recipes.list();
    expect(recipes[0].title).toBe('Paneer bhurji');
    expect(recipes[0].saved).toBe(true);
    expect(recipes[0].source).toBe('ai');
  });

  it('rejects a payload that does not match its schema, permanently', async () => {
    const scope = await setup();
    const runner = createAiJobRunner({ deps: scope.deps, client: createFakeAiClient().client });
    await runner.enqueue({ id: 'job-bad', kind: 'weekly_review', payload: { nope: true } });
    const summary = await runner.runPending();
    expect(summary.ran[0].status).toBe('permanently_failed');
    expect(summary.ran[0].error).toContain('payload is not valid');
  });
});

describe('runPending — a rejected API key', () => {
  function rejectedKeyClient(): AiClient {
    const fail = (): never => {
      throw new AuthenticationError(401, undefined, 'invalid x-api-key', new Headers());
    };
    const messages: AiMessagesApi = {
      create: async () => fail(),
      countTokens: async () => fail(),
      toolRunner: () => fail(),
    };
    return createAiClient(messages);
  }

  it('parks the job instead of failing it forever, and stops the log claiming it is estimating', async () => {
    const scope = await setup();
    const logId = await queueFoodLog(scope);
    const runner = createAiJobRunner({ deps: scope.deps, client: rejectedKeyClient() });
    await runner.enqueue({ id: 'job-key', kind: 'estimate_food', payload: { foodLogId: logId } });

    const first = await runner.runPending();
    expect(first.ran[0].status).toBe('blocked');
    const job = await scope.db.repos.aiJobs.get('job-key');
    expect(job?.lastError?.startsWith(CREDENTIAL_PREFIX)).toBe(true);
    expect(job?.lastError?.startsWith(PERMANENT_PREFIX)).toBe(false);
    // The meal no longer says "estimating…" — it says it failed, which is what
    // the "try again" affordance hangs off (DESIGN.md §6.4).
    expect((await scope.db.repos.nutrition.getLog(logId))?.estimationStatus).toBe('failed');

    // Waiting does not help, so no attempt is burned on a timer.
    const later = await runner.runPending({ now: '2027-01-01T00:00:00.000Z' });
    expect(later.ran[0].status).toBe('skipped');
    expect((await scope.db.repos.aiJobs.get('job-key'))?.attempts).toBe(1);
  });

  it('releases parked jobs when a new key is saved', async () => {
    const scope = await setup();
    const logId = await queueFoodLog(scope);
    const runner = createAiJobRunner({ deps: scope.deps, client: rejectedKeyClient() });
    await runner.enqueue({ id: 'job-key-2', kind: 'estimate_food', payload: { foodLogId: logId } });
    await runner.runPending();

    expect(await runner.retryCredentialFailures()).toEqual(['job-key-2']);
    expect((await scope.db.repos.aiJobs.get('job-key-2'))?.status).toBe('queued');

    // With a working key the meal is estimated on the next pass.
    const working = createAiJobRunner({
      deps: scope.deps,
      client: createFakeAiClient({ responses: [FOOD_REPLY] }).client,
    });
    const summary = await working.runPending();
    expect(summary.ran[0].status).toBe('done');
    expect((await scope.db.repos.nutrition.getLog(logId))?.estimationStatus).toBe('final');
  });
});

describe('runOne', () => {
  it('runs a job on demand, ignoring backoff', async () => {
    const scope = await setup();
    const logId = await queueFoodLog(scope);
    const fake = createFakeAiClient({ responses: [] });
    const runner = createAiJobRunner({ deps: scope.deps, client: fake.client });
    await runner.enqueue({ id: 'job-now', kind: 'estimate_food', payload: { foodLogId: logId } });

    expect((await runner.runPending()).ran[0].status).toBe('failed');
    fake.setResponses([FOOD_REPLY]);
    const outcome = await runner.runOne('job-now');
    expect(outcome.status).toBe('done');
    expect(outcome.attempts).toBe(2);
  });

  it('reports an unknown job id instead of throwing', async () => {
    const scope = await setup();
    const runner = createAiJobRunner({ deps: scope.deps, client: createFakeAiClient().client });
    const outcome = await runner.runOne('nope');
    expect(outcome.status).toBe('permanently_failed');
    expect(outcome.error).toContain('nope');
  });
});
