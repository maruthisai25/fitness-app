import {
  APIConnectionError,
  AuthenticationError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import {
  buildRequestBase,
  createClient,
  DEFAULT_MODEL_SETTINGS,
  modelAcceptsThinking,
  modelSupportsServerSideFallback,
  refusalOf,
  resolveModelSettings,
  SERVER_SIDE_FALLBACK_BETA,
  usageOf,
} from './client';
import { AiError, toAiError } from './errors';
import { fakeMessage, refusalTurn } from './testing';

function headers(): Headers {
  return new Headers();
}

describe('model settings', () => {
  it('falls back to the DESIGN.md §6.1 defaults', () => {
    expect(resolveModelSettings()).toEqual(DEFAULT_MODEL_SETTINGS);
    expect(resolveModelSettings({ coachModel: '   ' }).coachModel).toBe('claude-opus-5');
    expect(resolveModelSettings({ fastModel: 'claude-haiku-9' }).fastModel).toBe('claude-haiku-9');
  });

  it('knows which models take a thinking parameter', () => {
    expect(modelAcceptsThinking('claude-opus-5')).toBe(true);
    expect(modelAcceptsThinking('claude-haiku-4-5')).toBe(false);
    expect(modelSupportsServerSideFallback('claude-opus-5')).toBe(true);
    expect(modelSupportsServerSideFallback('claude-haiku-4-5')).toBe(false);
  });
});

describe('buildRequestBase', () => {
  const settings = resolveModelSettings();

  it('uses adaptive thinking and medium effort for chat on the coach model', () => {
    const base = buildRequestBase('chat', settings);
    expect(base.model).toBe('claude-opus-5');
    expect(base.thinking).toEqual({ type: 'adaptive' });
    expect(base.output_config).toEqual({ effort: 'medium' });
  });

  it('omits thinking and drops to low effort for parsing on the fast model', () => {
    const base = buildRequestBase('parse', settings);
    expect(base.model).toBe('claude-haiku-4-5');
    expect(base.thinking).toBeUndefined();
    expect(base.output_config).toEqual({ effort: 'low' });
  });

  it('enables the server-side fallback beta on Opus only', () => {
    const chat = buildRequestBase('chat', settings);
    expect(chat.betas).toEqual([SERVER_SIDE_FALLBACK_BETA]);
    expect(chat.fallbacks).toBe('default');

    const parse = buildRequestBase('parse', settings);
    expect(parse.betas).toBeUndefined();
    expect(parse.fallbacks).toBeUndefined();
  });

  it('lets the settings flag turn the fallback off', () => {
    const base = buildRequestBase('chat', { ...settings, serverSideFallback: false });
    expect(base.betas).toBeUndefined();
    expect(base.fallbacks).toBeUndefined();
  });

  it('honours a model override without losing the kind\'s effort', () => {
    const base = buildRequestBase('parse', settings, { model: 'claude-opus-5', maxTokens: 512 });
    expect(base.model).toBe('claude-opus-5');
    expect(base.max_tokens).toBe(512);
    expect(base.output_config.effort).toBe('low');
    expect(base.thinking).toEqual({ type: 'adaptive' });
  });
});

describe('createClient', () => {
  it('refuses to build a client without a key', () => {
    expect(() => createClient({ apiKey: '   ' })).toThrowError(AiError);
    try {
      createClient({ apiKey: '' });
    } catch (error) {
      expect((error as AiError).kind).toBe('auth');
      expect((error as AiError).userMessage).toContain('You → API key');
    }
  });

  it('builds a usable client with the resolved settings', () => {
    const client = createClient({
      apiKey: 'sk-test-not-a-real-key',
      dangerouslyAllowBrowser: true,
      models: { fastModel: 'claude-haiku-4-5', serverSideFallback: false },
    });
    expect(client.settings.coachModel).toBe('claude-opus-5');
    expect(client.requestBase('chat').fallbacks).toBeUndefined();
  });
});

describe('toAiError', () => {
  it('maps the SDK classes onto the typed union with a user-facing message', () => {
    const rateLimit = toAiError(new RateLimitError(429, undefined, 'slow down', headers()));
    expect(rateLimit.kind).toBe('rate_limit');
    expect(rateLimit.retryable).toBe(true);
    expect(rateLimit.userMessage).toContain('rate-limiting');

    const auth = toAiError(new AuthenticationError(401, undefined, 'bad key', headers()));
    expect(auth.kind).toBe('auth');
    expect(auth.retryable).toBe(false);

    const connection = toAiError(new APIConnectionError({ message: 'offline' }));
    expect(connection.kind).toBe('connection');
    expect(connection.retryable).toBe(true);
    expect(connection.userMessage).toContain('api.anthropic.com');
  });

  it('passes an AiError straight through and wraps anything else', () => {
    const original = toAiError(new Error('boom'));
    expect(original.kind).toBe('unknown');
    expect(toAiError(original)).toBe(original);
  });

  it('never leaks the request into the user-facing message', () => {
    const error = toAiError(new AuthenticationError(401, undefined, 'sk-secret-leaked', headers()));
    expect(error.userMessage).not.toContain('sk-secret');
  });
});

describe('response helpers', () => {
  it('returns a typed refusal instead of throwing', () => {
    const refusal = refusalOf(fakeMessage(refusalTurn('cyber', 'Not this one.')));
    expect(refusal).not.toBeNull();
    expect(refusal?.category).toBe('cyber');
    expect(refusal?.explanation).toBe('Not this one.');
    expect(refusal?.message.length).toBeGreaterThan(10);
  });

  it('reports no refusal on a normal turn', () => {
    expect(refusalOf(fakeMessage({ text: 'All good.' }))).toBeNull();
  });

  it('maps usage onto the messages.usage column shape', () => {
    const usage = usageOf(fakeMessage({ text: 'hi', usage: { input: 12, output: 3, cacheRead: 900 } }));
    expect(usage).toEqual({
      inputTokens: 12,
      outputTokens: 3,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 900,
    });
  });
});
