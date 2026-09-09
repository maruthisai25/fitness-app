/**
 * Weekly review prose, memory extraction and insight phrasing — DESIGN.md §6.4,
 * §5.8, §5.9.
 *
 * The stats are already computed and stored; the model only writes the words.
 * That is deliberate: the numbers in a review must match the numbers on the
 * Progress tab exactly, so the prompt is told to quote the figures it is given
 * and forbidden to derive new ones.
 */

import {
  formatNumber,
  type Insight,
  type MemoryDomain,
  type MemoryKind,
  type TokenUsage,
  type UnitSystem,
  type WeeklyReviewStats,
} from '@vigor/core';
import { z } from 'zod';

import type { AiClient } from '../client';
import type { CoachRefusal } from '../errors';
import { describeList, runStructuredTask } from './run';

// ---------------------------------------------------------------------------
// Weekly review
// ---------------------------------------------------------------------------

export const weeklyReviewProseSchema = z.object({
  summary: z.string().min(20).max(900).describe('At most 120 words on how the week went'),
  recommendation: z.string().min(10).max(400).describe('One thing to change next week'),
});

export type WeeklyReviewProse = z.infer<typeof weeklyReviewProseSchema>;

const REVIEW_SYSTEM = [
  "You write the short weekly summary in a person's own training app. You are talking to them.",
  '',
  'Rules:',
  '- At most 120 words in the summary, then exactly one recommendation.',
  '- Every number you use must appear in the stats you were given. Do not compute a new one, do not extrapolate',
  '  a trend from a single week, and do not estimate anything.',
  '- Say what actually happened before you say what to change. If the week was thin, say so plainly and',
  '  without a lecture.',
  '- The recommendation is one concrete action for next week, not a list.',
  '- No congratulation formulas, no emoji, no exclamation marks. Do not comment on their body.',
].join('\n');

function reviewFacts(stats: WeeklyReviewStats, unitSystem: UnitSystem): string {
  const { training, nutrition } = stats;
  return [
    `Week ${stats.weekStart} to ${stats.weekEnd}. Units: ${unitSystem}.`,
    '',
    'Training:',
    `- sessions completed ${training.workoutsCompleted} of ${training.workoutsPlanned} planned (${Math.round(training.completionRate * 100)} %)`,
    `- total working sets ${training.totalSets}, total volume ${formatNumber(training.totalVolumeKg)} kg`,
    `- missed sessions ${training.missedSessions}`,
    `- average RPE ${training.averageRpe == null ? 'not rated' : formatNumber(training.averageRpe)}`,
    `- average duration ${training.averageDurationMin == null ? 'unknown' : `${Math.round(training.averageDurationMin)} min`}`,
    describeList(
      '- volume by muscle group',
      training.volumeByMuscleGroup.map(
        (row) => `${row.muscle}: ${row.sets} sets, ${formatNumber(row.volumeKg)} kg`,
      ),
    ),
    describeList(
      '- personal records',
      training.personalRecords.map(
        (record) => `${record.exerciseName} ${record.kind} ${formatNumber(record.value)} on ${record.date}`,
      ),
    ),
    '',
    'Nutrition:',
    `- days logged ${nutrition.daysLogged}`,
    `- averages: ${Math.round(nutrition.averageKcal)} kcal, ${Math.round(nutrition.averageProteinG)} g protein, ${Math.round(nutrition.averageCarbsG)} g carbs, ${Math.round(nutrition.averageFatG)} g fat, ${Math.round(nutrition.averageFiberG)} g fibre`,
    `- target hit rate: kcal ${Math.round(nutrition.targetHitRate.kcal * 100)} %, protein ${Math.round(nutrition.targetHitRate.proteinG * 100)} %, fibre ${Math.round(nutrition.targetHitRate.fiberG * 100)} %`,
    `- most missed: ${nutrition.missedTargets.length === 0 ? 'nothing' : nutrition.missedTargets.join(', ')}`,
    '',
    describeList(
      'Detected insights',
      stats.topInsights.map((insight) => `${insight.detector} (${insight.severity}): ${insight.headline} — ${insight.detail}`),
    ),
  ].join('\n');
}

export interface WriteWeeklyReviewOptions {
  client: AiClient;
  stats: WeeklyReviewStats;
  unitSystem?: UnitSystem;
  model?: string;
  signal?: AbortSignal;
}

export interface WriteWeeklyReviewResult {
  prose: WeeklyReviewProse | null;
  refusal: CoachRefusal | null;
  usage: TokenUsage;
  model: string;
}

export async function writeWeeklyReview(
  options: WriteWeeklyReviewOptions,
): Promise<WriteWeeklyReviewResult> {
  const result = await runStructuredTask({
    client: options.client,
    kind: 'task',
    schema: weeklyReviewProseSchema,
    system: REVIEW_SYSTEM,
    user: reviewFacts(options.stats, options.unitSystem ?? 'metric'),
    maxTokens: 1500,
    ...(options.model == null ? {} : { model: options.model }),
    ...(options.signal == null ? {} : { signal: options.signal }),
  });
  return {
    prose: result.data,
    refusal: result.refusal,
    usage: result.usage,
    model: result.model,
  };
}

