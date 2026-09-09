/**
 * The Anthropic client factory — DESIGN.md §6.1, §11.
 *
 * This is the only module in the whole app that reads the API key. Everything
 * else takes an {@link AiClient}. The key is passed in by the caller (the
 * settings screen resolves it from the platform SecureStore); it is never read
 * from `process.env`, never logged and never written to the database.
 *
 * Every request this package makes is shaped here:
 *
 *   - `thinking: { type: "adaptive" }` on models that accept it. Haiku 4.5 does
 *     not, so the parameter is omitted for the fast model instead of sent and
 *     rejected.
 *   - `output_config.effort`: `medium` for chat and for the generative tasks on
 *     the coach model, `low` for parsing.
 *   - streaming for chat (see `coach.ts`).
 *   - on Opus requests, the server-side fallback beta
 *     (`betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"`),
 *     so a policy decline is re-run on Anthropic's fallback model inside the
 *     same call. `ModelSettings.serverSideFallback` turns it off; the settings
 *     screen says it is on.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicBeta } from '@anthropic-ai/sdk/resources/beta/beta';
import type { SecureStore } from '@vigor/platform';
import type {
  BetaMessage,
  BetaMessageParam,
  BetaMessageTokensCount,
  BetaTextBlockParam,
  BetaToolRunnerParams,
  BetaRawMessageStreamEvent,
  MessageCountTokensParams,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';

import { aiError, toAiError, toCoachRefusal, type CoachRefusal } from './errors';

// ---------------------------------------------------------------------------
// Model settings — DESIGN.md §6.1 (user-changeable in You → API key and models)
// ---------------------------------------------------------------------------

/** Coach chat, workout generation, weekly review, recipes. */
export const DEFAULT_COACH_MODEL = 'claude-opus-5';

/** Food-text parsing and memory extraction. */
export const DEFAULT_FAST_MODEL = 'claude-haiku-4-5';

/** The only outbound host in the whole app (DESIGN.md §8). */
export const ANTHROPIC_API_HOST = 'api.anthropic.com';

/**
 * SecureStore key that holds the user's Anthropic API key, and the value both
 * shells write into `settings.apiKeyRef` (DESIGN.md §4.1, §6.1).
 */
export const API_KEY_STORE_KEY = 'anthropic-api-key';

/** Header for the scalar `fallbacks: "default"` form. The array form uses a different one. */
export const SERVER_SIDE_FALLBACK_BETA: AnthropicBeta = 'server-side-fallback-2026-07-01';

export interface ModelSettings {
  /** DESIGN.md §6.1 — chat, planning, reviews, recipes. */
  coachModel: string;
  /** DESIGN.md §6.1 — food parsing and memory extraction. */
  fastModel: string;
  /**
   * Server-side refusal fallback on Opus requests. On by default; the settings
   * screen tells the user it is on and lets them switch it off.
   */
  serverSideFallback: boolean;
  /** Output ceiling for coach chat and generative tasks. */
  maxOutputTokens: number;
  /** Output ceiling for parsing on the fast model. */
  fastMaxOutputTokens: number;
}

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  coachModel: DEFAULT_COACH_MODEL,
  fastModel: DEFAULT_FAST_MODEL,
  serverSideFallback: true,
  maxOutputTokens: 8000,
  fastMaxOutputTokens: 2000,
};

/**
 * Models that reject a `thinking` parameter. Haiku 4.5 is the one this app
 * ships with; the check is a family match so a dated Haiku id behaves the same.
 */
export function modelAcceptsThinking(model: string): boolean {
  return !/haiku/i.test(model);
}

/** The server-side fallback beta is an Opus feature; other models reject it. */
export function modelSupportsServerSideFallback(model: string): boolean {
  return /opus/i.test(model);
}

// ---------------------------------------------------------------------------
// The slice of the SDK this package calls
// ---------------------------------------------------------------------------

/** A streamed message: the raw events, then the assembled `BetaMessage`. */
export interface AiMessageStream extends AsyncIterable<BetaRawMessageStreamEvent> {
  finalMessage(): Promise<BetaMessage>;
}

/** The tool-use loop, streaming. Mirrors `client.beta.messages.toolRunner(...)`. */
export interface AiToolRunner extends AsyncIterable<AiMessageStream> {
  /** The live parameters, including every message the runner has appended. */
  readonly params: Readonly<BetaToolRunnerParams>;
  pushMessages(...messages: BetaMessageParam[]): void;
  done(): Promise<BetaMessage>;
}

