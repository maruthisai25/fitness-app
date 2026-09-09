/**
 * Theme-aware color tokens — DESIGN.md §7.5.
 *
 * `@vigor/ui-tokens` exports `darkPalette` and `lightPalette` as plain
 * objects; `index.css` copies their values into CSS variables and switches
 * between them with `prefers-color-scheme`. This module gives components
 * the same ergonomic `palette.xxx` lookup, but resolved through the CSS
 * variable so it repaints with the theme instead of being baked in at
 * render time.
 *
 * Non-color tokens (space, radius, type scale) are not theme-dependent and
 * should still be imported straight from `@vigor/ui-tokens`.
 */
import type { ColorToken } from '@vigor/ui-tokens';

function cssVarName(token: ColorToken): string {
  const kebab = token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return `--vg-color-${kebab}`;
}

const TOKENS: readonly ColorToken[] = [
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

/** `themeColor.accent === "var(--vg-color-accent)"`, theme-aware at paint time. */
export const themeColor: Record<Exclude<ColorToken, 'series'>, string> = Object.fromEntries(
  TOKENS.map((token) => [token, `var(${cssVarName(token)})`]),
) as Record<Exclude<ColorToken, 'series'>, string>;
