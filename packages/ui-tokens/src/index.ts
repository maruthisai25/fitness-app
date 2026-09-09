/**
 * `@vigor/ui-tokens` — one palette and type scale for both shells.
 * DESIGN.md §7.5: athletic and unfussy. Deep green-black grounds with warm
 * off-white text, a single burnt-amber accent for actions and PR moments,
 * semantic green/amber/red reserved for readiness and target states.
 * Tabular numerals everywhere a number sits in a column.
 *
 * Plain TypeScript constants only — no React, no platform APIs. Both a dark
 * set (the primary, DESIGN.md-described look) and a light set are exported;
 * `contrastText` and `contrastRatio` are implemented locally (no library)
 * per the WCAG 2 relative-luminance formula and are exercised against every
 * palette in `index.test.ts`.
 */

export interface Palette {
  /** Page ground. */
  bg: string;
  /** Cards and sheets sitting on the ground. */
  surface: string;
  /** Raised rows inside a surface. */
  surfaceRaised: string;
  /** Hairlines and dividers. */
  border: string;
  borderStrong: string;

  /** Primary text. Never pure white/black. */
  text: string;
  textMuted: string;
  textFaint: string;
  /** Text painted on top of `accent`. */
  textOnAccent: string;

  /** Burnt amber — actions, active tabs, PR moments. Use sparingly. */
  accent: string;
  accentPressed: string;
  accentSoft: string;

  /** Semantic: readiness and target states only (DESIGN.md §7.5). */
  good: string;
  warn: string;
  bad: string;
  /** Safety banner ground (DESIGN.md §6.5). */
  safety: string;

  /** Chart series, in draw order. */
  series: readonly [string, string, string, string, string];
}

/** Deep green-black grounds, warm off-white text — the primary look. */
export const darkPalette: Palette = {
  bg: '#0B1210',
  surface: '#121B18',
  surfaceRaised: '#1A2622',
  border: '#26332E',
  borderStrong: '#3A4A43',

  text: '#F2EFE6',
  textMuted: '#A8B3AD',
  textFaint: '#6E7B75',
  textOnAccent: '#140C05',

  accent: '#C4711F',
  accentPressed: '#A65C14',
  accentSoft: '#3A2611',

  good: '#4E9E60',
  warn: '#D9A441',
  bad: '#C4514A',
  safety: '#3A1512',

  series: ['#C4711F', '#4E9E60', '#5A8CA8', '#B0709E', '#D9A441'],
};

/** Warm off-white grounds, deep green-black text — for a light-mode host. */
export const lightPalette: Palette = {
  bg: '#F5F1E6',
  surface: '#EDE7D6',
  surfaceRaised: '#E3DCC7',
  border: '#D2C8AE',
  borderStrong: '#B3A784',

  text: '#141A16',
  textMuted: '#46524A',
  textFaint: '#63705F',
  textOnAccent: '#FFFBF2',

  accent: '#8A4E15',
  accentPressed: '#6E3D0F',
  accentSoft: '#E7D3B4',

  good: '#2F7A41',
  warn: '#8A5A16',
  bad: '#9C3830',
  safety: '#F6D9D4',

  series: ['#8A4E15', '#2F7A41', '#356E8C', '#8A4E74', '#8A5A16'],
};

export const palette = { dark: darkPalette, light: lightPalette } as const;
export type ThemeName = keyof typeof palette;

/** 4 px base scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/**
 * A condensed grotesk for headings and numerals, a humanist sans for body
 * (DESIGN.md §7.5). Google Fonts choices, recorded here so both apps load
 * the same families:
 * - display/numeral: Archivo Narrow (condensed grotesk)
 * - body/label: Work Sans (humanist sans)
 */
export const fontFamily = {
  display: "'Archivo Narrow', 'Roboto Condensed', 'Helvetica Neue', sans-serif",
  body: "'Work Sans', 'Segoe UI', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace",
} as const;

export const googleFonts = {
  display: { family: 'Archivo Narrow', weights: [500, 600, 700] },
  body: { family: 'Work Sans', weights: [400, 500, 600] },
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Type scale with role names, per DESIGN.md §7.5: `display` and `numeral`
 * use the condensed grotesk (numerals carry tabular figures); `heading` and
 * `body`/`label` follow the usual hierarchy.
 */
export const typeScale = {
  display: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 1.15,
    fontWeight: fontWeight.bold,
  },
  heading: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 1.25,
    fontWeight: fontWeight.semibold,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    lineHeight: 1.45,
    fontWeight: fontWeight.regular,
  },
  label: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 1.3,
    fontWeight: fontWeight.medium,
  },
  numeral: {
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 1.1,
    fontWeight: fontWeight.semibold,
    fontVariantNumeric: 'tabular-nums',
  },
} as const;

export type TypeRole = keyof typeof typeScale;

/**
 * Every number that sits in a column uses tabular figures (DESIGN.md §7.5).
 * Web: apply as CSS `font-variant-numeric`. Mobile: `fontVariant` on `Text`.
 */
export const numeric = {
  css: 'tabular-nums',
  reactNative: ['tabular-nums'],
} as const;

export const duration = {
  fast: 120,
  normal: 200,
  slow: 320,
} as const;

export type ColorToken = keyof Palette;
export type SpaceToken = keyof typeof space;

// ---------------------------------------------------------------------------
// Contrast — WCAG 2 relative luminance, implemented locally (no library).
// ---------------------------------------------------------------------------

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function isValidHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const match = HEX_RE.exec(hex);
  if (!match) throw new Error(`Not a 6-digit hex color: ${hex}`);
  const int = Number.parseInt(match[1]!, 16);
  return [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff];
}

/** sRGB → linear-light, per the WCAG 2 definition. */
function linearize(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(linearize);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2 contrast ratio between two colors, 1 (none) to 21 (max). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA) + 0.05;
  const lB = relativeLuminance(hexB) + 0.05;
  return lA > lB ? lA / lB : lB / lA;
}

/** WCAG AA threshold for normal-weight body text. */
export const WCAG_AA_NORMAL_TEXT = 4.5;
/** WCAG AA threshold for large-scale (≥18pt / ≥14pt bold) text. */
export const WCAG_AA_LARGE_TEXT = 3;

/**
 * Picks whichever of a light or dark text color contrasts more against
 * `bg`, defaulting to each palette's own `text`/`textOnAccent`-style
 * near-white and near-black. Falls back to the light/dark ends of the
 * given palette when one isn't specified, so callers get a sane default
 * even for a background not in either token set.
 */
export function contrastText(
  bg: string,
  candidates: readonly [string, string] = ['#F2EFE6', '#141A16'],
): string {
  const [light, dark] = candidates;
  return contrastRatio(bg, light) >= contrastRatio(bg, dark) ? light : dark;
}
