/**
 * Layered prompt assembly — DESIGN.md §6.2.
 *
 * ```
 * [system, cached]   coach persona, safety rules, unit system, explanation
 *                    style, tool guidance
 * [system, cached]   exercise library digest (id, name, equipment, difficulty)
 * [user turn]        <context> … </context> + the user's message
 * ```
 *
 * The two system blocks carry `cache_control` breakpoints, so the prefix is
 * reused across every turn. That only works if the prefix is byte-stable, which
 * is why nothing in this file reads a clock, generates an id, or serialises an
 * unordered collection: every list is sorted by an explicit key before it is
 * rendered, and everything that changes during a day lives in the `<context>`
 * block, after the last breakpoint.
 *
 * `context.test.ts` proves both halves of that: two builds from one fixture set
 * produce an identical prefix, and changing only today's data leaves the prefix
 * untouched.
 */

import {
  formatLoad,
  formatNumber,
  weekdayName,
  weekdayOf,
  type DayNutrition,
  type Exercise,
  type Goal,
  type Id,
  type Insight,
  type LocalDate,
  type Memory,
  type Profile,
  type ProgressionDecision,
  type Readiness,
  type ReadinessModifier,
  type SafetyEvent,
  type SetRecord,
  type UnitSystem,
  type WorkoutPlan,
  type WorkoutWithExercises,
} from '@vigor/core';
import { loadSeed } from '@vigor/library';
import type { BetaContentBlockParam, BetaTextBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import { cachedSystemBlock, type AiClient } from './client';
import type { CoachDeps } from './deps';

// ---------------------------------------------------------------------------
// Stable block 1 — persona, safety, units, explanation style, tool guidance
// ---------------------------------------------------------------------------

/** DESIGN.md §6.2 targets ~6k; §11 makes 8k the hard ceiling. */
export const COACH_CONTEXT_TOKEN_LIMIT = 8000;

/** Active memories carried in the context block — DESIGN.md §6.2. */
export const CONTEXT_MEMORY_LIMIT = 30;

/** Workouts carried, one line each — DESIGN.md §6.2. */
export const CONTEXT_WORKOUT_LIMIT = 7;

const UNIT_SENTENCE: Record<UnitSystem, string> = {
  metric:
    'This person reads kilograms, centimetres and kilocalories. Storage is metric, so a load a tool ' +
    'gives you in kilograms is already the number to say.',
  imperial:
    'This person reads pounds, inches and kilocalories. Storage is always metric, so every load a tool ' +
    'returns is in kilograms — say the `display` string the tool gives you rather than converting in your head.',
};

/**
 * The frozen half of the system prompt. Only the unit sentence varies, and it
 * changes when the user changes units — not per turn.
 */
export function buildCoachSystemPrompt(unitSystem: UnitSystem): string {
  return [
    'You are the coach inside VigorEngine, a local-first training and nutrition app that runs entirely on this',
    "person's own device. You are talking to the person whose data it is. Speak to them directly and plainly,",
    'the way a good coach talks on the gym floor: short sentences, concrete numbers, no hype, no emoji.',
    '',
    'WHAT YOU DECIDE, AND WHAT YOU NEVER DECIDE',
    "The app's engines own every number that comes out of arithmetic: loads, rep targets, how many sets survive a",
    'readiness modifier, calories, macros, estimated 1RM, streaks, plateau and deload calls. You never compute,',
    'estimate or round one of those yourself, and you never say a load or a macro figure that did not come back',
    'from a tool in this conversation. What you decide is selection and explanation: which exercises, in what',
    'order, how many sets, how long the rest, and why that fits this person today. If you think today should be',
    'lighter, say so through a per-exercise override of "hold" or "lighter" with a reason, and let the',
    'progression engine work out the number.',
    '',
    'SAFETY',
    'VigorEngine is not medical advice and you do not diagnose. If the person reports pain, a possible injury,',
    'dizziness, faintness, chest symptoms, numbness, or a sharp or unfamiliar sensation:',
    '  1. call report_safety straight away with what they actually said;',
    '  2. stop proposing progression — the engines hold the load and take a set off for you;',
    '  3. tell them to stop the movement that hurts, and to see a doctor or physiotherapist for anything sharp,',
    '     spreading, chest-related, or still there after a few days;',
    '  4. keep helping with what is still safe: the other side, mobility, nutrition, or simply resting well.',
    'While a safety event is open you do not add load, do not add volume, and do not talk anyone into training',
    'through it. You never suggest medication, taping, or any other treatment.',
    '',
    'UNITS',
    UNIT_SENTENCE[unitSystem],
    'Only plates, bells and machine stacks this person actually owns exist — never invent a load the app has not',
    'offered you.',
    '',
    'HOW YOU EXPLAIN',
    'Everything the app stores carries a structured rationale the user can open with "Why?". In conversation give',
    'the one-sentence version: what changed and the evidence behind it. "Your last three sets were 12, 12 and 12',
    'at RPE 8, so the bar goes up one increment today." Lead with the answer, then at most two sentences of',
    'reason. When a tool hands you a rationale summary, use its facts instead of writing your own.',
    '',
    'TOOLS',
    'Look things up before you assert them. The <context> block is a summary, not the database: anything older',
    'than the last seven sessions, and any detail below the line level, needs a tool call. propose_workout is how',
    'a plan becomes real — describing a session in prose saves nothing. Call it once per session, and use',
    'adjust_workout to change a plan that already exists. Use remember only for durable facts about this person:',
    'preferences, dislikes, constraints, injuries, equipment realities. Never store a passing mood. Use forget',
    'when they ask you to, and tell them in one clause what you saved or dropped.',
    '',
    'WHEN YOU DO NOT KNOW',
    'Say so, and say which tool you would need. Never fill a gap with a plausible number.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Stable block 2 — the exercise library digest
// ---------------------------------------------------------------------------

/** Compact load-type markers; `external` is the default and is left off. */
const LOAD_TYPE_CODE: Record<Exercise['loadType'], string> = {
  external: '',
  bodyweight: '+bw',
  assisted: '+assisted',
  band: '+band',
  time: '+time',
  distance: '+distance',
};

/**
 * One line per exercise, grouped by movement pattern and sorted by id inside
 * each group, so the digest is byte-identical for a given seed version.
 * Archived and custom rows are included — the coach can still be asked about
 * something the user built themselves.
 */
export function buildLibraryDigest(exercises: readonly Exercise[]): string {
  const usable = exercises.filter((exercise) => !exercise.archived);
  const byPattern = new Map<string, Exercise[]>();
  for (const exercise of usable) {
    const bucket = byPattern.get(exercise.movementPattern);
    if (bucket) bucket.push(exercise);
    else byPattern.set(exercise.movementPattern, [exercise]);
  }

  const lines: string[] = [
    'EXERCISE LIBRARY — the ids below are exactly what every tool expects.',
    'Format: id  name | equipment | difficulty 1-5. Rep ranges are the progression engine\'s to set.',
  ];
  for (const pattern of [...byPattern.keys()].sort()) {
    const bucket = (byPattern.get(pattern) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
    lines.push('', `## ${pattern}`);
    for (const exercise of bucket) {
      const equipment = exercise.equipment.slice().sort().join('+') || 'none';
      lines.push(
        `${exercise.id}  ${exercise.name} | ${equipment}${LOAD_TYPE_CODE[exercise.loadType]} | d${exercise.difficulty}`,
      );
    }
  }
  return lines.join('\n');
}

let seedDigest: string | null = null;

/**
 * The digest of the shipped seed library from `@vigor/library`, built once and
 * cached for the life of the process. `collectCoachContext` prefers the
 * database's own copy — it includes the user's custom exercises and respects
 * archiving — but this is the right source when there is no database handy,
 * such as a token-budget check at build time.
 */
export function seedLibraryDigest(): string {
  seedDigest ??= buildLibraryDigest(loadSeed().exercises);
  return seedDigest;
}

// ---------------------------------------------------------------------------
// The volatile <context> block
// ---------------------------------------------------------------------------

export interface CoachContextInput {
  today: LocalDate;
  unitSystem: UnitSystem;
  profile: Profile | null;
  goals: readonly Goal[];
  /** Active memories; the builder sorts and keeps the newest 30. */
  memories: readonly Memory[];
  /** Recent sessions; the builder sorts and keeps the newest 7. */
  recentWorkouts: readonly WorkoutWithExercises[];
  /** Exercise id → name, for the workout one-liners. */
  exerciseNames: Readonly<Record<Id, string>>;
  readiness: Readiness | null;
  readinessModifier: ReadinessModifier;
  nutrition: DayNutrition | null;
  /** Unresolved events only — DESIGN.md §6.5 safety state. */
  openSafetyEvents: readonly SafetyEvent[];
  /** Engine output already computed for today (DESIGN.md §6.2). */
  plannerDraft: WorkoutPlan | null;
  progressionDecisions: readonly ProgressionDecision[];
  openInsights: readonly Insight[];
  /** Rendered by {@link buildLibraryDigest}. Stable across turns. */
  libraryDigest: string;
}

export interface CoachContext {
  /** `[persona, library digest]`, both carrying a cache breakpoint. */
  system: BetaTextBlockParam[];
  /** The `<context>…</context>` text that opens the user turn. */
  contextBlock: string;
  /**
   * The exact bytes that must not change between turns. Everything after this
   * is volatile by design.
   */
  prefix: string;
  today: LocalDate;
  unitSystem: UnitSystem;
}

function bullet(lines: readonly string[]): string {
  return lines.length === 0 ? '  (none)' : lines.map((line) => `  - ${line}`).join('\n');
}

function profileLine(profile: Profile | null): string {
  if (profile == null) return 'profile: not set up yet — ask before assuming anything.';
  const styles = profile.preferredStyles.slice().sort().join(', ') || 'no stated style';
  const parts = [
    profile.displayName,
    profile.fitnessLevel,
    `${profile.trainingExperienceMonths} months training`,
    `prefers ${profile.preferredDurationMin} min sessions`,
    `trains ${profile.trainingLocation}`,
    `styles: ${styles}`,
    `activity ${profile.activityLevel}`,
    `food region ${profile.foodRegion}`,
  ];
  if (profile.heightCm != null) parts.push(`${formatNumber(profile.heightCm)} cm`);
  if (profile.weightKg != null) parts.push(`${formatNumber(profile.weightKg)} kg`);
  const notes = profile.notes?.trim();
  return `profile: ${parts.join(', ')}${notes ? `. Notes: ${notes}` : ''}`;
}

function goalLines(goals: readonly Goal[]): string[] {
  return goals
    .filter((goal) => goal.active)
    .slice()
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .map(
      (goal) =>
        `${goal.priority}. ${goal.type}${goal.targetNote ? ` — ${goal.targetNote}` : ''}`,
    );
}

function memoryLines(memories: readonly Memory[]): string[] {
  return memories
    .filter((memory) => memory.active)
    .slice()
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        b.createdAt.localeCompare(a.createdAt) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, CONTEXT_MEMORY_LIMIT)
    .map(
      (memory) =>
        `[${memory.kind}/${memory.domain}] ${memory.text} (confidence ${formatNumber(memory.confidence)}, ${memory.source}, id ${memory.id})`,
    );
}

function setSummary(sets: readonly SetRecord[]): string {
  const working = sets.filter((set) => !set.isWarmup && set.completed);
  if (working.length === 0) return 'no working sets logged';
  const reps = working.map((set) => set.actualReps ?? 0).join('/');
  const loads = [...new Set(working.map((set) => set.actualLoadKg).filter((load): load is number => load != null))];
  const rpes = working.map((set) => set.rpe).filter((rpe): rpe is number => rpe != null);
  const loadText = loads.length === 0 ? 'bodyweight' : `${loads.map(formatNumber).join('/')} kg`;
  const rpeText = rpes.length === 0 ? '' : ` RPE ${formatNumber(rpes.reduce((a, b) => a + b, 0) / rpes.length)}`;
  return `${working.length}x${reps} @ ${loadText}${rpeText}`;
}

function workoutLines(
  workouts: readonly WorkoutWithExercises[],
  names: Readonly<Record<Id, string>>,
): string[] {
  return workouts
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, CONTEXT_WORKOUT_LIMIT)
    .map((workout) => {
      const exercises = workout.exercises
        .slice()
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((entry) => `${names[entry.exerciseId] ?? entry.exerciseId} ${setSummary(entry.sets)}`)
        .join('; ');
      return `${workout.date} ${workout.status} "${workout.title}" (${workout.plannedDurationMin} min, ${workout.source}) — ${exercises || 'no exercises'}`;
    });
}

function readinessLine(
  readiness: Readiness | null,
  modifier: ReadinessModifier,
): string {
  if (readiness == null) {
    return `readiness today: no check-in — modifier ${modifier}`;
  }
  const parts = [
    readiness.score == null ? 'score not computed' : `score ${formatNumber(readiness.score)}`,
    `modifier ${modifier}`,
  ];
  if (readiness.sleepHours != null) parts.push(`slept ${formatNumber(readiness.sleepHours)} h`);
  if (readiness.sleepQuality != null) parts.push(`sleep quality ${readiness.sleepQuality}/5`);
  if (readiness.energy != null) parts.push(`energy ${readiness.energy}/5`);
  if (readiness.soreness != null) parts.push(`soreness ${readiness.soreness}/5`);
  if (readiness.fatigue != null) parts.push(`fatigue ${readiness.fatigue}/5`);
  if (readiness.stress != null) parts.push(`stress ${readiness.stress}/5`);
  if (readiness.painReported) parts.push(`PAIN REPORTED: ${readiness.painNote ?? 'no note'}`);
  return `readiness today: ${parts.join(', ')}`;
}

function nutritionLine(nutrition: DayNutrition | null): string {
  if (nutrition == null) return 'nutrition today: nothing logged yet, no targets loaded';
  const { consumed, remaining, targets } = nutrition;
  if (targets == null) {
    return (
      `nutrition today: ${formatNumber(consumed.kcal)} kcal, ${formatNumber(consumed.proteinG)} g protein, ` +
      `${formatNumber(consumed.carbsG)} g carbs, ${formatNumber(consumed.fatG)} g fat, ` +
      `${formatNumber(consumed.fiberG)} g fibre logged across ${nutrition.mealsLogged} meals. No targets set.`
    );
  }
  return (
    `nutrition today: ${formatNumber(consumed.kcal)}/${formatNumber(targets.kcal)} kcal, ` +
    `protein ${formatNumber(consumed.proteinG)}/${formatNumber(targets.proteinG)} g, ` +
    `carbs ${formatNumber(consumed.carbsG)}/${formatNumber(targets.carbsG)} g, ` +
    `fat ${formatNumber(consumed.fatG)}/${formatNumber(targets.fatG)} g, ` +
    `fibre ${formatNumber(consumed.fiberG)}/${formatNumber(targets.fiberG)} g. ` +
    `Remaining (signed): ${formatNumber(remaining.kcal)} kcal, ${formatNumber(remaining.proteinG)} g protein. ` +
    `${nutrition.mealsLogged} meals logged.`
  );
}

function safetyLines(events: readonly SafetyEvent[]): string {
  const open = events
    .filter((event) => event.resolvedAt == null)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  if (open.length === 0) return 'safety state: clear — normal progression allowed.';
  const lines = open.map(
    (event) => `${event.date} ${event.kind} (${event.source}): ${event.text} [id ${event.id}]`,
  );
  return [
    `safety state: ACTIVE — ${open.length} unresolved event(s). Hold loads, drop the affected pattern, recommend professional advice.`,
    bullet(lines),
  ].join('\n');
}

function plannerLines(
  plan: WorkoutPlan | null,
  names: Readonly<Record<Id, string>>,
  unitSystem: UnitSystem,
): string {
  if (plan == null) return 'planner draft: none built for today.';
  const rows = plan.exercises
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => {
      const load =
        entry.targetLoadKg == null ? 'bodyweight' : formatLoad(entry.targetLoadKg, unitSystem);
      return `${entry.order + 1}. ${names[entry.exerciseId] ?? entry.exerciseId} ${entry.targetSets}x${entry.targetRepMin}-${entry.targetRepMax} @ ${load}, rest ${entry.restSec}s`;
    });
  return [
    `planner draft (${plan.source}, ${plan.plannedDurationMin} min, "${plan.title}"): ${plan.rationale.summary}`,
    bullet(rows),
  ].join('\n');
}

function progressionLines(
  decisions: readonly ProgressionDecision[],
  names: Readonly<Record<Id, string>>,
  unitSystem: UnitSystem,
): string[] {
  return decisions
    .slice()
    .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId))
    .map((decision) => {
      const load =
        decision.targetLoadKg == null
          ? 'no external load'
          : formatLoad(decision.targetLoadKg, unitSystem);
      return `${names[decision.exerciseId] ?? decision.exerciseId}: ${decision.action} → ${decision.targetSets}x${decision.targetRepMin}-${decision.targetRepMax} @ ${load} [${decision.rationale.codes.join(', ')}] ${decision.rationale.summary}`;
    });
}

