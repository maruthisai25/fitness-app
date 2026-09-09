/**
 * Typed failures for every Anthropic call — DESIGN.md §6.1.
 *
 * Two things can go wrong that are not bugs:
 *
 *   1. the request failed (no key, rate limit, the phone is on a train) —
 *      mapped from the SDK's error classes to an {@link AiError} whose
 *      `userMessage` is ready to render;
 *   2. the model declined (`stop_reason: "refusal"`) — that is not an error at
 *      all, so it comes back as a {@link CoachRefusal} value and never throws.
 *
 * Nothing in this file ever includes the API key or the request body in a
 * message: DESIGN.md §8 says the key is never logged.
 */

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Every way a coach request can fail, as one discriminant. */
export type AiErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'connection'
  | 'timeout'
  | 'aborted'
  | 'bad_request'
  | 'permission'
  | 'not_found'
  | 'conflict'
  | 'unprocessable'
  | 'server'
  | 'invalid_response'
  | 'unknown';

export interface AiErrorInfo {
  kind: AiErrorKind;
  /** HTTP status when the SDK reported one, else null. */
  status: number | null;
  /** One sentence written for the coach screen. Safe to render as-is. */
  userMessage: string;
  /** True when the identical request can succeed later — the job queue reads this. */
  retryable: boolean;
}

/**
 * What every function in `@vigor/ai` throws. `message` is for logs, developers
 * and tests; `userMessage` is what a screen shows.
 */
export class AiError extends Error implements AiErrorInfo {
  readonly kind: AiErrorKind;
  readonly status: number | null;
  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(info: AiErrorInfo & { message?: string; cause?: unknown }) {
    super(info.message ?? info.userMessage, info.cause == null ? undefined : { cause: info.cause });
    this.name = 'AiError';
    this.kind = info.kind;
    this.status = info.status;
    this.userMessage = info.userMessage;
    this.retryable = info.retryable;
  }
}

export function isAiError(value: unknown): value is AiError {
  return value instanceof AiError;
}

/** The sentence each failure shows. Written from the user's side of the screen. */
export const AI_ERROR_MESSAGES: Record<AiErrorKind, string> = {
  auth: 'Anthropic rejected your API key. Open You → API key and models and paste a current one.',
  rate_limit:
    'Anthropic is rate-limiting your key right now. Wait a minute and ask again — nothing was lost.',
  connection:
    'I could not reach api.anthropic.com. Everything you logged is still on this device; I will pick this up when you are back online.',
  timeout: 'That request ran past its time limit. Ask again and I will retry.',
  aborted: 'You stopped that request.',
  bad_request: 'Anthropic rejected the shape of that request, so nothing was saved.',
  permission:
    'Your key is not allowed to use that model. Pick another one in You → API key and models.',
  not_found:
    'That model is not available on your key. Pick another one in You → API key and models.',
  conflict: 'Anthropic reported a conflict on that request. Try again.',
  unprocessable: 'Anthropic could not process that request. Try saying it a different way.',
  server: 'Anthropic had a problem on their side. Try again in a moment.',
  invalid_response: 'The reply came back in a shape I could not read, so I discarded it.',
  unknown: 'Something went wrong talking to Anthropic. Try again.',
};

/** Failures worth retrying automatically — the `ai_jobs` queue (DESIGN.md §8). */
const RETRYABLE: readonly AiErrorKind[] = ['rate_limit', 'connection', 'timeout', 'server'];

/** Builds an `AiError` of one kind with its standard user-facing sentence. */
export function aiError(
  kind: AiErrorKind,
  options: { message?: string; status?: number | null; cause?: unknown } = {},
): AiError {
  return new AiError({
    kind,
    status: options.status ?? null,
    userMessage: AI_ERROR_MESSAGES[kind],
    retryable: RETRYABLE.includes(kind),
    message: options.message,
    cause: options.cause,
  });
}

/**
 * Maps anything thrown by the SDK onto the typed union. Checked most specific
 * class first, exactly as the SDK's error-handling guidance requires — never by
 * string-matching a message.
 */
export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;

  if (error instanceof APIUserAbortError) {
    return aiError('aborted', { message: error.message, cause: error });
  }
  if (error instanceof APIConnectionTimeoutError) {
    return aiError('timeout', { message: error.message, cause: error });
  }
  if (error instanceof APIConnectionError) {
    return aiError('connection', { message: error.message, cause: error });
  }
  if (error instanceof AuthenticationError) {
    return aiError('auth', { message: error.message, status: 401, cause: error });
  }
  if (error instanceof PermissionDeniedError) {
    return aiError('permission', { message: error.message, status: 403, cause: error });
  }
  if (error instanceof NotFoundError) {
    return aiError('not_found', { message: error.message, status: 404, cause: error });
  }
  if (error instanceof ConflictError) {
    return aiError('conflict', { message: error.message, status: 409, cause: error });
  }
  if (error instanceof UnprocessableEntityError) {
    return aiError('unprocessable', { message: error.message, status: 422, cause: error });
  }
  if (error instanceof RateLimitError) {
    return aiError('rate_limit', { message: error.message, status: 429, cause: error });
  }
  if (error instanceof BadRequestError) {
    return aiError('bad_request', { message: error.message, status: 400, cause: error });
  }
  if (error instanceof InternalServerError) {
    return aiError('server', { message: error.message, status: error.status ?? 500, cause: error });
  }
  if (error instanceof APIError) {
    const status = typeof error.status === 'number' ? error.status : null;
    const kind: AiErrorKind = status != null && status >= 500 ? 'server' : 'unknown';
    return aiError(kind, { message: error.message, status, cause: error });
  }

  const message = error instanceof Error ? error.message : String(error);
  return aiError('unknown', { message, cause: error });
}

// ---------------------------------------------------------------------------
// Refusals — DESIGN.md §6.1 "never crashing"
// ---------------------------------------------------------------------------

/** The line the coach shows when the model declines. */
export const COACH_REFUSAL_MESSAGE =
  'I am not able to answer that one. I can still help with your training, your food log, or how to change today’s plan.';

/**
 * A declined turn. Returned as a value — a refusal is a normal outcome, so no
 * call site has to wrap the coach in a try/catch to survive one.
 */
export interface CoachRefusal {
  type: 'refusal';
  /** `stop_details.category`, e.g. `cyber`, `bio`, or null when unset. */
  category: string | null;
  /** `stop_details.explanation`, when Anthropic supplied one. */
  explanation: string | null;
  /** What to render. Always populated. */
  message: string;
}

/** Builds a refusal from a message's `stop_details` (which may be absent). */
export function toCoachRefusal(
  stopDetails: { category?: string | null; explanation?: string | null } | null | undefined,
): CoachRefusal {
  return {
    type: 'refusal',
    category: stopDetails?.category ?? null,
    explanation: stopDetails?.explanation ?? null,
    message: COACH_REFUSAL_MESSAGE,
  };
}

export function isCoachRefusal(value: unknown): value is CoachRefusal {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'refusal' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}
