/**
 * Display formatting for the Train, Today and session screens.
 *
 * Every number that reaches the user goes through `@vigor/core/units`
 * (DESIGN.md §5.10, §11 "Never store display units"): storage stays canonical
 * metric and this module is the only place the screens convert.
 *
 * It also owns the rep/second/metre wording of DESIGN.md §5.1 rule 5: for the
 * `time` and `distance` load types the `targetReps`/`actualReps` fields hold
 * seconds or metres and "must be labelled accordingly, never as reps".
 */
import {
  displayLoggedLoad,
  formatNumber,
  fromInput,
  toDisplay,
  unitLabel,
  type LoadType,
  type LocalDate,
  type MovementPattern,
  type UnitSystem,
} from '@vigor/core';

/** `kg` or `lb`, whichever the profile reads in. */
export function loadUnit(unitSystem: UnitSystem): string {
  return unitLabel('load', unitSystem);
}

/** Canonical kg → the number the user sees, rounded to a loadable step. */
export function displayLoad(
  loadKg: number,
  unitSystem: UnitSystem,
  incrementKg?: number | null,
): number {
  return toDisplay(loadKg, 'load', unitSystem, { incrementKg });
}

/** `"60 kg"` / `"135 lb"`, or a dash when nothing is loaded. */
export function formatLoadOrDash(
  loadKg: number | null,
  unitSystem: UnitSystem,
  incrementKg?: number | null,
): string {
  if (loadKg == null) return '—';
  return `${formatNumber(displayLoad(loadKg, unitSystem, incrementKg))} ${loadUnit(unitSystem)}`;
}

/**
 * A load the user actually logged, shown exactly as they typed it —
 * DESIGN.md §5.10's round trip. Never pass a progression increment here: 22.5
 * typed in an imperial profile must read back as 22.5, not snap to the 5 lb
 * step the engine would prescribe.
 */
export function displayLoggedLoadValue(loadKg: number, unitSystem: UnitSystem): number {
  return displayLoggedLoad(loadKg, unitSystem);
}

/** `"22.5 lb"` for a logged load, or a dash when nothing was loaded. */
export function formatLoggedLoadOrDash(loadKg: number | null, unitSystem: UnitSystem): string {
  if (loadKg == null) return '—';
  return `${formatNumber(displayLoggedLoad(loadKg, unitSystem))} ${loadUnit(unitSystem)}`;
}

/** What the user typed in display units → canonical kg for storage. */
export function loadFromInput(value: number, unitSystem: UnitSystem): number {
  return fromInput(value, 'load', unitSystem);
}

/**
 * What the `targetReps` / `actualReps` column counts for this exercise —
 * DESIGN.md §5.1 rule 5. Never "reps" for a timed or measured exercise.
 */
export function repUnit(loadType: LoadType, plural = true): string {
  if (loadType === 'time') return plural ? 'seconds' : 'second';
  if (loadType === 'distance') return plural ? 'metres' : 'metre';
  return plural ? 'reps' : 'rep';
}

/** Short column header: `reps` / `sec` / `m`. */
export function repUnitShort(loadType: LoadType): string {
  if (loadType === 'time') return 'sec';
  if (loadType === 'distance') return 'm';
  return 'reps';
}

/** `"8–12 reps"`, `"30–45 seconds"`. */
export function formatRepTarget(min: number, max: number, loadType: LoadType): string {
  const range = min === max ? `${min}` : `${min}–${max}`;
  return `${range} ${repUnit(loadType)}`;
}

/** `"3 × 8–12 reps"` — one line for a planned slot. */
export function formatSetTarget(
  sets: number,
  min: number,
  max: number,
  loadType: LoadType,
): string {
  return `${sets} × ${formatRepTarget(min, max, loadType)}`;
}

/** `mm:ss`, for the rest timer. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

/** `"48 min"` — a session duration from its two timestamps. */
export function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return '—';
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const minutes = Math.round(ms / 60_000);
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `"Tue 10 Sep"` — dates never go through `Date` parsing of a local day. */
export function formatDayLabel(date: LocalDate, weekday?: string): string {
  const [, month, day] = date.split('-');
  const label = `${Number(day)} ${MONTHS[Number(month) - 1] ?? ''}`.trim();
  return weekday ? `${weekday.slice(0, 3)} ${label}` : label;
}

/** `"Week of 8 Sep"`. */
export function formatWeekLabel(weekStart: LocalDate): string {
  return `Week of ${formatDayLabel(weekStart)}`;
}

const PATTERN_LABELS: Record<MovementPattern, string> = {
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Lunge',
  horizontal_push: 'Horizontal push',
  vertical_push: 'Vertical push',
  horizontal_pull: 'Horizontal pull',
  vertical_pull: 'Vertical pull',
  carry: 'Carry',
  core: 'Core',
  isolation: 'Isolation',
  cardio: 'Cardio',
  mobility: 'Mobility',
};

export function patternLabel(pattern: MovementPattern): string {
  return PATTERN_LABELS[pattern];
}

/** `front_delts` → `Front delts`. */
export function titleCase(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A URL-safe slug for a custom exercise the user names themselves. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Parses a numeric text field; returns null for anything that is not a number. */
export function parseNumber(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