function insightLines(insights: readonly Insight[]): string[] {
  const severityRank: Record<Insight['severity'], number> = { warning: 0, notice: 1, info: 2 };
  return insights
    .filter((insight) => !insight.dismissed)
    .slice()
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        a.detector.localeCompare(b.detector) ||
        a.id.localeCompare(b.id),
    )
    .map((insight) => `${insight.detector} (${insight.severity}): ${insight.headline} — ${insight.detail}`);
}

/** Renders the volatile half. Deterministic for a given input. */
export function buildContextBlock(input: CoachContextInput): string {
  const { today, unitSystem, exerciseNames } = input;
  return [
    '<context>',
    `today: ${today} (${weekdayName(weekdayOf(today))})`,
    `unit system: ${unitSystem}`,
    '',
    profileLine(input.profile),
    '',
    'active goals (1 = highest priority):',
    bullet(goalLines(input.goals)),
    '',
    `active memories (newest ${CONTEXT_MEMORY_LIMIT}):`,
    bullet(memoryLines(input.memories)),
    '',
    `last ${CONTEXT_WORKOUT_LIMIT} workouts:`,
    bullet(workoutLines(input.recentWorkouts, exerciseNames)),
    '',
    readinessLine(input.readiness, input.readinessModifier),
    nutritionLine(input.nutrition),
    safetyLines(input.openSafetyEvents),
    '',
    'engine output already computed for today:',
    plannerLines(input.plannerDraft, exerciseNames, unitSystem),
    'progression decisions:',
    bullet(progressionLines(input.progressionDecisions, exerciseNames, unitSystem)),
    'open insights:',
    bullet(insightLines(input.openInsights)),
    '</context>',
  ].join('\n');
}

