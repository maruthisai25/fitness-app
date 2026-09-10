/**
 * You → Safety — DESIGN.md §7.1: "You" lists "safety events" alongside
 * memories and exports. §6.5 says the banner stays until every event is
 * resolved; this is the durable place to see the whole history, not just
 * what is still open, and to resolve from — the same `safety.resolve` call
 * `SafetyBanner` already makes, so a note written here means the same thing.
 */

import { orderSafetyEvents, type SafetyEvent } from '@vigor/core';
import { radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { Card, EmptyState } from '../components/ui';
import { useAllSafetyEvents, useInvalidate, useRepos } from '../data/hooks';
import { humanize } from '../lib/display';
import { formatDate } from '../lib/localDate';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

export function SafetyPanel(): ReactNode {
  const { data, isPending } = useAllSafetyEvents();
  const ordered = useMemo(() => orderSafetyEvents(data ?? []), [data]);

  return (
    <div>
      <p style={{ margin: `0 0 ${space.lg}px`, color: themeColor.textMuted, lineHeight: 1.5 }}>
        Every pain, injury or symptom report you or the coach have logged — a session's "can't do
        this", a readiness check-in, or something said in chat. While an event is open, loads hold
        and the coach works around it; resolving the last one lifts that. This is a record of what
        you told the app, not medical advice — see someone if it is not settling.
      </p>

      {isPending && <p style={{ color: themeColor.textMuted }}>Loading safety events…</p>}

      {!isPending && ordered.length === 0 && (
        <EmptyState>
          Nothing reported. This fills in the moment a pain note, a session substitution, or the
          readiness check-in flags something.
        </EmptyState>
      )}

      <div style={{ display: 'grid', gap: space.md }}>
        {ordered.map((event) => (
          <SafetyEventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

function SafetyEventRow({ event }: { event: SafetyEvent }): ReactNode {
  const repos = useRepos();
  const invalidate = useInvalidate();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const open = event.resolvedAt == null;

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
    <Card tone={open ? 'safety' : 'surface'}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: space.md,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <strong style={{ color: themeColor.text, fontSize: fontSize.body }}>
            {humanize(event.kind)} · {formatDate(event.date)}
          </strong>
          <p style={{ margin: `${space.xs}px 0 0`, color: themeColor.text }}>{event.text}</p>
          <p
            style={{
              margin: `${space.xs}px 0 0`,
              color: themeColor.textMuted,
              fontSize: fontSize.caption,
            }}
          >
            Source: {humanize(event.source)}
          </p>
          {event.note && (
            <p
              style={{
                margin: `${space.xs}px 0 0`,
                color: themeColor.textMuted,
                fontSize: fontSize.caption,
              }}
            >
              Note: {event.note}
            </p>
          )}
          {!open && event.resolvedAt && (
            <p
              style={{
                margin: `${space.xs}px 0 0`,
                color: themeColor.good,
                fontSize: fontSize.caption,
              }}
            >
              Resolved {formatDate(event.resolvedAt.slice(0, 10))}
            </p>
          )}
        </div>

        {open && (
          <div style={{ display: 'flex', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
            {asking && (
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="How does it feel now?"
                aria-label={`Resolution note for ${humanize(event.kind)} on ${event.date}`}
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
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {asking ? 'Confirm resolved' : 'Resolve'}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
