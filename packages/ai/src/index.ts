/**
 * `@vigor/ai` — Anthropic client factory, prompts, tools, coach orchestrator and
 * the AI job queue. DESIGN.md §3, §6.
 *
 * The API key is read in `client.ts` and nowhere else (DESIGN.md §6.1, §11).
 * The only outbound host in the whole app is `api.anthropic.com` (§8).
 *
 * Typical wiring in an app shell:
 *
 * ```ts
 * const client = createClient({ apiKey, dangerouslyAllowBrowser: isWeb, models });
 * const deps = createCoachDeps({ repos, clock });
 * const result = await runCoachTurn({ conversationId, userText, deps, client, onEvent });
 * ```
 *
 * `./testing` holds the scripted fake client the tests use; it is deliberately
 * not re-exported here so it cannot reach an app bundle.
 */

// Client and request shaping — DESIGN.md §6.1
export {
  ANTHROPIC_API_HOST,
  API_KEY_STORE_KEY,
  buildRequestBase,
  cachedSystemBlock,
  createAiClient,
  createClient,
  createClientFromSecureStore,
  DEFAULT_COACH_MODEL,
  DEFAULT_FAST_MODEL,
  DEFAULT_MODEL_SETTINGS,
  modelAcceptsThinking,
  modelSupportsServerSideFallback,
  refusalOf,
  resolveModelSettings,
  servedByFallback,
  SERVER_SIDE_FALLBACK_BETA,
  systemBlock,
  textOf,
  usageOf,
} from './client';
export type {
  AiClient,
  AiMessagesApi,
  AiMessageStream,
  AiRequestBase,
  AiRequestKind,
  AiToolRunner,
  CreateClientFromSecureStoreOptions,
  CreateClientOptions,
  ModelSettings,
  RequestBaseOverrides,
} from './client';

// Errors and refusals — DESIGN.md §6.1
export {
  AI_ERROR_MESSAGES,
  aiError,
  AiError,
  COACH_REFUSAL_MESSAGE,
  isAiError,
  isCoachRefusal,
  toAiError,
  toCoachRefusal,
} from './errors';
export type { AiErrorInfo, AiErrorKind, CoachRefusal } from './errors';

// Dependency injection — DESIGN.md §6.3
export { createCoachDeps, DEFAULT_COACH_ENGINES, systemCoachClock } from './deps';
export type { CoachClock, CoachDeps, CoachEngines, CoachPlatform, CreateCoachDepsInput } from './deps';

// Context assembly — DESIGN.md §6.2
export {
  buildCoachContext,
  buildCoachSystemPrompt,
  buildContextBlock,
  buildLibraryDigest,
  coachUserContent,
  COACH_CONTEXT_TOKEN_LIMIT,
  collectCoachContext,
  CONTEXT_MEMORY_LIMIT,
  CONTEXT_WORKOUT_LIMIT,
  countCoachContextTokens,
  estimateCoachContextTokens,
  seedLibraryDigest,
} from './context';
export type {
  CoachContext,
  CoachContextInput,
  CollectCoachContextOptions,
  CountCoachContextOptions,
} from './context';

// Safety pre-filter — DESIGN.md §6.5
export {
  SAFETY_FALSE_POSITIVE_PHRASES,
  SAFETY_KEYWORD_KIND,
  SAFETY_KEYWORDS,
  SAFETY_PREFILTER_NOTE,
  screenForSafety,
} from './safety';
export type { SafetyKeyword, SafetyScreenResult, SafetySeverity } from './safety';

// Tools — DESIGN.md §6.3
export { COACH_TOOL_NAMES, createCoachTools, findCoachTool } from './tools';
export type { CoachTool, CoachToolName } from './tools';

// The coach turn — DESIGN.md §6.2
export {
  DEFAULT_HISTORY_MAX_MESSAGES,
  DEFAULT_HISTORY_TOKEN_BUDGET,
  DEFAULT_MAX_ITERATIONS,
  runCoachTurn,
  selectHistory,
} from './coach';
export type {
  CoachEvent,
  CoachEventHandler,
  CoachTurnResult,
  HistorySelection,
  RunCoachTurnOptions,
} from './coach';

// Prompt tasks — DESIGN.md §6.4
export * from './tasks';

// The offline job queue — DESIGN.md §8
export {
  AiJobPermanentError,
  BASE_BACKOFF_MS,
  backoffMs,
  classifyJobFailure,
  createAiJobRunner,
  CREDENTIAL_PREFIX,
  DEFAULT_AI_JOB_HANDLERS,
  DEFAULT_MAX_ATTEMPTS,
  estimateFoodHandler,
  estimateFoodPayloadSchema,
  insightPhrasingHandler,
  insightPhrasingPayloadSchema,
  MAX_BACKOFF_MS,
  PERMANENT_PREFIX,
  recipeHandler,
  recipePayloadSchema,
  weeklyReviewHandler,
  weeklyReviewPayloadSchema,
} from './jobs';
export type {
  AiJobContext,
  AiJobFailureClass,
  AiJobHandler,
  AiJobHandlers,
  AiJobOutcome,
  AiJobOutcomeStatus,
  AiJobRunner,
  AiJobRunnerConfig,
  AiJobRunSummary,
  RunPendingOptions,
} from './jobs';
