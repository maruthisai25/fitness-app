/**
 * A quiet strip that appears only while the browser reports no connection.
 *
 * The wording matters: nothing is broken offline (DESIGN.md §2.4) — only the
 * coach is unavailable, and its work is queued rather than lost (DESIGN.md §8).
 */
import { radius, space, typeScale } from '@vigor/ui-tokens';
import type { CSSProperties, ReactElement } from 'react';

import { themeColor } from '../theme/cssVars';
import { PWA_LAYER_Z_INDEX } from './styles';
import { useOnlineStatus } from './useOnlineStatus';

const barStyle: CSSProperties = {
  position: 'fixed',
  insetBlockStart: `calc(${space.sm}px + env(safe-area-inset-top, 0px))`,
  insetInlineStart: '50%',
  transform: 'translateX(-50%)',
  zIndex: PWA_LAYER_Z_INDEX,
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  padding: `${space.xs}px ${space.md}px`,
  borderRadius: radius.pill,
  background: themeColor.surfaceRaised,
  border: `1px solid ${themeColor.borderStrong}`,
  color: themeColor.textMuted,
  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.3)',
  ...typeScale.label,
};

const dotStyle: CSSProperties = {
  width: space.sm,
  height: space.sm,
  borderRadius: radius.pill,
  background: themeColor.warn,
  flexShrink: 0,
};

export function OfflineIndicator(): ReactElement | null {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div style={barStyle} role="status" aria-live="polite">
      <span style={dotStyle} aria-hidden="true" />
      <span>Offline — logging still works, coach replies are queued</span>
    </div>
  );
}
