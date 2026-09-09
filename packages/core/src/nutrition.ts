/**
 * Nutrition math — DESIGN.md §5.6.
 *
 * Daily state comes from the day's `food_items` versus the active
 * `nutrition_targets`. Remaining values are stored signed; the UI clamps them
 * at zero.
 *
 * Initial targets, when the user has none: Mifflin-St Jeor BMR × activity
 * multiplier, adjusted by the primary goal (fat loss −20 %, hypertrophy +10 %,
 * others 0), protein 1.8 g/kg, fat 25 % of kcal, carbs the remainder, fiber
 * 14 g per 1000 kcal. The user can override any value.
 */

import { ageYearsAt } from './dates';
import { makeRationale } from './rationale';
import type {
  ActivityLevel,
  DayNutrition,
  FoodLogWithItems,
  GoalType,
  LocalDate,
  MacroTotals,
  NutritionTargets,
  Profile,
  Rationale,
  Sex,
} from './types';
import { roundTo } from './units';

/** DESIGN.md §5.6 — activity multipliers applied to BMR. */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** DESIGN.md §5.6 — kcal adjustment applied for the highest-priority goal. */
export const GOAL_KCAL_ADJUSTMENT: Record<GoalType, number> = {
  fat_loss: -0.2,
  hypertrophy: 0.1,
  strength: 0,
  general: 0,
  endurance: 0,
  mobility: 0,
  conditioning: 0,
  consistency: 0,
};

export const PROTEIN_G_PER_KG = 1.8;
export const FAT_SHARE_OF_KCAL = 0.25;
export const FIBER_G_PER_1000_KCAL = 14;
export const KCAL_PER_G_PROTEIN = 4;
export const KCAL_PER_G_CARB = 4;
export const KCAL_PER_G_FAT = 9;

/** Used when the profile has no birth date — documented, never silent. */
export const DEFAULT_AGE_YEARS = 30;

export const ZERO_MACROS: MacroTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

/** A computed target row before the repository gives it an id. */
export type NutritionTargetsDraft = Omit<NutritionTargets, 'id'>;

export function addMacros(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    kcal: roundTo(a.kcal + b.kcal, 2),
    proteinG: roundTo(a.proteinG + b.proteinG, 2),
    carbsG: roundTo(a.carbsG + b.carbsG, 2),
    fatG: roundTo(a.fatG + b.fatG, 2),
    fiberG: roundTo(a.fiberG + b.fiberG, 2),
  };
}

export function subtractMacros(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    kcal: roundTo(a.kcal - b.kcal, 2),
    proteinG: roundTo(a.proteinG - b.proteinG, 2),
    carbsG: roundTo(a.carbsG - b.carbsG, 2),
    fatG: roundTo(a.fatG - b.fatG, 2),
    fiberG: roundTo(a.fiberG - b.fiberG, 2),
  };
}

/** DESIGN.md §5.6 — "remaining never goes below 0 in the UI". */
export function clampMacros(totals: MacroTotals): MacroTotals {
  return {
    kcal: Math.max(0, totals.kcal),
    proteinG: Math.max(0, totals.proteinG),
    carbsG: Math.max(0, totals.carbsG),
    fatG: Math.max(0, totals.fatG),
    fiberG: Math.max(0, totals.fiberG),
  };
}

export function macrosOfTargets(targets: NutritionTargets): MacroTotals {
  return {
    kcal: targets.kcal,
    proteinG: targets.proteinG,
    carbsG: targets.carbsG,
    fatG: targets.fatG,
    fiberG: targets.fiberG,
  };
}

/** Sums every item across the day's logs. */
export function sumConsumed(logs: readonly FoodLogWithItems[]): MacroTotals {
  return logs.reduce<MacroTotals>(
    (totals, log) =>
      log.items.reduce<MacroTotals>(
        (inner, item) =>
          addMacros(inner, {
            kcal: item.kcal,
            proteinG: item.proteinG,
            carbsG: item.carbsG,
            fatG: item.fatG,
            fiberG: item.fiberG,
          }),
        totals,
      ),
    { ...ZERO_MACROS },
  );
}

/** The target row in effect on `date`: the latest one that started on or before it. */
export function activeTargetsFor(
  date: LocalDate,
  targets: readonly NutritionTargets[],
): NutritionTargets | null {
  let best: NutritionTargets | null = null;
  for (const row of targets) {
    if (row.effectiveFrom > date) continue;
    if (best == null || row.effectiveFrom > best.effectiveFrom) best = row;
  }
  return best;
}

export interface DayNutritionInput {
  date: LocalDate;
  logs: readonly FoodLogWithItems[];
  /** Either the resolved row, or every row so the engine can pick. */
  targets?: NutritionTargets | null;
  allTargets?: readonly NutritionTargets[];
}

