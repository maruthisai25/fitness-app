/**
 * Rest timer — DESIGN.md §7.1 ("rest timer with notification") and §7.4:
 * on web there is no background scheduler, so the countdown runs in the page
 * and the Notification adapter only fires while this tab is open. The screen
 * says so, rather than promising a nudge the browser cannot deliver.
 */

import { radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { formatClock } from '../lib/localDate';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

export function RestTimer({
  endsAt,
  totalSec,
  backgroundDelivery,
  onSkip,
  onExtend,
}: {
  endsAt: number;
  totalSec: number;
  /** False on web: the Notification only arrives while the tab is open. */
  backgroundDelivery: boolean;
  onSkip: () => void;
  onExtend: (seconds: number) => void;
}): ReactNode {
  const [remaining, setRemaining] = useState(() => secondsLeft(endsAt));

  useEffect(() => {
    setRemaining(secondsLeft(endsAt));
    const handle = setInterval(() => setRemaining(secondsLeft(endsAt)), 500);
    return () => clearInterval(handle);
  }, [endsAt]);

  const done = remaining <= 0;
  const progress = totalSec > 0 ? Math.min(1, Math.max(0, 1 - remaining / totalSec)) : 1;

  return (
    <div
      role="timer"
      aria-live="polite"
      style={{
        border: `1px solid ${done ? themeColor.good : themeColor.border}`,
        background: themeColor.surfaceRaised,
        borderRadius: radius.md,
        padding: space.md,
        display: 'flex',
        alignItems: 'center',
        gap: space.md,
        flexWrap: 'wrap',
      }}
    >
      <span
        className="tabular"
        style={{ fontSize: fontSize.title, color: done ? themeColor.good : themeColor.text }}
      >
        {done ? 'Rest done' : formatClock(remaining)}
      </span>
      <div
        style={{
          flex: 1,
          minWidth: 120,
          height: 6,
          borderRadius: radius.pill,
          background: themeColor.border,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            background: done ? themeColor.good : themeColor.accent,
          }}
        />
      </div>
      <button type="button" onClick={() => onExtend(30)} style={linkButton}>
        +30 s
      </button>
      <button type="button" onClick={onSkip} style={linkButton}>
        {done ? 'Clear' : 'Skip rest'}
      </button>
      <span style={{ fontSize: fontSize.caption, color: themeColor.textFaint }}>
        Press Escape to skip
      </span>
      {!backgroundDelivery && (
        <span style={{ fontSize: fontSize.caption, color: themeColor.textFaint, width: '100%' }}>
          The rest alert only fires while this tab is open.
        </span>
      )}
    </div>
  );
}

const linkButton = {
  background: 'none',
  border: 'none',
  color: themeColor.accent,
  fontSize: fontSize.label,
  cursor: 'pointer',
  padding: 0,
} as const;

function secondsLeft(endsAt: number): number {
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}
