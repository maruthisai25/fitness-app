/**
 * Readiness check-in — DESIGN.md §5.2 and §9 phase 3. The card writes a
 * `readiness` row, stores the score the engine computed, and opens a
 * `safety_events` row when pain is reported (the engine returns the row to
 * write; the screen only persists it).
 */

import { radius, space } from '@vigor/ui-tokens';
import {
  assessReadiness,
  type LocalDate,
  type Readiness,
  type ReadinessAssessment,
  type Scale1To5,
} from '@vigor/core';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { Card, Numeral, Pill, SectionHeading, WhyDisclosure } from '../components/ui';
import { useInvalidate, useRepos } from '../data/hooks';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

const SCALE: readonly Scale1To5[] = [1, 2, 3, 4, 5];

const QUESTIONS: readonly {
  key: 'sleepQuality' | 'energy' | 'soreness' | 'fatigue' | 'stress';
  label: string;
  low: string;
  high: string;
}[] = [
  { key: 'sleepQuality', label: 'Sleep quality', low: 'Broken', high: 'Deep' },
  { key: 'energy', label: 'Energy', low: 'Flat', high: 'Sharp' },
  { key: 'soreness', label: 'Soreness', low: 'None', high: 'Very sore' },
  { key: 'fatigue', label: 'Fatigue', low: 'Fresh', high: 'Wiped out' },
  { key: 'stress', label: 'Stress', low: 'Calm', high: 'Wound up' },
];

interface Draft {
  sleepHours: string;
  sleepQuality: Scale1To5 | null;
  energy: Scale1To5 | null;
  soreness: Scale1To5 | null;
  fatigue: Scale1To5 | null;
  stress: Scale1To5 | null;
  painReported: boolean;
  painNote: string;
}

function toDraft(row: Readiness | null): Draft {
  return {
    sleepHours: row?.sleepHours == null ? '' : String(row.sleepHours),
    sleepQuality: row?.sleepQuality ?? null,
    energy: row?.energy ?? null,
    soreness: row?.soreness ?? null,
    fatigue: row?.fatigue ?? null,
    stress: row?.stress ?? null,
    painReported: row?.painReported ?? false,
    painNote: row?.painNote ?? '',
  };
}

export function ReadinessCard({
  date,
  row,
  assessment,
}: {
  date: LocalDate;
  row: Readiness | null;
  assessment: ReadinessAssessment;
}): ReactNode {
  const repos = useRepos();
  const invalidate = useInvalidate();
  const [draft, setDraft] = useState<Draft>(() => toDraft(row));
  const [editing, setEditing] = useState(row == null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(toDraft(row));
  }, [row]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save(): Promise<void> {
    setBusy(true);
    try {
      const hours = draft.sleepHours.trim() === '' ? null : Number(draft.sleepHours);
      const saved = await repos.readiness.upsertForDate(date, {
        sleepHours: hours != null && Number.isFinite(hours) ? hours : null,
        sleepQuality: draft.sleepQuality,
        energy: draft.energy,
        soreness: draft.soreness,
        fatigue: draft.fatigue,
        stress: draft.stress,
        painReported: draft.painReported,
        painNote: draft.painNote.trim() === '' ? null : draft.painNote.trim(),
      });

      const result = assessReadiness(saved, date);
      if (result.score != null) await repos.readiness.setScore(saved.id, result.score);
      if (result.safetyEvent) {
        await repos.safety.create(result.safetyEvent);
        await invalidate('reportSafety');
      }
      await invalidate('saveReadiness');
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  const tone =
    assessment.modifier === 'normal'
      ? themeColor.good
      : assessment.modifier === 'hold'
        ? themeColor.warn
        : themeColor.bad;

  return (
    <Card>
      <SectionHeading
        actions={
          !editing ? (
            <button type="button" onClick={() => setEditing(true)} style={linkButton}>
              Update
            </button>
          ) : undefined
        }
      >
        Readiness
      </SectionHeading>

      {!editing && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: space.md }}>
            <Numeral value={assessment.score ?? '—'} unit="/ 100" style={{ color: tone }} />
            <span style={{ color: tone, fontSize: fontSize.label, textTransform: 'uppercase' }}>
              {assessment.modifier}
            </span>
          </div>
          <p style={{ color: themeColor.textMuted, margin: `${space.sm}px 0 0` }}>
            {assessment.rationale.summary}
          </p>
          <WhyDisclosure rationale={assessment.rationale} />
        </div>
      )}

      {editing && (
        <div>
          <label style={{ display: 'block', marginBottom: space.md }}>
            <span style={fieldLabel}>Hours of sleep</span>
            <input
              aria-label="Hours of sleep"
              inputMode="decimal"
              value={draft.sleepHours}
              onChange={(event) => set('sleepHours', event.target.value)}
              style={{ ...inputStyle, width: 100 }}
            />
          </label>

          {QUESTIONS.map((question) => (
            <div key={question.key} style={{ marginBottom: space.md }}>
              <span style={fieldLabel}>
                {question.label}{' '}
                <span style={{ color: themeColor.textFaint }}>
                  ({question.low} → {question.high})
                </span>
              </span>
              <div
                role="group"
                aria-label={question.label}
                style={{ display: 'flex', gap: space.xs, flexWrap: 'wrap' }}
              >
                {SCALE.map((value) => (
                  <Pill
                    key={value}
                    pressed={draft[question.key] === value}
                    onClick={() => set(question.key, draft[question.key] === value ? null : value)}
                  >
                    {value}
                  </Pill>
                ))}
              </div>
            </div>
          ))}

          <label
            style={{
              display: 'flex',
              gap: space.sm,
              alignItems: 'center',
              marginBottom: space.sm,
              color: themeColor.text,
            }}
          >
            <input
              type="checkbox"
              checked={draft.painReported}
              onChange={(event) => set('painReported', event.target.checked)}
            />
            Something hurts today
          </label>

          {draft.painReported && (
            <>
              <input
                aria-label="What hurts"
                placeholder="Where is it, and what makes it worse?"
                value={draft.painNote}
                onChange={(event) => set('painNote', event.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              />
              <p style={{ color: themeColor.warn, fontSize: fontSize.label }}>
                Reporting pain opens a safety event: loads hold, volume comes down, and nothing
                progresses until you resolve it. VigorEngine is not medical advice.
              </p>
            </>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            style={{
              marginTop: space.md,
              padding: `${space.sm}px ${space.lg}px`,
              borderRadius: radius.md,
              border: 'none',
              background: themeColor.accent,
              color: themeColor.textOnAccent,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {busy ? 'Saving…' : 'Save check-in'}
          </button>
        </div>
      )}
    </Card>
  );
}

const fieldLabel = {
  display: 'block',
  fontSize: fontSize.label,
  color: themeColor.textMuted,
  marginBottom: space.xs,
} as const;

const inputStyle = {
  padding: `${space.sm}px ${space.md}px`,
  borderRadius: radius.sm,
  border: `1px solid ${themeColor.border}`,
  background: themeColor.surfaceRaised,
  color: themeColor.text,
  fontSize: fontSize.body,
} as const;

const linkButton = {
  background: 'none',
  border: 'none',
  color: themeColor.accent,
  fontSize: fontSize.label,
  cursor: 'pointer',
  padding: 0,
} as const;
