/**
 * The fixed muscle/body-region vocabulary used by `Exercise.primaryMuscles`
 * and `Exercise.secondaryMuscles` (DESIGN.md §4.1). Every seed exercise's
 * muscle tags must come from this list — `validate()` in `./index.ts` checks
 * it — so the library, the substitution engine (DESIGN.md §5.5) and any UI
 * muscle-group filter all agree on the same vocabulary.
 *
 * `cardiovascular` stands in for "the cardiovascular system" on cardio
 * exercises; `hips`, `spine` and `ankles` are joint regions used by mobility
 * drills rather than a single muscle.
 */
export const MUSCLES = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'shoulders',
  'lats',
  'upper_back',
  'traps',
  'lower_back',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'obliques',
  'hip_flexors',
  'adductors',
  'abductors',
  'neck',
  'hips',
  'spine',
  'ankles',
  'full_body',
  'cardiovascular',
] as const;

export type Muscle = (typeof MUSCLES)[number];

const MUSCLE_SET: ReadonlySet<string> = new Set(MUSCLES);

/** Type guard: is `value` one of the fixed muscle/body-region tags. */
export function isMuscle(value: string): value is Muscle {
  return MUSCLE_SET.has(value);
}
