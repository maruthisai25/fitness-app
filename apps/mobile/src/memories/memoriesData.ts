/**
 * You → Memories' data shaping, free of React — DESIGN.md §8: "every memory
 * row is visible, editable and deletable".
 */
import type { Memory, MemoryDomain, MemoryKind } from '@vigor/core';

export interface MemoryGroup {
  kind: MemoryKind;
  domain: MemoryDomain;
  memories: Memory[];
}

const KIND_ORDER: readonly MemoryKind[] = [
  'injury',
  'constraint',
  'preference',
  'dislike',
  'behavior',
  'goal_note',
  'fact',
];

/** Grouped by kind then domain, kind ordered so safety-relevant rows lead. */
export function groupMemories(memories: readonly Memory[]): MemoryGroup[] {
  const map = new Map<string, MemoryGroup>();
  for (const memory of memories) {
    const key = `${memory.kind}:${memory.domain}`;
    const existing = map.get(key);
    if (existing) existing.memories.push(memory);
    else map.set(key, { kind: memory.kind, domain: memory.domain, memories: [memory] });
  }
  return [...map.values()].sort((a, b) => {
    const kindDiff = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    return kindDiff !== 0 ? kindDiff : a.domain.localeCompare(b.domain);
  });
}

/** A plain substring search over the memory text — good enough for a personal list. */
export function filterMemories(memories: readonly Memory[], query: string): Memory[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...memories];
  return memories.filter((memory) => memory.text.toLowerCase().includes(needle));
}

const KIND_LABEL: Record<MemoryKind, string> = {
  preference: 'Preference',
  dislike: 'Dislike',
  constraint: 'Constraint',
  injury: 'Injury',
  behavior: 'Behaviour',
  fact: 'Fact',
  goal_note: 'Goal note',
};

const DOMAIN_LABEL: Record<MemoryDomain, string> = {
  training: 'Training',
  nutrition: 'Nutrition',
  general: 'General',
};

export function memoryKindLabel(kind: MemoryKind): string {
  return KIND_LABEL[kind];
}

export function memoryDomainLabel(domain: MemoryDomain): string {
  return DOMAIN_LABEL[domain];
}

/** "What the coach knows" — a one-paragraph summary built from the same rows. */
export function summarizeMemories(memories: readonly Memory[]): string {
  const active = memories.filter((memory) => memory.active);
  if (active.length === 0) {
    return 'The coach has not remembered anything about you yet — it will, as you talk and train.';
  }
  const byDomain = new Map<MemoryDomain, number>();
  for (const memory of active) byDomain.set(memory.domain, (byDomain.get(memory.domain) ?? 0) + 1);
  const parts = [...byDomain.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => `${count} ${DOMAIN_LABEL[domain].toLowerCase()}`);
  const noun = active.length === 1 ? 'memory' : 'memories';
  return `The coach is holding ${active.length} active ${noun} — ${parts.join(', ')}.`;
}
