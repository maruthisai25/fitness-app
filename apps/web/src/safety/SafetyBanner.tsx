/**
 * Safety banner — DESIGN.md §6.5: "the UI shows a banner until the user
 * resolves the event". It sits above every screen while any `safety_events`
 * row is unresolved, states plainly what the engines are doing about it, and
 * offers the resolve action.
 */

import { radius, space } from '@vigor/ui-tokens';
import type { SafetyEvent } from '@vigor/core';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { useInvalidate, useOpenSafetyEvents, useRepos } from '../data/hooks';
import { formatDate } from '../lib/localDate';
import { humanize } from '../lib/display';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

/** The one sentence every screen repeats while safety state is active. */
export const SAFETY_HOLD_MESSAGE =
  'While this is open, loads hold where they are, one set comes off each exercise, and nothing progresses.';

export function SafetyBanner(): ReactNode {
  const { data: events } = useOpenSafetyEvents();
  if (!events || events.length === 0) return null;
  return (
    <div
      role="status"
      style={{
        background: themeColor.safety,
        borderBottom: `1px solid ${themeColor.bad}`,
        padding: `${space.md}px ${space.xl}px`,
      }}
    >
      {events.map((event) => (
        <SafetyRow key={event.id} event={event} />
      ))}
    </div>
  );
}

function SafetyRow({ event }: { event: SafetyEvent }): ReactNode {
  const repos = useRepos();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);

  async function resolve(): Promise<void> {
    setBusy(true);
    try {
      await repos.safety.resolve(event.id, note.trim() || undefined);
      await invalidate('resolveSafety');
    } finally {
      setBusy(false);
      setAsking(false);
      setNote('');
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: space.md,
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <strong style={{ color: themeColor.text, fontSize: fontSize.body }}>
          {humanize(event.kind)} logged {formatDate(event.date)}
        </strong>
        <p style={{ margin: `2px 0 0`, color: themeColor.text, fontSize: fontSize.label }}>
          {event.text}
        </p>
        <p style={{ margin: `2px 0 0`, color: themeColor.textMuted, fontSize: fontSize.caption }}>
          {SAFETY_HOLD_MESSAGE} VigorEngine is not medical advice — see a professional if this
          persists.
        </p>
      </div>
      <div style={{ display: 'flex', gap: space.sm, alignItems: 'center' }}>
        {asking && (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How does it feel now?"
            aria-label="Resolution note"
            style={{
              padding: `${space.xs}px ${space.sm}px`,
              borderRadius: radius.sm,
              border: `1px solid ${themeColor.border}`,
              background: themeColor.surface,
              color: themeColor.text,
              fontSize: fontSize.label,
            }}
          />
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => (asking ? void resolve() : setAsking(true))}
          style={{
            padding: `${space.xs}px ${space.md}px`,
            borderRadius: radius.md,
            border: 'none',
            background: themeColor.accent,
            color: themeColor.textOnAccent,
            fontSize: fontSize.label,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {asking ? 'Confirm resolved' : 'Mark resolved'}
        </button>
      </div>
    </div>
  );
}
