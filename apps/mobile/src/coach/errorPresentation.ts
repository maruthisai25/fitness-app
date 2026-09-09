/**
 * What a screen does about a failed coach request — DESIGN.md §7.1: "typed
 * error states from AiError (bad key → link to settings; rate limit → retry
 * later)". `error.userMessage` is always the sentence to render as-is
 * (`@vigor/ai`'s `AI_ERROR_MESSAGES`); this only decides the follow-up action.
 */
import type { AiError } from '@vigor/ai';

export type CoachErrorAction = 'settings' | 'retry' | null;

export function coachErrorAction(error: AiError): CoachErrorAction {
  if (error.kind === 'auth' || error.kind === 'permission' || error.kind === 'not_found') {
    return 'settings';
  }
  if (error.retryable) return 'retry';
  return null;
}
