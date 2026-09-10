/**
 * The offline AI job queue, as the app mounts it — DESIGN.md §8.
 *
 * `packages/ai` already proves the runner itself. What is tested here is the
 * shell wiring: a foreground pass drains the queue with the app's own client,
 * and the Eat day view stops saying "estimating…" without anyone reloading,
 * because the pass invalidates the shared `runAiJobs` keys.
 */

import { screen, waitFor } from '@testing-library/react';
import { createCoachDeps, type AiClient, type CoachDeps } from '@vigor/ai';
import { createFakeAiClient, jsonTurn } from '@vigor/ai/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/provider', async () => {
  const { useDbFromRef } = await import('../test/dbRef');
  return { useDb: useDbFromRef };
});

// The runner reads the client and the connectivity answer out of the coach
// context; this test supplies both directly instead of a real SecureStore.
const coach = {
  client: null as AiClient | null,
  deps: null as CoachDeps | null,
  online: true,
};
vi.mock('../coach/CoachProvider', () => ({
  useCoach: () => coach,
}));

import { AiJobRunnerProvider } from '../ai/jobRunner';
import { DayLog } from '../eat/DayLog';
import { createHarness, renderWithProviders } from '../test/harness';

const DATE = '2026-09-10';

const ESTIMATE_REPLY = jsonTurn({
  items: [
    {
      name: 'Roti',
      quantity: 2,
      unit: 'piece',
      kcal: 240,
      proteinG: 8,
      carbsG: 46,
      fatG: 3,
      fiberG: 4,
      confidence: 0.8,
    },
  ],
  note: null,
});

let harness: Awaited<ReturnType<typeof createHarness>>;

beforeEach(async () => {
  harness = await createHarness();
  await harness.db.repos.profile.save({ displayName: 'Test profile', foodRegion: 'IN' });
  coach.deps = createCoachDeps({
    repos: harness.db.repos,
    clock: { now: () => new Date().toISOString(), today: () => DATE },
  });
  coach.client = null;
  coach.online = true;
});

afterEach(async () => {
  await harness.close();
});

/** A meal logged while the coach was unreachable: pending, with a queued job. */
async function pendingMeal(): Promise<string> {
  const log = await harness.db.repos.nutrition.createLog({
    date: DATE,
    mealSlot: 'lunch',
    rawText: 'two rotis',
    source: 'ai',
    estimationStatus: 'pending',
    items: [],
  });
  await harness.db.repos.aiJobs.enqueue({
    id: `estimate_food:${log.id}`,
    kind: 'estimate_food',
    payload: { foodLogId: log.id, text: 'two rotis', region: 'IN' },
    resultRef: log.id,
  });
  return log.id;
}

describe('the app’s AI job runner', () => {
  it('drains a queued estimate on foreground and the day view stops saying “estimating…”', async () => {
    const logId = await pendingMeal();
    coach.client = createFakeAiClient({ responses: [ESTIMATE_REPLY] }).client;

    renderWithProviders(
      <AiJobRunnerProvider>
        <DayLog date={DATE} today={DATE} onDateChange={() => undefined} />
      </AiJobRunnerProvider>,
    );

    // Mounting the provider is the foreground pass (DESIGN.md §8).
    await waitFor(async () => {
      const log = await harness.db.repos.nutrition.getLog(logId);
      expect(log?.estimationStatus).toBe('final');
    });
    const log = await harness.db.repos.nutrition.getLog(logId);
    expect(log?.items.map((item) => item.name)).toEqual(['Roti']);
    expect((await harness.db.repos.aiJobs.get(`estimate_food:${logId}`))?.status).toBe('done');

    // The screen followed, on the invalidation alone — nothing was remounted.
    await waitFor(() => {
      expect(screen.queryByText(/estimating…/i)).toBeNull();
    });
    expect(await screen.findByText('Roti')).toBeTruthy();
  });

  it('leaves the queue alone when there is no API key', async () => {
    const logId = await pendingMeal();
    coach.client = null;

    renderWithProviders(
      <AiJobRunnerProvider>
        <DayLog date={DATE} today={DATE} onDateChange={() => undefined} />
      </AiJobRunnerProvider>,
    );

    expect(await screen.findByText(/estimating…/i)).toBeTruthy();
    expect((await harness.db.repos.aiJobs.get(`estimate_food:${logId}`))?.status).toBe('queued');
    expect((await harness.db.repos.nutrition.getLog(logId))?.estimationStatus).toBe('pending');
  });
});