/**
 * Builds the whole layered prompt. `system` is the cached prefix; the caller
 * puts `contextBlock` and the user's message in the user turn, in that order.
 */
export function buildCoachContext(input: CoachContextInput): CoachContext {
  const system: BetaTextBlockParam[] = [
    cachedSystemBlock(buildCoachSystemPrompt(input.unitSystem)),
    cachedSystemBlock(input.libraryDigest),
  ];
  return {
    system,
    contextBlock: buildContextBlock(input),
    prefix: system.map((block) => block.text).join('\n \n'),
    today: input.today,
    unitSystem: input.unitSystem,
  };
}

/**
 * The user turn: the volatile context first, the person's message second, so
 * the shared prefix ends before anything that differs per request.
 */
export function coachUserContent(
  context: CoachContext,
  userText: string,
): BetaContentBlockParam[] {
  return [
    { type: 'text', text: context.contextBlock },
    { type: 'text', text: userText },
  ];
}

// ---------------------------------------------------------------------------
// Loading the input from the database
// ---------------------------------------------------------------------------

export interface CollectCoachContextOptions {
  /** Defaults to `deps.clock.today()`. */
  today?: LocalDate;
  /** Overrides the digest, e.g. to include the user's custom exercises. */
  libraryDigest?: string;
  /** Engine output the caller already computed for today (DESIGN.md §6.2). */
  plannerDraft?: WorkoutPlan | null;
  progressionDecisions?: readonly ProgressionDecision[];
}

