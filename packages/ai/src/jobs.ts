/**
 * The offline AI job queue — DESIGN.md §6.4, §8, §9 (phase 7).
 *
 * "The `ai_jobs` queue retries with backoff when the Network adapter reports
 * online; jobs are idempotent by `id`."
 *
 * Idempotency is by row id: `enqueue` with an id that already exists returns the
 * existing row instead of adding a second one, so a screen that re-queues on
 * every render never floods the queue. A job that fails for a reason retrying
 * cannot fix — a deleted food log, a refusal, a malformed payload — is marked
 * permanently failed and is never picked up again.
 */

import {
  addDays,
  makeRationale,
  type AiJob,
  type AiJobKind,
  type Insight,
  type IsoTimestamp,
  type MealPlanConstraints,
  type WeeklyReviewStats,
} from '@vigor/core';
import type { AiJobDraft } from '@vigor/db';
import { z } from 'zod';

import type { AiClient } from './client';
import type { CoachDeps } from './deps';
import { toAiError } from './errors';
import { generateRecipe, parseFood, phraseInsights, toRecipeDraft, writeWeeklyReview } from './tasks';

// ---------------------------------------------------------------------------
// Failure classes
// ---------------------------------------------------------------------------

/** Marks a `lastError` that must never be retried. */
export const PERMANENT_PREFIX = 'PERMANENT: ';

/**
 * Marks a `lastError` that only a new API key can clear. Waiting does not fix
 * a rejected key, so these jobs sit still instead of burning their attempts —
 * {@link AiJobRunner.retryCredentialFailures} puts them back in the queue when
 * the settings screen saves a new one.
 */
export const CREDENTIAL_PREFIX = 'CREDENTIALS: ';

/** A failure retrying cannot fix. The runner records it and moves on. */
export class AiJobPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiJobPermanentError';
  }
}

/** How a failure should be treated by the queue. */
export type AiJobFailureClass = 'permanent' | 'credentials' | 'transient';

/**
 * A rate limit or a dropped connection is worth another pass; a rejected key
 * waits for a new one; a deleted row, a malformed payload or a refusal is over.
 */
export function classifyJobFailure(error: unknown): AiJobFailureClass {
  if (error instanceof AiJobPermanentError) return 'permanent';
  const mapped = toAiError(error);
  if (mapped.kind === 'auth' || mapped.kind === 'permission') return 'credentials';
  if (!mapped.retryable && mapped.kind !== 'unknown') return 'permanent';
  return 'transient';
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export const estimateFoodPayloadSchema = z.object({
  foodLogId: z.string().min(1),
  /** Falls back to the log's own `rawText`. */
  text: z.string().min(1).max(500).optional(),
  region: z.string().min(2).max(16).optional(),
});

export const weeklyReviewPayloadSchema = z.object({
  weeklyReviewId: z.string().min(1),
});

export const insightPhrasingPayloadSchema = z.object({
  insightIds: z.array(z.string().min(1)).max(12).optional(),
});

export const recipePayloadSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeMinutes: z.number().int().min(1).max(600).optional(),
  servings: z.number().int().min(1).max(20).optional(),
  constraints: z.record(z.string(), z.unknown()).optional(),
  save: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export interface AiJobContext {
  job: AiJob;
  deps: CoachDeps;
  client: AiClient;
  signal?: AbortSignal;
}

/** Returns the row the job wrote, for `ai_jobs.resultRef`. */
export type AiJobHandler = (context: AiJobContext) => Promise<string | null>;

export type AiJobHandlers = Record<AiJobKind, AiJobHandler>;

function parsePayload<Schema extends z.ZodType>(schema: Schema, payload: unknown): z.infer<Schema> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AiJobPermanentError(
      `payload is not valid: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`,
    );
  }
  return parsed.data as z.infer<Schema>;
}