/**
 * Everything `@vigor/ai` needs from `client.beta.messages`. Tests implement
 * this directly (see `./testing`), so no default test touches the network.
 */
export interface AiMessagesApi {
  create(params: MessageCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<BetaMessage>;
  countTokens(
    params: MessageCountTokensParams,
    options?: { signal?: AbortSignal },
  ): Promise<BetaMessageTokensCount>;
  toolRunner(params: BetaToolRunnerParams & { stream: true }): AiToolRunner;
}

// ---------------------------------------------------------------------------
// Request shaping
// ---------------------------------------------------------------------------

/**
 * Which knob set a call uses:
 *
 *   `chat`  — coach conversation on the coach model, effort `medium`
 *   `task`  — generative structured work on the coach model (recipes, meal
 *             plans, weekly review), effort `medium`
 *   `parse` — extraction on the fast model (food text, memories), effort `low`
 */
export type AiRequestKind = 'chat' | 'task' | 'parse';

/** The parameters every request shares, ready to spread into a create call. */
export interface AiRequestBase {
  model: string;
  max_tokens: number;
  output_config: { effort: 'low' | 'medium' };
  thinking?: { type: 'adaptive' };
  betas?: AnthropicBeta[];
  fallbacks?: 'default';
}

export interface RequestBaseOverrides {
  /** Overrides the model the kind would pick. */
  model?: string;
  maxTokens?: number;
}

/**
 * Builds the shared request fields for one call kind. Pure, so the cache-prefix
 * test can compare two builds byte for byte.
 */
export function buildRequestBase(
  kind: AiRequestKind,
  settings: ModelSettings,
  overrides: RequestBaseOverrides = {},
): AiRequestBase {
  const model =
    overrides.model ?? (kind === 'parse' ? settings.fastModel : settings.coachModel);
  const maxTokens =
    overrides.maxTokens ??
    (kind === 'parse' ? settings.fastMaxOutputTokens : settings.maxOutputTokens);

  const base: AiRequestBase = {
    model,
    max_tokens: maxTokens,
    output_config: { effort: kind === 'parse' ? 'low' : 'medium' },
  };

  if (modelAcceptsThinking(model)) {
    base.thinking = { type: 'adaptive' };
  }
  if (settings.serverSideFallback && modelSupportsServerSideFallback(model)) {
    base.betas = [SERVER_SIDE_FALLBACK_BETA];
    base.fallbacks = 'default';
  }
  return base;
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

export interface AiClient {
  /** Resolved models and feature flags. Read-only for callers. */
  readonly settings: ModelSettings;
  /** The messages surface. `coach.ts` and `tasks/` call only through this. */
  readonly messages: AiMessagesApi;
  /** Shared request fields for a call kind — see {@link buildRequestBase}. */
  requestBase(kind: AiRequestKind, overrides?: RequestBaseOverrides): AiRequestBase;
}

export interface CreateClientOptions {
  /**
   * The user's Anthropic key, resolved from the platform SecureStore by the
   * caller. Required: an empty key fails fast with a typed `auth` error rather
   * than a confusing 401 on the first turn.
   */
  apiKey: string;
  /**
   * DESIGN.md §6.1 — the web app sets this because it has no server by design.
   * Mobile leaves it off.
   */
  dangerouslyAllowBrowser?: boolean;
  /** Overrides for the two model ids and the fallback flag. */
  models?: Partial<ModelSettings>;
  /** Test and proxy hook. Defaults to the SDK's own base URL. */
  baseURL?: string;
  maxRetries?: number;
  /** Per-request timeout in milliseconds. */
  timeout?: number;
}

/** Fills in the DESIGN.md §6.1 defaults for anything the user has not set. */
export function resolveModelSettings(patch?: Partial<ModelSettings>): ModelSettings {
  return {
    coachModel: patch?.coachModel?.trim() || DEFAULT_MODEL_SETTINGS.coachModel,
    fastModel: patch?.fastModel?.trim() || DEFAULT_MODEL_SETTINGS.fastModel,
    serverSideFallback: patch?.serverSideFallback ?? DEFAULT_MODEL_SETTINGS.serverSideFallback,
    maxOutputTokens: patch?.maxOutputTokens ?? DEFAULT_MODEL_SETTINGS.maxOutputTokens,
    fastMaxOutputTokens:
      patch?.fastMaxOutputTokens ?? DEFAULT_MODEL_SETTINGS.fastMaxOutputTokens,
  };
}

/**
 * Wraps an already-built messages surface. Used by `createClient` and by the
 * fake client in `./testing`; also the seam a UI can use to log requests.
 */
export function createAiClient(messages: AiMessagesApi, settings?: Partial<ModelSettings>): AiClient {
  const resolved = resolveModelSettings(settings);
  return {
    settings: resolved,
    messages,
    requestBase: (kind, overrides) => buildRequestBase(kind, resolved, overrides),
  };
}

/**
 * The one place the Anthropic API key is read (DESIGN.md §11). Everything the
 * SDK throws is already normalised here, so callers only ever see `AiError`.
 */
export function createClient(options: CreateClientOptions): AiClient {
  const apiKey = options.apiKey?.trim() ?? '';
  if (apiKey.length === 0) {
    throw aiError('auth', { message: 'createClient called without an API key' });
  }

  const anthropic = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: options.dangerouslyAllowBrowser ?? false,
    ...(options.baseURL == null ? {} : { baseURL: options.baseURL }),
    ...(options.maxRetries == null ? {} : { maxRetries: options.maxRetries }),
    ...(options.timeout == null ? {} : { timeout: options.timeout }),
  });

