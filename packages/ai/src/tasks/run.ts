/**
 * The shared shape of every prompt task outside chat — DESIGN.md §6.4.
 *
 * Each task is one request with `output_config.format` set from a zod schema,
 * so the model answers with JSON that matches the schema the app already uses.
 * The reply is still validated locally before anything touches the database:
 * structured output is a strong constraint, not a guarantee, and DESIGN.md §11
 * asks for zod at every boundary.
 */

import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaTextBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { TokenUsage } from '@vigor/core';
import type { z } from 'zod';

import { refusalOf, textOf, usageOf, type AiClient, type AiRequestKind } from '../client';
import { aiError, type CoachRefusal } from '../errors';

export interface StructuredTaskOptions<Schema extends z.ZodType> {
  client: AiClient;
  /** `parse` for extraction on the fast model, `task` for generation on the coach model. */
  kind: AiRequestKind;
  schema: Schema;
  /** Instructions. A string becomes one block; pass blocks to add cache control. */
  system: string | BetaTextBlockParam[];
  /** The single user turn. */
  user: string;
  /** Overrides the model the kind implies. */
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface StructuredTaskResult<T> {
  /** Null only when the model refused. */
  data: T | null;
  refusal: CoachRefusal | null;
  usage: TokenUsage;
  /** The model that actually answered — may differ when a fallback ran. */
  model: string;
  /** The raw text, kept so a failure is debuggable without a second call. */
  raw: string;
}

/**
 * Runs one structured request and validates the answer. Throws
 * `AiError('invalid_response')` when the reply is not the schema's shape.
 */
export async function runStructuredTask<Schema extends z.ZodType>(
  options: StructuredTaskOptions<Schema>,
): Promise<StructuredTaskResult<z.infer<Schema>>> {
  const base = options.client.requestBase(options.kind, {
    ...(options.model == null ? {} : { model: options.model }),
    ...(options.maxTokens == null ? {} : { maxTokens: options.maxTokens }),
  });

  const message = await options.client.messages.create(
    {
      ...base,
      output_config: { ...base.output_config, format: betaZodOutputFormat(options.schema) },
      system: typeof options.system === 'string' ? [{ type: 'text', text: options.system }] : options.system,
      messages: [{ role: 'user', content: options.user }],
    },
    options.signal == null ? undefined : { signal: options.signal },
  );

  const usage = usageOf(message);
  const raw = textOf(message);
  const refusal = refusalOf(message);
  if (refusal != null) {
    return { data: null, refusal, usage, model: message.model, raw };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw aiError('invalid_response', {
      message: `Structured reply was not JSON: ${raw.slice(0, 200)}`,
      cause: error,
    });
  }

  const parsed = options.schema.safeParse(json);
  if (!parsed.success) {
    throw aiError('invalid_response', {
      message: `Structured reply failed validation: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
      cause: parsed.error,
    });
  }

  return { data: parsed.data as z.infer<Schema>, refusal: null, usage, model: message.model, raw };
}

/** A compact, deterministic rendering of task input. Keeps prompts diff-able. */
export function describeList(label: string, lines: readonly string[]): string {
  return lines.length === 0 ? `${label}: none` : `${label}:\n${lines.map((line) => `- ${line}`).join('\n')}`;
}
