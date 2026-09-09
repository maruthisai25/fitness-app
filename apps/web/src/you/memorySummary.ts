/**
 * "What the coach knows" — a deterministic summary built from the same rows
 * the list below renders (DESIGN.md §9 phase 2 brief item 4). No AI call: the
 * count itself is not something that needs a model, and the summary must
 * still be true with no network.
 */

import type { Memory, MemoryDomain, MemoryKind } from '@vigor/core';

import { humanize } from '../lib/display';

const DOMAIN_LABEL: Record<MemoryDomain, string> = {
  training: 'training',
  nutrition: 'nutrition',
  general: 'general',
};

/** Kinds worth calling out by name when there is at least one of them. */
const NOTABLE_KINDS: readonly MemoryKind[] = ['injury', 'constraint', 'dislike'];

export function summarizeMemories(memories: readonly Memory[]): string {
  if (memories.length === 0) {
    return 'The coach is not holding any memories yet. Preferences, constraints and injuries you mention in chat will show up here.';
  }

  const byDomain = new Map<MemoryDomain, number>();
  const byKind = new Map<MemoryKind, number>();
  for (const memory of memories) {
    byDomain.set(memory.domain, (byDomain.get(memory.domain) ?? 0) + 1);
    byKind.set(memory.kind, (byKind.get(memory.kind) ?? 0) + 1);
  }

  const domainParts = [...byDomain.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => `${count} ${DOMAIN_LABEL[domain]}`);

  const notable = NOTABLE_KINDS.map((kind) => [kind, byKind.get(kind) ?? 0] as const).filter(
    ([, count]) => count > 0,
  );

  const memoryWord = memories.length === 1 ? 'memory' : 'memories';
  let sentence = `The coach is holding ${memories.length} ${memoryWord}: ${domainParts.join(', ')}.`;
  if (notable.length > 0) {
    sentence += ` That includes ${notable
      .map(([kind, count]) => `${count} ${humanize(kind).toLowerCase()}${count === 1 ? '' : 's'}`)
      .join(', ')}.`;
  }
  return sentence;
}