/** DESIGN.md §6.4 — the queued half of food parsing. */
export const estimateFoodHandler: AiJobHandler = async ({ job, deps, client, signal }) => {
  const payload = parsePayload(estimateFoodPayloadSchema, job.payload);
  const log = await deps.repos.nutrition.getLog(payload.foodLogId);
  if (log == null) throw new AiJobPermanentError(`food log ${payload.foodLogId} no longer exists`);

  const profile = await deps.repos.profile.get();
  let result;
  try {
    result = await parseFood({
      client,
      text: payload.text ?? log.rawText,
      region: payload.region ?? profile?.foodRegion ?? 'generic',
      mealSlot: log.mealSlot,
      ...(signal == null ? {} : { signal }),
    });
  } catch (error) {
    // Only a failure the queue will retry by itself may leave the row saying
    // "estimating…" (DESIGN.md §6.4). Anything else — a rejected key, a
    // refusal — has to show as failed so the "try again" affordance appears.
    if (classifyJobFailure(error) !== 'transient') {
      await deps.repos.nutrition.updateLog(log.id, { estimationStatus: 'failed' });
    }
    throw error;
  }

  if (result.refusal != null || result.items.length === 0) {
    await deps.repos.nutrition.updateLog(log.id, { estimationStatus: 'failed' });
    throw new AiJobPermanentError(
      result.refusal == null ? 'nothing could be estimated from that text' : 'the model declined to estimate it',
    );
  }

  await deps.repos.nutrition.replaceItems(log.id, result.items);
  await deps.repos.nutrition.updateLog(log.id, { estimationStatus: 'final', source: 'ai' });
  return log.id;
};

/** DESIGN.md §5.9 — the stats row exists; this fills in the prose. */
export const weeklyReviewHandler: AiJobHandler = async ({ job, deps, client, signal }) => {
  const payload = parsePayload(weeklyReviewPayloadSchema, job.payload);
  const review = await deps.repos.reviews.get(payload.weeklyReviewId);
  if (review == null) throw new AiJobPermanentError(`weekly review ${payload.weeklyReviewId} no longer exists`);

  const [profile, openInsights] = await Promise.all([
    deps.repos.profile.get(),
    deps.repos.insights.listOpen({ limit: 3 }),
  ]);

  const weekEnd = addDays(review.weekStart, 6);
  const stats: WeeklyReviewStats = {
    weekStart: review.weekStart,
    weekEnd,
    period: { from: review.weekStart, to: weekEnd },
    training: review.training,
    nutrition: review.nutrition,
    topInsights: openInsights.map((insight) => ({
      detector: insight.detector,
      period: insight.period,
      headline: insight.headline,
      detail: insight.detail,
      evidence: insight.evidence,
      severity: insight.severity,
      dismissed: insight.dismissed,
      dismissedAt: insight.dismissedAt,
    })),
    rationale: makeRationale(
      ['WEEKLY_REVIEW_STORED'],
      { weekStart: review.weekStart },
      'Stats for the week were computed by the app; the summary below is the coach reading them.',
    ),
  };

  const result = await writeWeeklyReview({
    client,
    stats,
    unitSystem: profile?.unitSystem ?? 'metric',
    ...(signal == null ? {} : { signal }),
  });
  if (result.prose == null) throw new AiJobPermanentError('the model declined to summarise the week');

  await deps.repos.reviews.setSummary(review.id, {
    summary: result.prose.summary,
    recommendation: result.prose.recommendation,
  });
  return review.id;
};

/** DESIGN.md §5.8 — detectors decide, the model only phrases. */
export const insightPhrasingHandler: AiJobHandler = async ({ job, deps, client, signal }) => {
  const payload = parsePayload(insightPhrasingPayloadSchema, job.payload);
  let insights: Insight[];
  if (payload.insightIds?.length) {
    const rows = await Promise.all(payload.insightIds.map((id) => deps.repos.insights.get(id)));
    insights = rows.filter((row): row is Insight => row != null);
  } else {
    insights = await deps.repos.insights.listOpen({ limit: 12 });
  }
  if (insights.length === 0) throw new AiJobPermanentError('there are no open insights to phrase');

  const result = await phraseInsights({
    client,
    insights,
    ...(signal == null ? {} : { signal }),
  });
  if (result.insights.length === 0) throw new AiJobPermanentError('the model returned no phrasing');

  const known = new Set(insights.map((insight) => insight.id));
  const updated: string[] = [];
  for (const phrased of result.insights) {
    if (!known.has(phrased.id)) continue;
    await deps.repos.insights.update(phrased.id, {
      headline: phrased.headline,
      detail: phrased.detail,
    });
    updated.push(phrased.id);
  }
  return updated.sort().join(',') || null;
};

