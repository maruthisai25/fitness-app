/**
 * Adapts `@vigor/ui-tokens`'s palette/type-scale shape to the flat
 * `color`/`fontSize` names this app's components use, in one place — so a
 * token-package shape change only needs a fix here, not in every screen.
 *
 * `app.json` pins `userInterfaceStyle: "dark"` (DESIGN.md §7.5's primary
 * look), so `color` is always `darkPalette`.
 */
import { darkPalette, typeScale } from '@vigor/ui-tokens';

export { fontWeight, radius, space, duration } from '@vigor/ui-tokens';
export type { Palette } from '@vigor/ui-tokens';

export const color = darkPalette;

export const fontSize = {
  display: typeScale.display.fontSize,
  heading: typeScale.heading.fontSize,
  body: typeScale.body.fontSize,
  label: typeScale.label.fontSize,
  /** No dedicated "caption" role upstream; smaller than `label`. */
  caption: 11,
  numeral: typeScale.numeral.fontSize,
} as const;
