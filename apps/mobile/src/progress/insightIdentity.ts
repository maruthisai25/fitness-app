/**
 * What makes two insight rows "the same insight".
 *
 * The detectors in `@vigor/core` are stateless: every run re-derives every
 * finding from the last 28 days, so the period, the headline and the numbers
 * in the detail all move from day to day. Keying a stored row by any of those
 * makes each run look brand new, which re-inserts the whole batch daily and
 * resurrects anything the user dismissed.
 *
 * The identity is therefore **detector + subject**, where the subject is
 * derived from the insight's own evidence:
 *
 *   EXERCISE_TREND          the exercise the sessions belong to
 *   PUSH_PULL_BALANCE       a constant — the detector emits at most one row
 *   SKIPPED_PATTERN         the weekday shared by the cited workouts, else
 *                           their shared planned-duration bucket
 *   PROTEIN_GAP_BY_DAY      the weekday of the cited nutrition days
 *   COMPLETION_BY_DURATION  the duration bucket the row is about
 *   FREQUENT_FOODS          the food name
 *   MISSED_TARGET_STREAK    the macro
 *
 * The derived subject is then written onto the row itself as an extra
 * `EvidenceRef`, so later runs read it back rather than re-deriving it from
 * evidence that may no longer be in the window. `packages/db` is untouched:
 * `evidence` is the one free-form string-bearing field on the row, and these
 * markers are filtered out of anything the user sees.
 */
import {
  durationBucketOf,
  weekdayOf,
  type EvidenceRef,
  type Insight,
  type InsightDraft,
  type LocalDate,
} from '@vigor/core';

/** Pseudo-tables used for row markers; never real evidence. */
export const SUBJECT_MARKER_TABLE = 'insight_subject';
export const DISMISSED_MARKER_TABLE = 'insight_dismissed_on';

const MARKER_TABLES = new Set<string>([SUBJECT_MARKER_TABLE, DISMISSED_MARKER_TABLE]);

/** A constant subject for detectors that emit at most one row per run. */
const SINGLETON_SUBJECT = 'all';

/** The facts about cited rows a subject may need, gathered once per run. */
export interface SubjectContext {
  /** `workout_exercises.id` → the exercise it belongs to. */
  exerciseIdByWorkoutExercise: ReadonlyMap<string, string>;
  /** `workouts.id` → the day and planned length the buckets are built from. */
  workoutFacets: ReadonlyMap<string, { date: LocalDate; plannedDurationMin: number }>;
}

export const EMPTY_SUBJECT_CONTEXT: SubjectContext = {
  exerciseIdByWorkoutExercise: new Map(),
  workoutFacets: new Map(),
};

function marker(evidence: readonly EvidenceRef[], table: string): string | null {
  const ref = evidence.find((entry) => entry.table === table);
  return ref ? ref.id : null;
}

function firstRef(evidence: readonly EvidenceRef[], table: string): EvidenceRef | undefined {
  return evidence.find((entry) => entry.table === table);
}

/** Evidence worth showing a human: everything except our own markers. */
export function visibleEvidence(evidence: readonly EvidenceRef[]): EvidenceRef[] {
  return evidence.filter((entry) => !MARKER_TABLES.has(entry.table));
}

function subjectFromEvidence(row: Insight | InsightDraft, context: SubjectContext): string {
  const { evidence } = row;

  switch (row.detector) {
    case 'EXERCISE_TREND': {
      const ref = firstRef(evidence, 'workout_exercises');
      if (!ref) break;
      return context.exerciseIdByWorkoutExercise.get(ref.id) ?? ref.id;
    }

    case 'PUSH_PULL_BALANCE':
      return SINGLETON_SUBJECT;

    case 'PROTEIN_GAP_BY_DAY': {
      const ref = firstRef(evidence, 'nutrition_day');
      if (!ref) break;
      return `weekday_${weekdayOf(ref.id as LocalDate)}`;
    }

    case 'MISSED_TARGET_STREAK': {
      // The detector notes the macro on every day it cites.
      const ref = firstRef(evidence, 'nutrition_day');
      if (!ref?.note) break;
      return ref.note;
    }

    case 'FREQUENT_FOODS': {
      const ref = firstRef(evidence, 'food_items');
      if (!ref?.note) break;
      return ref.note.trim().toLowerCase();
    }

    case 'COMPLETION_BY_DURATION': {
      // The winning bucket's workouts come first in the evidence list.
      const ref = firstRef(evidence, 'workouts');
      const facets = ref ? context.workoutFacets.get(ref.id) : undefined;
      if (!facets) break;
      return `duration_${durationBucketOf(facets.plannedDurationMin).key}`;
    }

    case 'SKIPPED_PATTERN': {
      const facets = evidence
        .filter((entry) => entry.table === 'workouts')
        .map((entry) => context.workoutFacets.get(entry.id))
        .filter((entry): entry is { date: LocalDate; plannedDurationMin: number } => entry != null);
      if (facets.length === 0) break;

      // A weekday bucket cites one weekday; a duration bucket cites one bucket.
      const weekdays = new Set(facets.map((entry) => weekdayOf(entry.date)));
      if (weekdays.size === 1) return `weekday_${[...weekdays][0]}`;
      const buckets = new Set(facets.map((entry) => durationBucketOf(entry.plannedDurationMin).key));
      if (buckets.size === 1) return `duration_${[...buckets][0]}`;
      break;
    }

    default:
      break;
  }

  // Nothing usable in the evidence: the headline is the most stable thing left.
  return `headline:${row.headline}`;
}

/** The subject half of the identity: the marker if the row carries one. */
export function insightSubject(
  row: Insight | InsightDraft,
  context: SubjectContext = EMPTY_SUBJECT_CONTEXT,
): string {
  return marker(row.evidence, SUBJECT_MARKER_TABLE) ?? subjectFromEvidence(row, context);
}

/** Detector + subject — what "the same insight" means across runs. */
export function insightIdentity(
  row: Insight | InsightDraft,
  context: SubjectContext = EMPTY_SUBJECT_CONTEXT,
): string {
  return `${row.detector}|${insightSubject(row, context)}`;
}

/** The draft's evidence with its subject marker appended (never duplicated). */
export function evidenceWithSubject(
  row: Insight | InsightDraft,
  context: SubjectContext = EMPTY_SUBJECT_CONTEXT,
): EvidenceRef[] {
  const subject = insightSubject(row, context);
  const rest = row.evidence.filter((entry) => entry.table !== SUBJECT_MARKER_TABLE);
  return [...rest, { table: SUBJECT_MARKER_TABLE, id: subject, note: row.detector }];
}

/** A draft ready to store: its identity travels with it. */
export function withSubjectMarker(
  draft: InsightDraft,
  context: SubjectContext = EMPTY_SUBJECT_CONTEXT,
): InsightDraft {
  return { ...draft, evidence: evidenceWithSubject(draft, context) };
}

/**
 * The local day a row was dismissed on, read from the legacy evidence marker.
 *
 * Dismissal now writes the `dismissedAt` column (migration 0001). This stays as
 * the fallback for rows dismissed before that column existed, whose day is only
 * recorded in `evidence`.
 */
export function dismissedOn(insight: Insight): LocalDate | null {
  const value = marker(insight.evidence, DISMISSED_MARKER_TABLE);
  return value == null ? null : (value as LocalDate);
}