  const messages: AiMessagesApi = {
    async create(params, requestOptions) {
      try {
        return await anthropic.beta.messages.create(params, requestOptions);
      } catch (error) {
        throw toAiError(error);
      }
    },
    async countTokens(params, requestOptions) {
      try {
        return await anthropic.beta.messages.countTokens(params, requestOptions);
      } catch (error) {
        throw toAiError(error);
      }
    },
    toolRunner(params) {
      return anthropic.beta.messages.toolRunner(params);
    },
  };

  return createAiClient(messages, options.models);
}

export interface CreateClientFromSecureStoreOptions extends Omit<CreateClientOptions, 'apiKey'> {
  /**
   * Which SecureStore entry holds the key. Defaults to
   * {@link API_KEY_STORE_KEY}; pass `settings.apiKeyRef` when the user's
   * profile names a different one.
   */
  keyRef?: string;
}

/**
 * Builds a client straight from the platform SecureStore, so the key is never a
 * value in app code. DESIGN.md §11 — "no feature reads the API key outside
 * `packages/ai/client.ts` and the settings screen" — is only enforceable if the
 * shells never have to `get` it themselves, and this is how they avoid it.
 *
 * Returns `null` when nothing is stored yet, which is the "add your key in
 * You → API key and models" state, not an error.
 */
export async function createClientFromSecureStore(
  store: Pick<SecureStore, 'get'>,
  options: CreateClientFromSecureStoreOptions = {},
): Promise<AiClient | null> {
  const { keyRef, ...rest } = options;
  const stored = (await store.get(keyRef ?? API_KEY_STORE_KEY))?.trim() ?? '';
  if (stored.length === 0) return null;
  return createClient({ ...rest, apiKey: stored });
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/** The refusal on a finished message, or null when the model answered. */
export function refusalOf(message: BetaMessage): CoachRefusal | null {
  if (message.stop_reason !== 'refusal') return null;
  return toCoachRefusal(message.stop_details);
}

/** Concatenated text blocks of a finished message. */
export function textOf(message: BetaMessage): string {
  return message.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/** True when a fallback model was used on this turn (see the fallback beta). */
export function servedByFallback(message: BetaMessage): boolean {
  const iterations = message.usage?.iterations ?? [];
  return iterations.some((entry) => entry.type === 'fallback_message');
}

/** Maps SDK usage onto the `messages.usage` column shape from DESIGN.md §4.1. */
export function usageOf(message: BetaMessage): {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
} {
  return {
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
    cacheCreationInputTokens: message.usage?.cache_creation_input_tokens ?? null,
    cacheReadInputTokens: message.usage?.cache_read_input_tokens ?? null,
  };
}

/** A `text` system block with a cache breakpoint on it. */
export function cachedSystemBlock(text: string): BetaTextBlockParam {
  return { type: 'text', text, cache_control: { type: 'ephemeral' } };
}

/** A `text` system block with no breakpoint — everything volatile goes here. */
export function systemBlock(text: string): BetaTextBlockParam {
  return { type: 'text', text };
}
