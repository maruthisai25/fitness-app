import { describe, expect, it } from 'vitest';

import { SAFETY_KEYWORDS, screenForSafety } from './safety';

describe('screenForSafety', () => {
  it('says nothing for an ordinary message', () => {
    const result = screenForSafety('What should I train today? I have about 40 minutes.');
    expect(result.flagged).toBe(false);
    expect(result.matches).toEqual([]);
    expect(result.kind).toBeNull();
    expect(result.severity).toBe('none');
  });

  it('flags pain and proposes a pain event', () => {
    const result = screenForSafety('My lower back has been in pain since Tuesday.');
    expect(result.flagged).toBe(true);
    expect(result.matches).toContain('pain');
    expect(result.kind).toBe('pain');
    expect(result.severity).toBe('possible');
    expect(result.excerpt).toBe('My lower back has been in pain since Tuesday');
  });

  it('treats dizziness, faintness, chest symptoms and numbness as urgent', () => {
    expect(screenForSafety('I felt dizzy on the last set').severity).toBe('urgent');
    expect(screenForSafety('I nearly fainted after squats').severity).toBe('urgent');
    expect(screenForSafety('Tightness in my chest while rowing').severity).toBe('urgent');
    expect(screenForSafety('My left hand went numb').severity).toBe('urgent');
  });

  it('maps each stem to a safety event kind', () => {
    expect(screenForSafety('I think I injured my shoulder').kind).toBe('injury');
    expect(screenForSafety('felt dizzy').kind).toBe('dizziness');
    expect(screenForSafety('my hand is numb').kind).toBe('symptom');
    expect(screenForSafety('that really hurt').kind).toBe('pain');
  });

  it('does not fire on ordinary gym vocabulary', () => {
    expect(screenForSafety('Can we do chest press and chest flies tomorrow?').flagged).toBe(false);
    expect(screenForSafety('Tomorrow is chest day').flagged).toBe(false);
    expect(screenForSafety('There was a sharp increase in my volume last week').flagged).toBe(false);
  });

  it('still fires when an innocent phrase sits next to a real report', () => {
    const result = screenForSafety('Chest day today, but I have chest pain when I press.');
    expect(result.flagged).toBe(true);
    expect(result.matches).toContain('chest');
    expect(result.severity).toBe('urgent');
  });

  it('only matches at a word boundary, and skips known collisions', () => {
    expect(screenForSafety('I ate a paint chip').flagged).toBe(false);
    expect(screenForSafety('The number of sets was fine').flagged).toBe(false);
    expect(screenForSafety('I sharpened my technique').flagged).toBe(false);
    expect(screenForSafety('Roasted chestnuts after dinner').flagged).toBe(false);
    // The stems are prefixes on purpose, so inflections still match.
    expect(screenForSafety('I injured my wrist').matches).toContain('injur');
    expect(screenForSafety('numbness down my arm').matches).toContain('numb');
  });

  it('handles empty input', () => {
    expect(screenForSafety('').flagged).toBe(false);
    expect(screenForSafety('   ').flagged).toBe(false);
  });

  it('covers every stem DESIGN.md §6.5 lists', () => {
    expect([...SAFETY_KEYWORDS]).toEqual([
      'pain',
      'hurt',
      'injur',
      'dizzy',
      'faint',
      'chest',
      'numb',
      'sharp',
    ]);
  });
});
