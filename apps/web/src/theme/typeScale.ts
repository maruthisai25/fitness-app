import { typeScale } from '@vigor/ui-tokens';

/**
 * A flat `fontSize` lookup on top of `@vigor/ui-tokens`'s role-based
 * `typeScale` (DESIGN.md §7.5). `typeScale` only names `display`, `heading`,
 * `body`, `label`, `numeral` — the two extra in-between sizes web's chrome
 * wants (`title`, `subheading`) and the small `caption` size are this
 * module's own addition, kept close in scale to their neighbours.
 */
export const fontSize = {
  display: typeScale.display.fontSize,
  title: 26,
  heading: typeScale.heading.fontSize,
  subheading: 17,
  body: typeScale.body.fontSize,
  label: typeScale.label.fontSize,
  caption: 11,
} as const;
