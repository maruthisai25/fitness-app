/**
 * Adapts `@vigor/ui-tokens`'s palette/type-scale shape to the flat
 * `color`/`fontSize` names this app's components use, in one place — so a
 * token-package shape change only needs a fix here, not in every screen.
 *
 * `app.json` pins `userInterfaceStyle: "dark"` (DESIGN.md §7.5's primary
 * look), so `color` is the dark palette. `lightInk` is derived the same way
 * and exists so the accessibility test can prove both palettes clear WCAG AA,
 * and so a future light-mode host has a ready set.
 *
 * ## Readable ink (WCAG AA)
 *
 * The palette's semantic colours are picked for *hue*, and several of them do
 * not clear WCAG AA 1.4.3 (4.5:1 for normal-weight text) on every ground this
 * app paints them on — burnt amber on the raised surface is 4.26:1, the faint
 * ink is 3.5:1, the "bad" red is 3.4:1. Rather than duplicate the palette with
 * hand-picked hex values, each text ink is walked toward the light or dark end
 * — same hue, minimum change — until `contrastRatio` says it clears the bar on
 * every ground. The result is deterministic, so the values below are stable
 * across builds, and the test asserts the whole matrix.
 *
 * Colours used as *fills* (the accent behind a button, the red behind the
 * danger button) keep the raw palette value; what changes there is the label
 * painted on top.
 */
import {
  contrastRatio,
  darkPalette,
  lightPalette,
  relativeLuminance,
  typeScale,
  WCAG_AA_NORMAL_TEXT,
  type Palette,
} from '@vigor/ui-tokens';

export { fontWeight, radius, space, duration } from '@vigor/ui-tokens';
export type { Palette } from '@vigor/ui-tokens';
export { WCAG_AA_LARGE_TEXT, WCAG_AA_NORMAL_TEXT, contrastRatio } from '@vigor/ui-tokens';

/**
 * Every ground this app paints text on. Keep it in sync with the
 * `backgroundColor` values used across `src/ui`, `src/session` and the
 * screens — the accessibility test walks this list.
 */
export const TEXT_GROUNDS = ['bg', 'surface', 'surfaceRaised', 'accentSoft', 'safety'] as const;
export type TextGround = (typeof TEXT_GROUNDS)[number];

/** Inks that are read as text and therefore have to clear AA. */
export const TEXT_INKS = [
  'text',
  'textMuted',
  'textFaint',
  'accent',
  'good',
  'warn',
  'bad',
] as const;
export type TextInk = (typeof TEXT_INKS)[number];

const HEX = /^#([0-9a-fA-F]{6})$/;

function toChannels(hex: string): [number, number, number] {
  const match = HEX.exec(hex);
  if (!match) throw new Error(`Not a 6-digit hex color: ${hex}`);
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toHex(channels: readonly [number, number, number]): string {
  return `#${channels.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

/** Straight sRGB blend — enough to keep the hue while moving the value. */
function blend(hex: string, toward: readonly [number, number, number], amount: number): string {
  const [r, g, b] = toChannels(hex);
  return toHex([
    r + (toward[0] - r) * amount,
    g + (toward[1] - g) * amount,
    b + (toward[2] - b) * amount,
  ]);
}

const WHITE: readonly [number, number, number] = [255, 255, 255];
const BLACK: readonly [number, number, number] = [0, 0, 0];

/** The worst contrast this ink has against any of the grounds. */
export function worstContrast(ink: string, grounds: readonly string[]): number {
  return grounds.reduce((worst, ground) => Math.min(worst, contrastRatio(ink, ground)), Infinity);
}

/**
 * Walks `ink` toward white (on dark grounds) or black (on light grounds) in
 * 2 % steps until it clears `minimum` against *every* ground. Returns the ink
 * unchanged when it already clears the bar, and the extreme when even that
 * cannot (which cannot happen for the palettes shipped here — the test proves
 * it).
 */
export function readableOn(
  ink: string,
  grounds: readonly string[],
  minimum: number = WCAG_AA_NORMAL_TEXT,
): string {
  if (grounds.length === 0) return ink;
  const groundsAreDark =
    grounds.reduce((sum, ground) => sum + relativeLuminance(ground), 0) / grounds.length < 0.18;
  const toward = groundsAreDark ? WHITE : BLACK;

  for (let step = 0; step <= 50; step += 1) {
    const candidate = step === 0 ? ink : blend(ink, toward, step * 0.02);
    if (worstContrast(candidate, grounds) >= minimum) return candidate;
  }
  return toHex(toward);
}

/**
 * A palette whose text inks are guaranteed to clear AA on every app ground.
 * Fills (`bg`, `surface`, `accent` behind a button) are untouched.
 */
export function readableInk(palette: Palette): Palette {
  const grounds = TEXT_GROUNDS.map((ground) => palette[ground]);
  const corrected = { ...palette };
  for (const ink of TEXT_INKS) {
    corrected[ink] = readableOn(palette[ink], grounds);
  }
  return corrected;
}

/** The primary (dark) look every mobile screen renders against. */
export const color: Palette = readableInk(darkPalette);

/** The same correction over the light palette — asserted by the a11y test. */
export const lightInk: Palette = readableInk(lightPalette);

export const fontSize = {
  display: typeScale.display.fontSize,
  heading: typeScale.heading.fontSize,
  body: typeScale.body.fontSize,
  label: typeScale.label.fontSize,
  /** No dedicated "caption" role upstream; smaller than `label`. */
  caption: 11,
  numeral: typeScale.numeral.fontSize,
} as const;

/**
 * The minimum touch target both platforms ask for (iOS HIG 44 pt, Material
 * 48 dp — 44 satisfies the stricter reading of WCAG 2.5.5 for mobile).
 * Anything smaller on screen gets `hitSlop` up to this size instead.
 */
export const HIT_TARGET = 44;

/**
 * `hitSlop` for a compact text action ("Edit", "Skip rest", "Forget") whose
 * ink is only a line tall. 12 pt on every side takes a ~20 pt row past 44.
 */
export const TEXT_ACTION_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;

/**
 * Dynamic type is honoured everywhere, but a figure that sits in a column
 * cannot grow without pushing its neighbour off screen, so numerals cap their
 * scaling. Body copy is never capped.
 */
export const MAX_NUMERAL_FONT_SCALE = 1.6;
/** Tighter still where two numbers share one row (set targets, stat tiles). */
export const MAX_COMPACT_FONT_SCALE = 1.3;