/** DESIGN.md §6.4 — a recipe generated in the background, e.g. from a reminder. */
export const recipeHandler: AiJobHandler = async ({ job, deps, client, signal }) => {
  const payload = parsePayload(recipePayloadSchema, job.payload);
  const date = payload.date ?? deps.clock.today();
  const [profile, inventory, day, memories] = await Promise.all([
    deps.repos.profile.get(),
    deps.repos.inventory.list(),
    deps.repos.nutrition.getDay(date),
    deps.repos.memories.listActive({ domain: 'nutrition', limit: 20 }),
  ]);

  const result = await generateRecipe({
    client,
    inventory,
    remaining: day.targets == null ? null : day.remaining,
    constraints: (payload.constraints ?? {}) as Partial<MealPlanConstraints>,
    preferences: memories.map((memory) => memory.text),
    region: profile?.foodRegion ?? 'generic',
    ...(payload.timeMinutes == null ? {} : { timeMinutes: payload.timeMinutes }),
    ...(payload.servings == null ? {} : { servings: payload.servings }),
    ...(signal == null ? {} : { signal }),
  });
  if (result.recipe == null) throw new AiJobPermanentError('the model declined to write a recipe');

  const recipe = await deps.repos.recipes.create({
    ...toRecipeDraft(result.recipe),
    saved: payload.save ?? false,
  });
  return recipe.id;
};

export const DEFAULT_AI_JOB_HANDLERS: AiJobHandlers = {
  estimate_food: estimateFoodHandler,
  weekly_review: weeklyReviewHandler,
  insight_phrasing: insightPhrasingHandler,
  recipe: recipeHandler,
};

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

/** First retry after 30 s, doubling, capped at 30 minutes. */
export const BASE_BACKOFF_MS = 30_000;
export const MAX_BACKOFF_MS = 30 * 60_000;
export const DEFAULT_MAX_ATTEMPTS = 5;

export function backoffMs(attempts: number, base = BASE_BACKOFF_MS, cap = MAX_BACKOFF_MS): number {
  if (attempts <= 0) return 0;
  return Math.min(cap, base * 2 ** (attempts - 1));
}

export type AiJobOutcomeStatus =
  | 'done'
  | 'failed'
  | 'permanently_failed'
  /** The key was rejected; the job waits for a new one rather than retrying. */
  | 'blocked'
  | 'skipped';

export interface AiJobOutcome {
  jobId: string;
  kind: AiJobKind;
  status: AiJobOutcomeStatus;
  attempts: number;
  resultRef: string | null;
  error: string | null;
}

export interface AiJobRunSummary {
  ran: AiJobOutcome[];
  /** Set when the whole pass was skipped, e.g. because the device is offline. */
  skipped: 'offline' | null;
}

