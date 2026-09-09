/**
 * Safety keyword pre-filter — DESIGN.md §6.5.
 *
 * "A local keyword pre-filter (pain, hurt, injur, dizzy, faint, chest, numb,
 * sharp) plus the `report_safety` tool."
 *
 * The filter runs locally on every user message before the request is sent, so
 * a pain report is noticed even when the device is offline. It never writes
 * anything on its own: it raises a suggestion, and either the coach's
 * `report_safety` tool or the user's own confirmation creates the
 * `safety_events` row. Being deliberately blunt, it is paired with a short list
 * of gym phrases that use the same words innocently ("chest press", "sharp
 * increase"), so "chest day" does not open a safety event.
 */

import type { SafetyEventKind } from '@vigor/core';

/** The stems from DESIGN.md §6.5, in the order the design lists them. */
export const SAFETY_KEYWORDS = [
  'pain',
  'hurt',
  'injur',
  'dizzy',
  'faint',
  'chest',
  'numb',
  'sharp',
] as const;

export type SafetyKeyword = (typeof SAFETY_KEYWORDS)[number];

/** Which `safety_events.kind` each stem implies (DESIGN.md §4.1). */
export const SAFETY_KEYWORD_KIND: Record<SafetyKeyword, SafetyEventKind> = {
  pain: 'pain',
  hurt: 'pain',
  injur: 'injury',
  dizzy: 'dizziness',
  faint: 'dizziness',
  chest: 'symptom',
  numb: 'symptom',
  sharp: 'pain',
};

/**
 * Phrases where a keyword is ordinary gym or progress vocabulary. A keyword
 * that only ever appears inside one of these is not a match.
 */
export const SAFETY_FALSE_POSITIVE_PHRASES: readonly string[] = [
  'chest press',
  'chest fly',
  'chest flies',
  'chest day',
  'chest supported',
  'chest workout',
  'chest exercise',
  'chest and back',
  'upper chest',
  'lower chest',
  'sharp increase',
  'sharp drop',
  'sharpen',
  'no pain no gain',
  'growing pains',
];

/**
 * Whole words that begin with a stem but have nothing to do with safety. The
 * stems are prefixes on purpose — `injur` has to catch "injured" and "injury" —
 * so the collisions have to be listed rather than avoided.
 */
export const SAFETY_STEM_EXCLUSIONS: Record<SafetyKeyword, readonly string[]> = {
  pain: ['paint', 'painted', 'painting', 'painter', 'painters', 'paints'],
  hurt: ['hurtle', 'hurtled', 'hurtles', 'hurtling'],
  injur: [],
  dizzy: [],
  faint: ['faintest'],
  chest: ['chestnut', 'chestnuts'],
  numb: ['number', 'numbers', 'numbered', 'numbering'],
  sharp: ['sharpen', 'sharpened', 'sharpening', 'sharpener', 'sharpie'],
};

/** How severe the match looks, so the UI knows whether to interrupt. */
export type SafetySeverity = 'none' | 'possible' | 'urgent';

/** Stems that mean "stop and see someone", not "my quads are sore". */
const URGENT: readonly SafetyKeyword[] = ['dizzy', 'faint', 'chest', 'numb'];

export interface SafetyScreenResult {
  /** True when at least one keyword survived the false-positive filter. */
  flagged: boolean;
  /** The stems that matched, in DESIGN.md order. */
  matches: SafetyKeyword[];
  /** The `safety_events.kind` to propose, or null when nothing matched. */
  kind: SafetyEventKind | null;
  severity: SafetySeverity;
  /** The sentence the keyword appeared in, trimmed — evidence for the event row. */
  excerpt: string;
}

const EMPTY: SafetyScreenResult = {
  flagged: false,
  matches: [],
  kind: null,
  severity: 'none',
  excerpt: '',
};

/** The whole word starting at `at`, lowercase. */
function wordAt(haystack: string, at: number): string {
  let end = at;
  while (end < haystack.length && /[a-z0-9']/.test(haystack[end])) end += 1;
  return haystack.slice(at, end);
}

/**
 * Word-ish boundary: a stem counts when it starts a word, and the word it
 * starts is not a listed collision.
 */
function matchIndexes(haystack: string, stem: SafetyKeyword): number[] {
  const excluded = SAFETY_STEM_EXCLUSIONS[stem];
  const found: number[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(stem, from);
    if (at === -1) break;
    const before = at === 0 ? ' ' : haystack[at - 1];
    if (!/[a-z0-9]/.test(before) && !excluded.includes(wordAt(haystack, at))) found.push(at);
    from = at + stem.length;
  }
  return found;
}

/** True when every occurrence of the stem sits inside an innocent phrase. */
function allOccurrencesAreInnocent(text: string, stem: string, positions: readonly number[]): boolean {
  const spans: [number, number][] = [];
  for (const phrase of SAFETY_FALSE_POSITIVE_PHRASES) {
    if (!phrase.includes(stem)) continue;
    let from = 0;
    for (;;) {
      const at = text.indexOf(phrase, from);
      if (at === -1) break;
      spans.push([at, at + phrase.length]);
      from = at + phrase.length;
    }
  }
  if (spans.length === 0) return false;
  return positions.every((position) =>
    spans.some(([start, end]) => position >= start && position < end),
  );
}

/** The sentence around a character offset, trimmed to something quotable. */
function sentenceAt(original: string, offset: number): string {
  const boundaries = /[.!?\n]/;
  let start = offset;
  while (start > 0 && !boundaries.test(original[start - 1])) start -= 1;
  let end = offset;
  while (end < original.length && !boundaries.test(original[end])) end += 1;
  return original.slice(start, end).trim();
}

/**
 * Screens one user message. Pure and synchronous — safe to run on every
 * keystroke-committed message before the request leaves the device.
 */
export function screenForSafety(text: string): SafetyScreenResult {
  if (typeof text !== 'string' || text.trim().length === 0) return { ...EMPTY };

  const lower = text.toLowerCase();
  const matches: SafetyKeyword[] = [];
  let firstOffset = -1;

  for (const stem of SAFETY_KEYWORDS) {
    const positions = matchIndexes(lower, stem);
    if (positions.length === 0) continue;
    if (allOccurrencesAreInnocent(lower, stem, positions)) continue;
    matches.push(stem);
    if (firstOffset === -1 || positions[0] < firstOffset) firstOffset = positions[0];
  }

  if (matches.length === 0) return { ...EMPTY };

  const urgent = matches.some((stem) => URGENT.includes(stem));
  // `injur` beats a generic ache; an urgent stem beats everything.
  const leading =
    matches.find((stem) => URGENT.includes(stem)) ??
    matches.find((stem) => stem === 'injur') ??
    matches[0];

  return {
    flagged: true,
    matches,
    kind: SAFETY_KEYWORD_KIND[leading],
    severity: urgent ? 'urgent' : 'possible',
    excerpt: sentenceAt(text, Math.max(0, firstOffset)),
  };
}

/**
 * The line the coach adds to its own turn when the pre-filter fires. Shown to
 * the user, so it is written plainly and never diagnoses anything.
 */
export const SAFETY_PREFILTER_NOTE =
  'That sounded like it might be pain or a symptom rather than normal training fatigue. ' +
  'I am going to hold your loads and log a safety note. If it is sharp, spreading, or in your chest, ' +
  'please stop training and speak to a doctor or physio — I am not able to assess that.';
