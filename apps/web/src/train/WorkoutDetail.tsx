/**
 * Workout detail — DESIGN.md §7.1: the exercises, every set as it was logged,
 * and the rationale behind a "Why?" disclosure (§2.3). A planned or in-progress
 * session links straight into session mode.
 */

import { radius, space } from '@vigor/ui-tokens';
import { formatNumber } from '@vigor/core';
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
import { useExerciseIndex, useUnitSystem, useWorkout } from '../data/hooks';
import { loadText, loadUnit, loadValue, loggedLoadText, repUnitShort } from '../lib/display';
import { formatDate, minutesBetween } from '../lib/localDate';
import { sessionPath } from '../session/path';
import { volumeOf } from '../session/finish';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';

export function WorkoutDetail(): ReactNode {
  const { workoutId } = useParams<{ workoutId: string }>();
  const unitSystem = useUnitSystem();
  const { data: workout, isPending } = useWorkout(workoutId);
  const exerciseIndex = useExerciseIndex();

  if (isPending) return <p style={{ color: themeColor.textMuted }}>Loading the session…</p>;
  if (!workout) return <EmptyState>That session is not in your history.</EmptyState>;

  const counts = volumeOf(workout);
  const duration = minutesBetween(workout.startedAt, workout.finishedAt);
  const live = workout.status === 'planned' || workout.status === 'in_progress';

  return (
    <div>
      <PageHeading
        title={workout.title}
        subtitle={`${formatDate(workout.date, 'long')} · ${workout.status.replace('_', ' ')} · ${
          workout.source
        }-planned`}
        actions={
          live ? (
            <Link
              to={sessionPath(workout.id)}
              style={{
                padding: `${space.sm}px ${space.lg}px`,
                borderRadius: radius.md,
                background: themeColor.accent,
                color: themeColor.textOnAccent,
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              {workout.status === 'in_progress' ? 'Resume session' : 'Start session'}
            </Link>
          ) : undefined
        }
      />

      <div style={{ display: 'grid', gap: space.lg }}>
        <Card>
          <div style={{ display: 'flex', gap: space.xl, flexWrap: 'wrap' }}>
            <Stat label="Sets" value={`${counts.setsCompleted}/${counts.setsPlanned}`} />
            <Stat
              label="Volume"
              value={formatNumber(Math.round(loadValue(counts.totalVolumeKg, unitSystem)))}
              unit={loadUnit(unitSystem)}
            />
            <Stat label="Duration" value={duration ?? '—'} unit="min" />
            <Stat label="Planned" value={workout.plannedDurationMin} unit="min" />
          </div>
          {workout.notes && <p style={{ color: themeColor.textMuted }}>{workout.notes}</p>}
          <WhyDisclosure rationale={workout.rationale} label="Why this session?" />
        </Card>

        {workout.exercises.map((slot) => {
          const exercise = exerciseIndex.get(slot.exerciseId);
          const replaced = slot.substitutedFromExerciseId
            ? exerciseIndex.get(slot.substitutedFromExerciseId)?.name
            : null;
          return (
            <Card key={slot.id}>
              <SectionHeading
                actions={
                  exercise ? (
                    <Link
                      to={`/train/exercise/${exercise.id}`}
                      style={{ color: themeColor.accent, fontSize: fontSize.label }}
                    >
                      Exercise detail
                    </Link>
                  ) : undefined
                }
              >
                {exercise?.name ?? 'Exercise'}
              </SectionHeading>

              <p
                className="tabular"
                style={{ margin: 0, color: themeColor.textMuted, fontSize: fontSize.label }}
              >
                Target {slot.targetSets} × {slot.targetRepMin}–{slot.targetRepMax}
                {slot.targetLoadKg != null && ` at ${loadText(slot.targetLoadKg, unitSystem)}`} ·
                rest {slot.restSec} s{replaced && ` · swapped in for ${replaced}`}
              </p>

              <ScrollX>
                <table
                  className="tabular"
                  style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}
                >
                  <thead>
                    <tr style={{ textAlign: 'left', color: themeColor.textMuted }}>
                      <th style={cell}>Set</th>
                      <th style={cell}>Target</th>
                      <th style={cell}>{exercise ? repUnitShort(exercise.loadType) : 'reps'}</th>
                      <th style={cell}>Load</th>
                      <th style={cell}>RPE</th>
                      <th style={cell}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slot.sets.map((set) => (
                      <tr key={set.id}>
                        <td style={cell}>{set.setIndex + 1}</td>
                        <td style={cell}>{set.targetReps}</td>
                        <td style={cell}>{set.completed ? (set.actualReps ?? '—') : '—'}</td>
                        {/* As logged, never snapped to a plate step — §5.10. */}
                        <td style={cell}>{loggedLoadText(set.actualLoadKg, unitSystem)}</td>
                        <td style={cell}>{set.rpe ?? '—'}</td>
                        <td style={cell}>{set.notes ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollX>

              <WhyDisclosure
                rationale={slot.progressionDecision?.rationale}
                label="Why these numbers?"
              />
            </Card>
          );
        })}
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