export interface AiJobRunnerConfig {
  deps: CoachDeps;
  client: AiClient;
  handlers?: Partial<AiJobHandlers>;
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface RunPendingOptions {
  /** Overrides the deps the runner was built with — a test seam. */
  deps?: CoachDeps;
  /** Most jobs to attempt in one pass. Default 5. */
  limit?: number;
  /** The instant to measure backoff against. Defaults to the runner's clock. */
  now?: IsoTimestamp;
  signal?: AbortSignal;
}

export interface AiJobRunner {
  /** Idempotent by `draft.id`: an existing row is returned unchanged. */
  enqueue(draft: AiJobDraft): Promise<AiJob>;
  /** Drains queued jobs and any failed ones whose backoff has elapsed. */
  runPending(options?: RunPendingOptions): Promise<AiJobRunSummary>;
  /** Runs one job now, ignoring backoff. Used by "try again" in the UI. */
  runOne(jobId: string, options?: RunPendingOptions): Promise<AiJobOutcome>;
  /**
   * Puts every job that stopped on a rejected key back in the queue. The
   * settings screen calls this after saving a new API key, so a meal logged
   * while the old key was dead is estimated on the next pass instead of
   * sitting on "estimating…" forever. Returns the job ids released.
   */
  retryCredentialFailures(options?: RunPendingOptions): Promise<string[]>;
}

export function createAiJobRunner(config: AiJobRunnerConfig): AiJobRunner {
  const handlers: AiJobHandlers = { ...DEFAULT_AI_JOB_HANDLERS, ...config.handlers };
  const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const base = config.baseBackoffMs ?? BASE_BACKOFF_MS;
  const cap = config.maxBackoffMs ?? MAX_BACKOFF_MS;

  async function execute(
    job: AiJob,
    deps: CoachDeps,
    signal?: AbortSignal,
  ): Promise<AiJobOutcome> {
    const running = await deps.repos.aiJobs.markRunning(job.id);
    try {
      const resultRef = await handlers[job.kind]({
        job: running,
        deps,
        client: config.client,
        ...(signal == null ? {} : { signal }),
      });
      const done = await deps.repos.aiJobs.markDone(job.id, resultRef);
      return {
        jobId: job.id,
        kind: job.kind,
        status: 'done',
        attempts: done.attempts,
        resultRef: done.resultRef,
        error: null,
      };
    } catch (error) {
      const failureClass = classifyJobFailure(error);
      const message = error instanceof Error ? error.message : String(error);
      const prefix =
        failureClass === 'permanent'
          ? PERMANENT_PREFIX
          : failureClass === 'credentials'
            ? CREDENTIAL_PREFIX
            : '';
      const failed = await deps.repos.aiJobs.markFailed(job.id, `${prefix}${message}`);
      return {
        jobId: job.id,
        kind: job.kind,
        status:
          failureClass === 'permanent'
            ? 'permanently_failed'
            : failureClass === 'credentials'
              ? 'blocked'
              : 'failed',
        attempts: failed.attempts,
        resultRef: failed.resultRef,
        error: message,
      };
    }
  }

  function retryDue(job: AiJob, now: number): boolean {
    const lastError = job.lastError ?? '';
    if (lastError.startsWith(PERMANENT_PREFIX)) return false;
    // Waiting never fixes a rejected key, and retrying on a schedule would only
    // burn the job's attempts. `retryCredentialFailures` releases these.
    if (lastError.startsWith(CREDENTIAL_PREFIX)) return false;
    if (job.attempts >= maxAttempts) return false;
    const since = Date.parse(job.updatedAt);
    if (Number.isNaN(since)) return true;
    return now - since >= backoffMs(job.attempts, base, cap);
  }

  return {
    async enqueue(draft) {
      return config.deps.repos.aiJobs.enqueue(draft);
    },

    async runPending(options = {}) {
      const deps = options.deps ?? config.deps;
      const online = (await deps.platform.network?.isOnline()) ?? true;
      if (!online) return { ran: [], skipped: 'offline' };

      const limit = options.limit ?? 5;
      const now = Date.parse(options.now ?? deps.clock.now());
      const ran: AiJobOutcome[] = [];

      const attempted = new Set<string>();
      const queued = await deps.repos.aiJobs.listQueued({ limit });
      for (const job of queued) {
        attempted.add(job.id);
        ran.push(await execute(job, deps, options.signal));
        if (ran.length >= limit) return { ran, skipped: null };
      }

      const failed = await deps.repos.aiJobs.list({ status: 'failed', limit: limit * 2 });
      for (const job of failed) {
        if (ran.length >= limit) break;
        // A job that just failed in this pass waits for the next one.
        if (attempted.has(job.id)) continue;
        if (!retryDue(job, now)) {
          ran.push({
            jobId: job.id,
            kind: job.kind,
            status: 'skipped',
            attempts: job.attempts,
            resultRef: job.resultRef,
            error: job.lastError,
          });
          continue;
        }
        const requeued = await deps.repos.aiJobs.requeue(job.id);
        ran.push(await execute(requeued, deps, options.signal));
      }

      return { ran, skipped: null };
    },

    async runOne(jobId, options = {}) {
      const deps = options.deps ?? config.deps;
      const job = await deps.repos.aiJobs.get(jobId);
      if (job == null) {
        return {
          jobId,
          kind: 'estimate_food',
          status: 'permanently_failed',
          attempts: 0,
          resultRef: null,
          error: `no job with id ${jobId}`,
        };
      }
      const ready = job.status === 'queued' ? job : await deps.repos.aiJobs.requeue(job.id);
      return execute(ready, deps, options.signal);
    },

    async retryCredentialFailures(options = {}) {
      const deps = options.deps ?? config.deps;
      const failed = await deps.repos.aiJobs.list({ status: 'failed', limit: options.limit ?? 50 });
      const released: string[] = [];
      for (const job of failed) {
        if (!(job.lastError ?? '').startsWith(CREDENTIAL_PREFIX)) continue;
        await deps.repos.aiJobs.requeue(job.id);
        released.push(job.id);
      }
      return released;
    },
  };
}
