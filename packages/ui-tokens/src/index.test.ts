import { describe, expect, it } from 'vitest';

import {
  contrastRatio,
  contrastText,
  darkPalette,
  isValidHexColor,
  lightPalette,
  palette,
  WCAG_AA_NORMAL_TEXT,
  type Palette,
} from './index.js';

type HexPaletteKey = Exclude<keyof Palette, 'series'>;

const HEX_KEYS: readonly HexPaletteKey[] = [
  'bg',
  'surface',
  'surfaceRaised',
  'border',
  'borderStrong',
  'text',
  'textMuted',
  'textFaint',
  'textOnAccent',
  'accent',
  'accentPressed',
  'accentSoft',
  'good',
  'warn',
  'bad',
  'safety',
];

describe('palette color validity', () => {
  for (const [name, set] of Object.entries(palette)) {
    it(`every ${name} palette scalar color is a valid 6-digit hex`, () => {
      for (const key of HEX_KEYS) {
        expect(isValidHexColor(set[key])).toBe(true);
      }
    });

    it(`every ${name} palette series color is a valid 6-digit hex`, () => {
      for (const color of set.series) {
        expect(isValidHexColor(color)).toBe(true);
      }
    });
  }

  it('rejects non-hex and short/long hex strings', () => {
    expect(isValidHexColor('#FFF')).toBe(false);
    expect(isValidHexColor('FFFFFF')).toBe(false);
    expect(isValidHexColor('#GGGGGG')).toBe(false);
    expect(isValidHexColor('#FFFFFFFF')).toBe(false);
    expect(isValidHexColor('#123abc')).toBe(true);
  });
});

describe('WCAG AA contrast for text-on-ground pairs', () => {
  it.each([['dark', darkPalette] as const, ['light', lightPalette] as const])(
    '%s: text/textMuted on bg/surface, textOnAccent on accent all meet AA',
    (_name, set) => {
      expect(contrastRatio(set.text, set.bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      expect(contrastRatio(set.text, set.surface)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      expect(contrastRatio(set.textMuted, set.bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      expect(contrastRatio(set.textOnAccent, set.accent)).toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL_TEXT,
      );
    },
  );

  it('contrastRatio is symmetric and self-contrast is 1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#000000'),
      10,
    );
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 10);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
});

describe('contrastText', () => {
  it('picks the near-white candidate on a dark ground', () => {
    expect(contrastText(darkPalette.bg)).toBe('#F2EFE6');
  });

  it('picks the near-black candidate on a light ground', () => {
    expect(contrastText(lightPalette.bg)).toBe('#141A16');
  });

  it('the chosen candidate always meets AA against the given background', () => {
    for (const bg of [darkPalette.bg, darkPalette.accent, lightPalette.bg, lightPalette.accent]) {
      const chosen = contrastText(bg);
      expect(contrastRatio(bg, chosen)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    }
  });
});
