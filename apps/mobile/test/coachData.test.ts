/**
 * Pure logic behind the coach chat and the memories screen, tested without
 * rendering — DESIGN.md §10.
 */
import { describe, expect, it } from 'vitest';

import { buildTurnItems, rationaleFromToolResult } from '../src/coach/coachData';
import { filterMemories, groupMemories, summarizeMemories } from '../src/memories/memoriesData';

describe('buildTurnItems', () => {
  it('pairs a tool_use with its tool_result and keeps the visible text', () => {
    const messages = [
      { id: 'm1', role: 'user', content: [{ type: 'text', text: 'What should I do today?' }] },
      {
        id: 'm2',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 'call_1', name: 'get_workouts', input: { from: '2026-09-01', to: '2026-09-10' } },
        ],
      },
      {
        id: 'm3',
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"ok":true}' }],
      },
      { id: 'm4', role: 'assistant', content: [{ type: 'text', text: 'Squat day.' }] },
    ];

    const items = buildTurnItems(messages);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ kind: 'user', text: 'What should I do today?' });
    expect(items[1]).toMatchObject({ kind: 'assistant', text: 'Let me check.' });
    expect(items[1].kind === 'assistant' && items[1].tools).toEqual([
      { toolUseId: 'call_1', name: 'get_workouts', input: { from: '2026-09-01', to: '2026-09-10' }, ok: true, resultText: '{"ok":true}' },
    ]);
    expect(items[2]).toMatchObject({ kind: 'assistant', text: 'Squat day.' });
  });

  it('never renders a tool_result row as its own user bubble', () => {
    const messages = [
      {
        id: 'm1',
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'call_1', name: 'remember', input: {} }],
      },
      {
        id: 'm2',
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"ok":true}' }],
      },
    ];

    const items = buildTurnItems(messages);

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('assistant');
  });

  it('skips a message with no visible text and no tools', () => {
    const messages = [{ id: 'm1', role: 'user', content: [{ type: 'text', text: '   ' }] }];
    expect(buildTurnItems(messages)).toHaveLength(0);
  });
});

describe('rationaleFromToolResult', () => {
  it('extracts the Rationale from an ok propose_workout result', () => {
    const rationale = { codes: ['PROGRESS_LOAD'], facts: {}, summary: 'The bar goes up.' };
    const result = JSON.stringify({ ok: true, rationale });
    expect(rationaleFromToolResult('propose_workout', result)).toEqual(rationale);
  });

  it('returns null for tools that never carry a rationale', () => {
    const result = JSON.stringify({ ok: true, rationale: { codes: [], facts: {}, summary: 'x' } });
    expect(rationaleFromToolResult('get_workouts', result)).toBeNull();
  });

  it('returns null for a failed tool call', () => {
    const result = JSON.stringify({ ok: false, error: 'nope' });
    expect(rationaleFromToolResult('propose_workout', result)).toBeNull();
  });

  it('returns null for unparseable content', () => {
    expect(rationaleFromToolResult('propose_workout', 'not json')).toBeNull();
    expect(rationaleFromToolResult('propose_workout', null)).toBeNull();
  });
});

describe('memoriesData', () => {
  const memories = [
    { id: '1', kind: 'preference' as const, domain: 'training' as const, text: 'Likes evening sessions', source: 'user' as const, confidence: 1, evidence: [], active: true, createdAt: '', updatedAt: '', expiresAt: null },
    { id: '2', kind: 'preference' as const, domain: 'nutrition' as const, text: 'Prefers Indian food', source: 'coach' as const, confidence: 0.8, evidence: [], active: true, createdAt: '', updatedAt: '', expiresAt: null },
    { id: '3', kind: 'injury' as const, domain: 'training' as const, text: 'Bad left knee', source: 'coach' as const, confidence: 0.9, evidence: [], active: false, createdAt: '', updatedAt: '', expiresAt: null },
  ];

  it('groups by kind and domain, with injuries first', () => {
    const groups = groupMemories(memories);
    expect(groups[0]).toMatchObject({ kind: 'injury', domain: 'training' });
    expect(groups.map((group) => group.memories.length)).toEqual([1, 1, 1]);
  });

  it('filters by a case-insensitive substring', () => {
    expect(filterMemories(memories, 'indian')).toHaveLength(1);
    expect(filterMemories(memories, 'nothing matches')).toHaveLength(0);
    expect(filterMemories(memories, '')).toHaveLength(3);
  });

  it('summarizes only the active rows', () => {
    expect(summarizeMemories(memories)).toContain('2 active memories');
    expect(summarizeMemories([])).toContain('has not remembered');
  });
});
