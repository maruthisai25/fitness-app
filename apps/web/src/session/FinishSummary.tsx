/**
 * The finish screen — DESIGN.md §7.1: "finish summary with PRs". New `e1rm`
 * and `max_load` records are celebrated loudly (the one place the burnt-amber
 * accent gets to shout, DESIGN.md §7.5); every other kind is listed quietly
 * (§5.7). Duration and total volume sit alongside them.
 */

import { fontFamily, radius, space } from '@vigor/ui-tokens';
import { formatNumber, type PersonalRecordKind, type UnitSystem } from '@vigor/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Card, Numeral, Stat, WhyDisclosure } from '../components/ui';
import { loadText, loadUnit, loadValue } from '../lib/display';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import type { SessionRecordSummary, SessionSummary } from './finish';

const RECORD_LABEL: Record<PersonalRecordKind, string> = {
  e1rm: 'Estimated 1RM',
  max_load: 'Heaviest load',
  max_reps_at_load: 'Most reps at a load',
  session_volume: 'Session volume',
};

function recordValue(entry: SessionRecordSummary, unitSystem: UnitSystem): string {
  const { record } = entry;
  switch (record.kind) {
    case 'e1rm':
    case 'max_load':
    case 'session_volume':
      return loadText(record.value, unitSystem);
    case 'max_reps_at_load':
      return `${formatNumber(record.value)} reps at ${loadText(record.loadKg, unitSystem)}`;
  }
}

export function FinishSummary({
  summary,
  unitSystem,
}: {
  summary: SessionSummary;
  unitSystem: UnitSystem;
}): ReactNode {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: space.xl }}>
      <h1
        style={{
          fontFamily: fontFamily.display,
          fontSize: fontSize.display,
          color: themeColor.text,
          margin: 0,
        }}
      >
        {summary.workout.title} — done
      </h1>
      <p style={{ color: themeColor.textMuted, marginTop: space.xs }}>
        {summary.setsCompleted} of {summary.setsPlanned} planned sets logged.
      </p>

      <Card style={{ marginTop: space.lg }}>
        <div style={{ display: 'flex', gap: space.xl, flexWrap: 'wrap' }}>
          <Stat label="Duration" value={summary.durationMin ?? '—'} unit="min" />
          <Stat
            label="Total volume"
            value={formatNumber(Math.round(loadValue(summary.totalVolumeKg, unitSystem)))}
            unit={loadUnit(unitSystem)}
          />
          <Stat label="Sets" value={summary.setsCompleted} />
        </div>
      </Card>

      {summary.celebrated.length > 0 && (
        <Card tone="raised" style={{ marginTop: space.lg, borderColor: themeColor.accent }}>
          <p
            style={{
              margin: 0,
              color: themeColor.accent,
              fontFamily: fontFamily.display,
              fontSize: fontSize.heading,
            }}
          >
            {summary.celebrated.length === 1 ? 'New personal record' : 'New personal records'}
          </p>
          {summary.celebrated.map((entry) => (
            <div key={entry.record.id} style={{ marginTop: space.md }}>
              <div style={{ color: themeColor.textMuted, fontSize: fontSize.label }}>
                {entry.exerciseName} · {RECORD_LABEL[entry.record.kind]}
              </div>
              <Numeral value={recordValue(entry, unitSystem)} />
            </div>
          ))}
        </Card>
      )}

      {summary.quiet.length > 0 && (
        <Card style={{ marginTop: space.md }}>
          <p style={{ margin: 0, color: themeColor.textMuted, fontSize: fontSize.label }}>
            Also logged
          </p>
          <ul style={{ margin: `${space.sm}px 0 0`, paddingLeft: space.lg }}>
            {summary.quiet.map((entry) => (
              <li key={entry.record.id} style={{ color: themeColor.text, fontSize: fontSize.body }}>
                {entry.exerciseName}: {RECORD_LABEL[entry.record.kind]} —{' '}
                {recordValue(entry, unitSystem)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary.celebrated.length === 0 && summary.quiet.length === 0 && (
        <Card style={{ marginTop: space.md }}>
          <p style={{ margin: 0, color: themeColor.textMuted }}>
            No records fell today. The work still counts — it is all in your history.
          </p>
        </Card>
      )}

      <Card style={{ marginTop: space.md }}>
        <p style={{ margin: 0, color: themeColor.textMuted, fontSize: fontSize.label }}>
          What the records engine saw
        </p>
        {summary.rationales.map((entry) => (
          <div key={entry.exerciseId} style={{ marginTop: space.sm }}>
            <strong style={{ color: themeColor.text, fontSize: fontSize.body }}>
              {entry.exerciseName}
            </strong>
            <WhyDisclosure rationale={entry.rationale} />
          </div>
        ))}
      </Card>

      <div style={{ display: 'flex', gap: space.md, marginTop: space.xl, flexWrap: 'wrap' }}>
        <Link
          to="/"
          style={{
            padding: `${space.sm}px ${space.lg}px`,
            borderRadius: radius.md,
            background: themeColor.accent,
            color: themeColor.textOnAccent,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Back to Today
        </Link>
        <Link
          to={`/train/workout/${summary.workout.id}`}
          style={{
            padding: `${space.sm}px ${space.lg}px`,
            borderRadius: radius.md,
            border: `1px solid ${themeColor.border}`,
            color: themeColor.text,
            textDecoration: 'none',
          }}
        >
          See the session detail
        </Link>
      </div>
    </div>
  );
}