// ---------------------------------------------------------------------------
// Memory extraction — DESIGN.md §6.4
// ---------------------------------------------------------------------------

export const memoryProposalSchema = z.object({
  kind: z.enum(['preference', 'dislike', 'constraint', 'injury', 'behavior', 'fact', 'goal_note']),
  domain: z.enum(['training', 'nutrition', 'general']),
  text: z.string().min(4).max(280).describe('One plain sentence in their own terms'),
  confidence: z.number().min(0).max(1),
});

export const memoryExtractionSchema = z.object({
  memories: z.array(memoryProposalSchema).max(5),
});

export interface MemoryProposal {
  kind: MemoryKind;
  domain: MemoryDomain;
  text: string;
  confidence: number;
}

const MEMORY_SYSTEM = [
  'You read one message a person sent their training app and pull out durable facts worth remembering.',
  '',
  'Remember: preferences, dislikes, constraints (schedule, equipment, budget), injuries, habits they describe',
  'about themselves, and notes that change what a goal means.',
  '',
  'Never remember:',
  '- how they feel today, or anything else that is true only for this session;',
  '- anything hypothetical ("what if I trained five days"), a question, or a request;',
  '- numbers the app already owns: loads, macros, body weight, streaks;',
  '- a restatement of something obvious from context.',
  '',
  'Write each memory as one sentence in the third person about them ("Trains before work on weekdays"), not as',
  'a quote. Return an empty list when the message contains nothing durable — that is the common case, and an',
  'empty list is a correct answer.',
].join('\n');

export interface ExtractMemoriesOptions {
  client: AiClient;
  /** The user's message, verbatim. */
  userText: string;
  /** Memories already stored, so the model does not propose duplicates. */
  existing?: readonly string[];
  model?: string;
  signal?: AbortSignal;
}

export interface ExtractMemoriesResult {
  memories: MemoryProposal[];
  refusal: CoachRefusal | null;
  usage: TokenUsage;
  model: string;
}

/**
 * Runs after a chat turn on `fastModel`. The UI shows each proposal as a
 * "Remembered: …" chip the user can undo, so nothing here writes to the
 * database itself.
 */
export async function extractMemories(
  options: ExtractMemoriesOptions,
): Promise<ExtractMemoriesResult> {
  const user = [
    describeList('Already remembered (do not repeat)', [...(options.existing ?? [])].sort()),
    '',
    'Their message:',
    options.userText.trim(),
  ].join('\n');

  const result = await runStructuredTask({
    client: options.client,
    kind: 'parse',
    schema: memoryExtractionSchema,
    system: MEMORY_SYSTEM,
    user,
    ...(options.model == null ? {} : { model: options.model }),
    ...(options.signal == null ? {} : { signal: options.signal }),
  });

  return {
    memories: result.data?.memories ?? [],
    refusal: result.refusal,
    usage: result.usage,
    model: result.model,
  };
}

// ---------------------------------------------------------------------------
// Insight phrasing — DESIGN.md §5.8 ("Claude is only asked to phrase a batch")
// ---------------------------------------------------------------------------

export const phrasedInsightsSchema = z.object({
  insights: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        headline: z.string().min(4).max(90),
        detail: z.string().min(10).max(320),
      }),
    )
    .max(12),
});

export type PhrasedInsight = z.infer<typeof phrasedInsightsSchema>['insights'][number];

const INSIGHT_SYSTEM = [
  'You rewrite detector output into sentences a person will read on their own progress screen.',
  '',
  'Rules:',
  '- Keep every number exactly as given. You are rewriting wording, not analysis.',
  '- The headline is a short statement of the finding, under about ten words, with no punctuation flourishes.',
  '- The detail says what was measured and over what period, in one or two sentences.',
  '- Never add a cause, a prediction or advice. The app decides what to suggest.',
  '- Return one entry per input id, with the same id.',
].join('\n');

export interface PhraseInsightsOptions {
  client: AiClient;
  insights: readonly Insight[];
  model?: string;
  signal?: AbortSignal;
}

export interface PhraseInsightsResult {
  insights: PhrasedInsight[];
  refusal: CoachRefusal | null;
  usage: TokenUsage;
  model: string;
}

export async function phraseInsights(
  options: PhraseInsightsOptions,
): Promise<PhraseInsightsResult> {
  const user = describeList(
    'Detector output',
    options.insights
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (insight) =>
          `id ${insight.id} | ${insight.detector} | ${insight.severity} | period ${insight.period.from} to ${insight.period.to} | ${insight.headline} | ${insight.detail} | facts ${JSON.stringify(insight.evidence)}`,
      ),
  );

  const result = await runStructuredTask({
    client: options.client,
    kind: 'parse',
    schema: phrasedInsightsSchema,
    system: INSIGHT_SYSTEM,
    user,
    maxTokens: 2000,
    ...(options.model == null ? {} : { model: options.model }),
    ...(options.signal == null ? {} : { signal: options.signal }),
  });

  return {
    insights: result.data?.insights ?? [],
    refusal: result.refusal,
    usage: result.usage,
    model: result.model,
  };
}
