/**
 * Shared inline styles for the three PWA surfaces (install banner, update
 * toast, offline indicator). They are the only chrome that floats above the
 * app, so they share one card treatment and one button pair.
 *
 * Colours resolve through the CSS variables in `index.css`, which repaint with
 * the theme (see `src/theme/cssVars.ts`); spacing, radius and the type scale
 * come straight from `@vigor/ui-tokens` (DESIGN.md §7.5).
 */
import { radius, space, typeScale } from '@vigor/ui-tokens';
import type { CSSProperties } from 'react';

import { themeColor } from '../theme/cssVars';

/** Above the app, below nothing. One value so the three surfaces cannot fight. */
export const PWA_LAYER_Z_INDEX = 1000;

/** Fixed stack in the bottom corner; `pointer-events` re-enabled per card. */
export const dockStyle: CSSProperties = {
  position: 'fixed',
  insetInlineStart: space.lg,
  insetInlineEnd: space.lg,
  insetBlockEnd: `calc(${space.lg}px + env(safe-area-inset-bottom, 0px))`,
  zIndex: PWA_LAYER_Z_INDEX,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space.sm,
  pointerEvents: 'none',
};

export const cardStyle: CSSProperties = {
  pointerEvents: 'auto',
  width: '100%',
  maxWidth: 420,
  display: 'flex',
  alignItems: 'center',
  gap: space.md,
  padding: `${space.md}px ${space.lg}px`,
  background: themeColor.surfaceRaised,
  color: themeColor.text,
  border: `1px solid ${themeColor.border}`,
  borderRadius: radius.lg,
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
  ...typeScale.body,
};

export const cardTextStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

export const cardTitleStyle: CSSProperties = {
  ...typeScale.label,
  color: themeColor.text,
  margin: 0,
};

export const cardDetailStyle: CSSProperties = {
  ...typeScale.label,
  fontWeight: '400',
  color: themeColor.textMuted,
  margin: 0,
};

export const primaryButtonStyle: CSSProperties = {
  ...typeScale.label,
  flexShrink: 0,
  cursor: 'pointer',
  padding: `${space.sm}px ${space.md}px`,
  borderRadius: radius.pill,
  border: '1px solid transparent',
  background: themeColor.accent,
  color: themeColor.textOnAccent,
};

export const ghostButtonStyle: CSSProperties = {
  ...typeScale.label,
  flexShrink: 0,
  cursor: 'pointer',
  padding: `${space.sm}px ${space.md}px`,
  borderRadius: radius.pill,
  border: `1px solid ${themeColor.border}`,
  background: 'transparent',
  color: themeColor.textMuted,
};