/** DESIGN.md §4.2 `nutrition.getDay`, §19 of idea.md — today's nutrition state. */
export function buildDayNutrition(input: DayNutritionInput): DayNutrition {
  const targets =
    input.targets ?? (input.allTargets ? activeTargetsFor(input.date, input.allTargets) : null);
  const consumed = sumConsumed(input.logs);
  const remaining = targets
    ? subtractMacros(macrosOfTargets(targets), consumed)
    : { ...ZERO_MACROS };
  const mealsLogged = new Set(input.logs.map((log) => log.mealSlot)).size;

  return {
    date: input.date,
    targets,
    consumed,
    remaining,
    logs: [...input.logs],
    mealsLogged,
  };
}

/** Mifflin-St Jeor. `other` / unknown sex uses the midpoint of the two constants. */
export function mifflinStJeorBmr(input: {
  sex: Sex | null;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears;
  const constant = input.sex === 'male' ? 5 : input.sex === 'female' ? -161 : -78;
  return roundTo(base + constant, 2);
}

export interface InitialTargetsInput {
  profile: Profile;
  /** Active goals; the lowest `priority` number wins (1 = highest). */
  goals: readonly { type: GoalType; priority: number; active: boolean }[];
  /** The day the targets start applying. */
  date: LocalDate;
}

export interface InitialTargetsResult {
  targets: NutritionTargetsDraft | null;
  rationale: Rationale;
}

/**
 * DESIGN.md §5.6 — the starting targets for a user who has none. Returns null
 * targets (with a rationale) when the profile lacks the height or weight
 * Mifflin-St Jeor needs.
 */
export function computeInitialNutritionTargets(input: InitialTargetsInput): InitialTargetsResult {
  const { profile, date } = input;

  if (profile.weightKg == null || profile.heightCm == null) {
    return {
      targets: null,
      rationale: makeRationale(
        ['PROFILE_INCOMPLETE'],
        { weightKg: profile.weightKg, heightCm: profile.heightCm },
        'Height and weight are needed before calorie targets can be estimated.',
      ),
    };
  }

  const ageYears =
    profile.birthDate != null ? ageYearsAt(profile.birthDate, date) : DEFAULT_AGE_YEARS;

  const bmr = mifflinStJeorBmr({
    sex: profile.sex,
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    ageYears,
  });

  const activityMultiplier = ACTIVITY_MULTIPLIERS[profile.activityLevel];
  const tdee = bmr * activityMultiplier;

  const primaryGoal =
    [...input.goals].filter((goal) => goal.active).sort((a, b) => a.priority - b.priority)[0] ??
    null;
  const adjustment = primaryGoal ? GOAL_KCAL_ADJUSTMENT[primaryGoal.type] : 0;

  const kcal = Math.round((tdee * (1 + adjustment)) / 10) * 10;
  const proteinG = Math.round(profile.weightKg * PROTEIN_G_PER_KG);
  const fatG = Math.round((kcal * FAT_SHARE_OF_KCAL) / KCAL_PER_G_FAT);
  const carbsG = Math.max(
    0,
    Math.round((kcal - proteinG * KCAL_PER_G_PROTEIN - fatG * KCAL_PER_G_FAT) / KCAL_PER_G_CARB),
  );
  const fiberG = Math.round((kcal / 1000) * FIBER_G_PER_1000_KCAL);

  return {
    targets: {
      effectiveFrom: date,
      kcal,
      proteinG,
      carbsG,
      fatG,
      fiberG,
      source: 'computed',
    },
    rationale: makeRationale(
      [
        'MIFFLIN_ST_JEOR',
        `ACTIVITY_${profile.activityLevel.toUpperCase()}`,
        primaryGoal ? `GOAL_${primaryGoal.type.toUpperCase()}` : 'GOAL_NONE',
      ],
      {
        ageYears,
        ageSource: profile.birthDate != null ? 'birthDate' : 'default',
        bmr: roundTo(bmr, 1),
        activityMultiplier,
        tdee: roundTo(tdee, 1),
        goalAdjustment: adjustment,
        proteinGPerKg: PROTEIN_G_PER_KG,
        fatShareOfKcal: FAT_SHARE_OF_KCAL,
        fiberGPer1000Kcal: FIBER_G_PER_1000_KCAL,
        kcal,
        proteinG,
        carbsG,
        fatG,
        fiberG,
      },
      `Mifflin-St Jeor puts your BMR near ${Math.round(bmr)} kcal; at a ${activityMultiplier}× ` +
        `activity multiplier${
          adjustment === 0
            ? ''
            : ` and a ${adjustment > 0 ? '+' : ''}${Math.round(adjustment * 100)} % goal adjustment`
        } that lands on ${kcal} kcal with ${proteinG} g protein.`,
    ),
  };
}

/** Share of a target already eaten, 0–1+, or null when there is no target. */
export function progressAgainstTarget(
  consumed: number,
  target: number | null | undefined,
): number | null {
  if (target == null || target <= 0) return null;
  return roundTo(consumed / target, 4);
}
