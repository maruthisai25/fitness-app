/**
 * Exercise detail — DESIGN.md §7.1: instructions, cues, the relation graph,
 * the logged history, the e1RM chart and the PRs. Every number comes from
 * `buildExerciseStats` (§7.2); this file renders and nothing more.
 */

import { space } from '@vigor/ui-tokens';
import {
  buildExerciseStats,
  formatNumber,
  type ExerciseRelationKind,
  type PersonalRecordKind,
} from '@vigor/core';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import {
  Card,
  EmptyState,
  PageHeading,
  ScrollX,
  SectionHeading,
  Stat,
  WhyDisclosure,
} from '../components/ui';
import {
  useExercise,
  useExerciseHistory,
  useExerciseIndex,
  useExerciseRelations,
  usePersonalRecords,
  useUnitSystem,
} from '../data/hooks';
import {
  humanize,
  loadText,
  loadValue,
  loggedLoadText,
  repsText,
  repUnitShort,
} from '../lib/display';
import { formatDate } from '../lib/localDate';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { E1rmChart } from './E1rmChart';

const RELATION_LABEL: Record<ExerciseRelationKind, string> = {
  variation: 'Variations',
  progression: 'Harder next steps',
  regression: 'Easier steps back',
  substitution: 'Stands in for it',
};

const RECORD_LABEL: Record<PersonalRecordKind, string> = {
  e1rm: 'Estimated 1RM',
  max_load: 'Heaviest load',
  max_reps_at_load: 'Most reps at a load',
  session_volume: 'Best session volume',
};