/**
 * Reads everything §6.2 lists out of the repositories. One call per coach turn;
 * every query is bounded so this stays cheap on a large history.
 */
export async function collectCoachContext(
  deps: CoachDeps,
  options: CollectCoachContextOptions = {},
): Promise<CoachContextInput> {
  const today = options.today ?? deps.clock.today();
  const { repos, engines } = deps;

  const [profile, goals, memories, recentWorkouts, readiness, nutrition, openSafetyEvents, openInsights, exercises] =
    await Promise.all([
      repos.profile.get(),
      repos.goals.listActive(),
      repos.memories.listActive({ limit: CONTEXT_MEMORY_LIMIT }),
      repos.workouts.getRecent({ days: 14, today }),
      repos.readiness.getByDate(today),
      repos.nutrition.getDay(today),
      repos.safety.listOpen(),
      repos.insights.listOpen({ limit: 8 }),
      repos.exercises.list(),
    ]);

  const assessment = engines.assessReadiness(readiness, today);
  const safetyActive = openSafetyEvents.length > 0;
  const exerciseNames: Record<Id, string> = {};
  for (const exercise of exercises) exerciseNames[exercise.id] = exercise.name;

  return {
    today,
    unitSystem: profile?.unitSystem ?? 'metric',
    profile,
    goals,
    memories,
    recentWorkouts,
    exerciseNames,
    readiness,
    readinessModifier: safetyActive ? 'safety' : assessment.modifier,
    nutrition,
    openSafetyEvents,
    plannerDraft: options.plannerDraft ?? null,
    progressionDecisions: options.progressionDecisions ?? [],
    openInsights,
    libraryDigest: options.libraryDigest ?? buildLibraryDigest(exercises),
  };
}

