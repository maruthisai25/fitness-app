/**
 * Rationale helpers — DESIGN.md §5, principle §2.3.
 *
 * Every engine returns `{ result, rationale }`. The summary sentence is
 * template-generated so a recommendation can always answer "Why?" offline.
 */

import type { Rationale } from './types';
import { roundTo } from './units';

export function makeRationale(
  codes: readonly string[],
  facts: Record<string, unknown>,
  summary: string,
): Rationale {
  return { codes: [...codes], facts, summary };
}

/** Appends reason codes without mutating the original. */
export function withCodes(rationale: Rationale, ...codes: string[]): Rationale {
  const merged = [...rationale.codes];
  for (const code of codes) {
    if (!merged.includes(code)) merged.push(code);
  }
  return { ...rationale, codes: merged };
}

/** Merges facts into a rationale without mutating the original. */
export function withFacts(rationale: Rationale, facts: Record<string, unknown>): Rationale {
  return { ...rationale, facts: { ...rationale.facts, ...facts } };
}

/** Folds several engine rationales into one, keeping every code and fact. */
export function mergeRationales(summary: string, ...parts: readonly Rationale[]): Rationale {
  const codes: string[] = [];
  let facts: Record<string, unknown> = {};
  for (const part of parts) {
    for (const code of part.codes) {
      if (!codes.includes(code)) codes.push(code);
    }
    facts = { ...facts, ...part.facts };
  }
  return { codes, facts, summary };
}

/** Rounds a number for display inside `facts`, leaving other values untouched. */
export function fact(value: number | null | undefined, decimals = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return roundTo(value, decimals);
}

/** `"12/12/12"` — the shorthand engines use in summaries. */
export function formatReps(reps: readonly number[]): string {
  return reps.join('/');
}

/** `"three"` for small counts, digits above ten — keeps summaries readable. */
const SMALL_NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
] as const;

export function countWord(value: number): string {
  return Number.isInteger(value) && value >= 0 && value <= 10
    ? SMALL_NUMBER_WORDS[value]
    : String(value);
}

/** `"1 set"` / `"3 sets"`. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