export function ExerciseDetail(): ReactNode {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const unitSystem = useUnitSystem();
  const { data: exercise, isPending } = useExercise(exerciseId);
  const { data: sessions = [] } = useExerciseHistory(exerciseId);
  const { data: records = [] } = usePersonalRecords(exerciseId);
  const { data: relations = [] } = useExerciseRelations(exerciseId);
  const exerciseIndex = useExerciseIndex();

  if (isPending) return <p style={{ color: themeColor.textMuted }}>Loading…</p>;
  if (!exercise) return <EmptyState>That exercise is not in your library.</EmptyState>;

  const stats = buildExerciseStats({
    exercise,
    sessions,
    personalRecords: records,
    unitSystem,
  });

  const chartPoints = [...stats.sessions]
    .reverse()
    .filter((session) => session.e1rmKg != null)
    .map((session) => ({
      date: session.date,
      value: loadValue(session.e1rmKg as number, unitSystem),
    }));

  const byKind = new Map<ExerciseRelationKind, string[]>();
  for (const relation of relations) {
    const name = exerciseIndex.get(relation.toId)?.name;
    if (!name) continue;
    byKind.set(relation.kind, [...(byKind.get(relation.kind) ?? []), name]);
  }

  return (
    <div>
      <PageHeading
        title={exercise.name}
        subtitle={`${humanize(exercise.movementPattern)} · ${
          exercise.primaryMuscles.join(', ') || 'no primary muscles recorded'
        } · ${exercise.equipment.map(humanize).join(', ') || 'bodyweight'}`}
        actions={
          <Link to="/train" style={{ color: themeColor.accent, fontSize: fontSize.label }}>
            Back to the library
          </Link>
        }
      />

      <div style={{ display: 'grid', gap: space.lg }}>
        <Card>
          <div style={{ display: 'flex', gap: space.xl, flexWrap: 'wrap' }}>
            <Stat
              label="Best e1RM"
              value={stats.display.bestE1rm == null ? '—' : formatNumber(stats.display.bestE1rm)}
              unit={
                stats.display.bestE1rm == null ? undefined : unitSystem === 'imperial' ? 'lb' : 'kg'
              }
            />
            <Stat
              label="Best load"
              value={stats.display.bestLoad == null ? '—' : formatNumber(stats.display.bestLoad)}
              unit={
                stats.display.bestLoad == null ? undefined : unitSystem === 'imperial' ? 'lb' : 'kg'
              }
            />
            <Stat label="Best reps" value={stats.bestReps || '—'} />
            <Stat label="Sessions" value={stats.sessionCount} />
            <Stat label="Sets" value={stats.totalSets} />
            <Stat label="Mean RPE" value={stats.averageRpe ?? '—'} />
          </div>
          <p style={{ color: themeColor.textMuted, marginBottom: 0 }}>{stats.rationale.summary}</p>
          <WhyDisclosure rationale={stats.rationale} />
        </Card>

        <Card>
          <SectionHeading>Estimated 1RM</SectionHeading>
          <E1rmChart
            points={chartPoints}
            unit={unitSystem === 'imperial' ? 'lb' : 'kg'}
            label={
              stats.e1rmTrendKgPerWeek == null
                ? 'One point per logged session'
                : `Trend ${stats.e1rmTrendKgPerWeek > 0 ? '+' : ''}${formatNumber(
                    loadValue(stats.e1rmTrendKgPerWeek, unitSystem),
                  )} ${unitSystem === 'imperial' ? 'lb' : 'kg'} per week`
            }
          />
        </Card>

        <Card>
          <SectionHeading>How to do it</SectionHeading>
          <p style={{ color: themeColor.text, marginTop: 0 }}>
            {exercise.instructions || 'No instructions recorded for this movement yet.'}
          </p>
          {exercise.cues.length > 0 && (
            <>
              <p style={{ color: themeColor.textMuted, fontSize: fontSize.label, marginBottom: 0 }}>
                Cues
              </p>
              <ul style={{ margin: `${space.xs}px 0 0`, paddingLeft: space.lg }}>
                {exercise.cues.map((cue) => (
                  <li key={cue} style={{ color: themeColor.text }}>
                    {cue}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {byKind.size > 0 && (
          <Card>
            <SectionHeading>Related movements</SectionHeading>
            {[...byKind.entries()].map(([kind, names]) => (
              <p key={kind} style={{ margin: `0 0 ${space.sm}px`, color: themeColor.text }}>
                <span style={{ color: themeColor.textMuted, fontSize: fontSize.label }}>
                  {RELATION_LABEL[kind]}:{' '}
                </span>
                {names.join(', ')}
              </p>
            ))}
          </Card>
        )}

        <Card>
          <SectionHeading>Personal records</SectionHeading>
          {stats.personalRecords.length === 0 ? (
            <EmptyState>No records yet — the first logged session sets them.</EmptyState>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="tabular">
              {stats.personalRecords.map((record) => (
                <li key={record.id} style={{ color: themeColor.text }}>
                  {RECORD_LABEL[record.kind]}:{' '}
                  {record.kind === 'max_reps_at_load'
                    ? `${formatNumber(record.value)} reps at ${loadText(record.loadKg, unitSystem)}`
                    : loadText(record.value, unitSystem)}{' '}
                  <span style={{ color: themeColor.textFaint }}>({formatDate(record.date)})</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeading>History</SectionHeading>
          {stats.sessions.length === 0 ? (
            <EmptyState>
              Nothing logged yet. Add this to a workout from the builder and it starts filling in.
            </EmptyState>
          ) : (
            <ScrollX>
              <table
                className="tabular"
                style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}
              >
                <thead>
                  <tr style={{ textAlign: 'left', color: themeColor.textMuted }}>
                    <th style={cell}>Date</th>
                    <th style={cell}>Sets</th>
                    <th style={cell}>{repUnitShort(exercise.loadType)}</th>
                    <th style={cell}>Load</th>
                    <th style={cell}>RPE</th>
                    <th style={cell}>e1RM</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sessions.map((session) => (
                    <tr key={`${session.workoutId}-${session.date}`}>
                      <td style={cell}>
                        <Link
                          to={`/train/workout/${session.workoutId}`}
                          style={{ color: themeColor.accent }}
                        >
                          {formatDate(session.date)}
                        </Link>
                      </td>
                      <td style={cell}>{session.sets}</td>
                      <td style={cell}>{repsText(session.reps)}</td>
                      {/* As logged, never snapped to a plate step — §5.10. */}
                      <td style={cell}>{loggedLoadText(session.loadKg, unitSystem)}</td>
                      <td style={cell}>{session.meanRpe ?? '—'}</td>
                      <td style={cell}>
                        {session.e1rmKg == null ? '—' : loadText(session.e1rmKg, unitSystem)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollX>
          )}
        </Card>
      </div>
    </div>
  );
}

const cell = {
  padding: `${space.xs}px ${space.md}px ${space.xs}px 0`,
  borderBottom: `1px solid ${themeColor.border}`,
  color: themeColor.text,
  fontSize: fontSize.body,
  whiteSpace: 'nowrap',
} as const;