// ---------------------------------------------------------------------------
// Token accounting — DESIGN.md §11
// ---------------------------------------------------------------------------

/**
 * Offline estimate, ~4 characters per token. Deliberately cheap and slightly
 * pessimistic; use it to decide whether to trim before spending a round trip.
 */
export function estimateCoachContextTokens(context: CoachContext, userText = ''): number {
  const characters =
    context.prefix.length + context.contextBlock.length + userText.length + 64;
  return Math.ceil(characters / 4);
}

export interface CountCoachContextOptions {
  userText?: string;
  /** Defaults to the client's coach model. Counting is model-scoped. */
  model?: string;
  signal?: AbortSignal;
}

/**
 * The real number, from the `count_tokens` endpoint. This is the check
 * DESIGN.md §11 asks for; the live test that calls it is opt-in behind
 * `VIGOR_LIVE_AI=1`.
 */
export async function countCoachContextTokens(
  client: AiClient,
  context: CoachContext,
  options: CountCoachContextOptions = {},
): Promise<number> {
  const response = await client.messages.countTokens(
    {
      model: options.model ?? client.settings.coachModel,
      system: context.system,
      messages: [
        { role: 'user', content: coachUserContent(context, options.userText ?? '') },
      ],
    },
    options.signal == null ? undefined : { signal: options.signal },
  );
  return response.input_tokens;
}
