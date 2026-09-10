/**
 * Colour contrast — WCAG 2.2 AA (1.4.3 Contrast (Minimum), 4.5:1 for
 * normal-weight text) across both `@vigor/ui-tokens` palettes.
 *
 * The palette is picked for hue; `tokens.ts` walks each *text* ink toward the
 * light or dark end until it clears the bar on every ground the app paints on.
 * This test is the proof, and it also records which raw inks needed the walk,
 * so nobody removes the correction thinking it is decoration.
 */
import { darkPalette, lightPalette } from '@vigor/ui-tokens';
import { describe, expect, it } from 'vitest';

import {
  color,
  contrastRatio,
  lightInk,
  readableOn,
  TEXT_GROUNDS,
  TEXT_INKS,
  WCAG_AA_NORMAL_TEXT,
  worstContrast,
} from './tokens';

const THEMES = [
  { name: 'dark', ink: color, raw: darkPalette },
  { name: 'light', ink: lightInk, raw: lightPalette },
] as const;

describe('text contrast', () => {
  for (const theme of THEMES) {
    for (const ground of TEXT_GROUNDS) {
      for (const ink of TEXT_INKS) {
        it(`${theme.name}: ${ink} on ${ground} clears AA`, () => {
          const ratio = contrastRatio(theme.ink[ink], theme.ink[ground]);
          expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
        });
      }
    }
  }

  it('leaves the grounds and the fills exactly as the palette defines them', () => {
    for (const theme of THEMES) {
      for (const ground of TEXT_GROUNDS) {
        expect(theme.ink[ground]).toBe(theme.raw[ground]);
      }
      expect(theme.ink.textOnAccent).toBe(theme.raw.textOnAccent);
      expect(theme.ink.border).toBe(theme.raw.border);
    }
  });

  it('keeps the label on a filled button readable', () => {
    for (const theme of THEMES) {
      // The primary button paints `textOnAccent` on `accent`…
      expect(contrastRatio(theme.ink.textOnAccent, theme.ink.accent)).toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL_TEXT,
      );
      // …and the danger button paints the same ink on `bad`.
      expect(contrastRatio(theme.ink.textOnAccent, theme.ink.bad)).toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL_TEXT,
      );
    }
  });

  it('only changes the inks that actually failed', () => {
    type Ink = (typeof TEXT_INKS)[number];
    const changed = (theme: (typeof THEMES)[number]): Ink[] =>
      TEXT_INKS.filter((ink) => theme.ink[ink] !== theme.raw[ink]);

    // If the palette is ever fixed upstream these lists shrink; what must not
    // happen is an ink changing while its raw value already cleared the bar.
    for (const theme of THEMES) {
      const grounds = TEXT_GROUNDS.map((ground) => theme.raw[ground]);
      for (const ink of changed(theme)) {
        expect(worstContrast(theme.raw[ink], grounds)).toBeLessThan(WCAG_AA_NORMAL_TEXT);
      }
      for (const ink of TEXT_INKS.filter((entry) => !changed(theme).includes(entry))) {
        expect(worstContrast(theme.raw[ink], grounds)).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL_TEXT,
        );
      }
    }

    // The dark palette is the one the app ships; these four are the failures
    // the correction exists for — the faint ink and the "bad" red fail on
    // every ground, burnt amber and the "good" green only on the selected-chip
    // ground, which is the lightest thing in the dark theme.
    expect(changed(THEMES[0])).toEqual(['textFaint', 'accent', 'good', 'bad']);
  });
});

describe('readableOn', () => {
  it('returns the ink untouched when it already clears the bar', () => {
    expect(readableOn(darkPalette.text, [darkPalette.bg])).toBe(darkPalette.text);
  });

  it('lightens on a dark ground and darkens on a light one', () => {
    const onDark = readableOn(darkPalette.bad, [darkPalette.surfaceRaised]);
    const onLight = readableOn(lightPalette.good, [lightPalette.surfaceRaised]);
    expect(contrastRatio(onDark, darkPalette.surfaceRaised)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
    expect(contrastRatio(onLight, lightPalette.surfaceRaised)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
    expect(onDark).not.toBe(darkPalette.bad);
    expect(onLight).not.toBe(lightPalette.good);
  });

  it('is deterministic, so the shipped colours never drift between builds', () => {
    expect(readableOn(darkPalette.accent, TEXT_GROUNDS.map((g) => darkPalette[g]))).toBe(
      color.accent,
    );
  });
});
