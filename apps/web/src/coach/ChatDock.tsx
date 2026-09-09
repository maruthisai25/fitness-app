/**
 * The coach's right rail — DESIGN.md §7.1: "reachable from every screen
 * (floating button on mobile, right rail on web)". Collapses to a floating
 * toggle under a narrow viewport rather than eating the whole page, and never
 * causes the page body to scroll sideways (DESIGN.md brief: "keep the page
 * body from scrolling horizontally").
 */

import { radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { ChatPanel } from './ChatPanel';

const NARROW_QUERY = '(max-width: 900px)';
const RAIL_WIDTH = 360;

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(NARROW_QUERY);
    const onChange = (): void => setNarrow(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export function CoachDock(): ReactNode {
  const narrow = useNarrowViewport();
  const [open, setOpen] = useState(!narrow);

  useEffect(() => {
    setOpen(!narrow);
  }, [narrow]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open coach chat"
        style={{
          position: 'fixed',
          right: space.lg,
          bottom: space.lg,
          zIndex: 30,
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: themeColor.accent,
          color: themeColor.textOnAccent,
          fontFamily: 'inherit',
          fontSize: fontSize.label,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        }}
      >
        Coach
      </button>
    );
  }

  return (
    <aside
      aria-label="Coach chat"
      style={
        narrow
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 30,
              background: themeColor.bg,
              display: 'flex',
              flexDirection: 'column',
            }
          : {
              position: 'sticky',
              top: 0,
              alignSelf: 'flex-start',
              width: RAIL_WIDTH,
              flexShrink: 0,
              height: '100vh',
              borderLeft: `1px solid ${themeColor.border}`,
              background: themeColor.surface,
              display: 'flex',
              flexDirection: 'column',
            }
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${space.sm}px ${space.md}px`,
          borderBottom: `1px solid ${themeColor.border}`,
        }}
      >
        <strong style={{ color: themeColor.text }}>Coach</strong>
        {narrow && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close coach chat"
            style={{
              background: 'none',
              border: `1px solid ${themeColor.border}`,
              borderRadius: radius.md,
              color: themeColor.text,
              padding: `${space.xs}px ${space.md}px`,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatPanel />
      </div>
    </aside>
  );
}
