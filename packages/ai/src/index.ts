/**
 * `@vigor/ai` — Anthropic client factory, prompts, tools, coach orchestrator and
 * the AI job queue. DESIGN.md §3, §6.
 *
 * Phase 0 ships the model defaults and the settings keys the shells need; the
 * ai agent fills the client, context assembly, tools and prompt tasks.
 *
 * The API key is read from the platform SecureStore and never leaves
 * `client.ts` (DESIGN.md §6.1, §11).
 */

/** DESIGN.md §6.1 — coach chat, workout generation, weekly review, recipes. */
export const DEFAULT_COACH_MODEL = 'claude-opus-5';

/** DESIGN.md §6.1 — food-text parsing and memory extraction. */
export const DEFAULT_FAST_MODEL = 'claude-haiku-4-5';

/** The only outbound host in the whole app (DESIGN.md §8). */
export const ANTHROPIC_API_HOST = 'api.anthropic.com';

/**
 * SecureStore key that holds the user's Anthropic API key, and the value both
 * shells write into `settings.apiKeyRef` when the user saves one (DESIGN.md
 * §4.1, §6.1). `client.ts` must resolve `settings.apiKeyRef` and fall back to
 * this only when the setting is empty — if the two strings drift, a stored key
 * becomes invisible to the coach.
 */
export const API_KEY_STORE_KEY = 'anthropic-api-key';

/**
 * Budget for the assembled coach context (DESIGN.md §6.2 targets ~6k tokens;
 * §11 requires a `count_tokens` check to stay under this ceiling).
 */
export const COACH_CONTEXT_TOKEN_LIMIT = 8000;
