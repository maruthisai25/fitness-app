import { beforeEach, describe, expect, it } from 'vitest';

import {
  makeFoodItem,
  makeFoodLog,
  makeGoal,
  makeProfile,
  makeTargets,
  resetFixtureIds,
} from './fixtures';
import {
  ACTIVITY_MULTIPLIERS,
  DEFAULT_AGE_YEARS,
  FIBER_G_PER_1000_KCAL,
  PROTEIN_G_PER_KG,
  activeTargetsFor,
  addMacros,
  buildDayNutrition,
  clampMacros,
  computeInitialNutritionTargets,
  mifflinStJeorBmr,
  progressAgainstTarget,
  subtractMacros,
  sumConsumed,
} from './nutrition';

beforeEach(() => {
  resetFixtureIds();
});

describe('macro arithmetic', () => {
  const a = { kcal: 100, proteinG: 10, carbsG: 5, fatG: 3, fiberG: 1 };
  const b = { kcal: 50, proteinG: 4, carbsG: 2, fatG: 1, fiberG: 0.5 };

  it('adds and subtracts without float drift', () => {
    expect(addMacros(a, b)).toEqual({ kcal: 150, proteinG: 14, carbsG: 7, fatG: 4, fiberG: 1.5 });
    expect(subtractMacros(b, a)).toEqual({
      kcal: -50,
      proteinG: -6,
      carbsG: -3,
      fatG: -2,
      fiberG: -0.5,
    });
  });

  it('clamps only for display — DESIGN.md §5.6', () => {
    expect(clampMacros(subtractMacros(b, a))).toEqual({
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
    });
  });

  it('sums every item across every log', () => {
    const logs = [
      makeFoodLog({
        items: [makeFoodItem({ kcal: 330, proteinG: 62, carbsG: 0, fatG: 7, fiberG: 0 })],
      }),
      makeFoodLog({
        mealSlot: 'dinner',
        items: [
          makeFoodItem({ name: 'Rice', kcal: 260, proteinG: 5, carbsG: 56, fatG: 1, fiberG: 1 }),
          makeFoodItem({ name: 'Dal', kcal: 180, proteinG: 12, carbsG: 25, fatG: 3, fiberG: 8 }),
        ],
      }),
    ];
    expect(sumConsumed(logs)).toEqual({
      kcal: 770,
      proteinG: 79,
      carbsG: 81,
      fatG: 11,
      fiberG: 9,
    });
  });
});

describe('buildDayNutrition — idea.md §19', () => {
  it('reports consumed, signed remaining and the meal count', () => {
    const targets = makeTargets({ kcal: 2600, proteinG: 150 });
    const day = buildDayNutrition({
      date: '2026-09-10',
      targets,
      logs: [
        makeFoodLog({
          mealSlot: 'lunch',
          items: [makeFoodItem({ kcal: 700, proteinG: 60, carbsG: 60, fatG: 20, fiberG: 6 })],
        }),
        makeFoodLog({
          mealSlot: 'dinner',
          items: [makeFoodItem({ kcal: 900, proteinG: 55, carbsG: 90, fatG: 25, fiberG: 8 })],
        }),
      ],
    });

    expect(day.consumed.kcal).toBe(1600);
    expect(day.remaining.kcal).toBe(1000);
    expect(day.remaining.proteinG).toBe(35);
    expect(day.mealsLogged).toBe(2);
    expect(day.targets).toBe(targets);
  });

  it('stores remaining signed when the user goes over', () => {
    const day = buildDayNutrition({
      date: '2026-09-10',
      targets: makeTargets({ kcal: 2000 }),
      logs: [makeFoodLog({ items: [makeFoodItem({ kcal: 2400 })] })],
    });
    expect(day.remaining.kcal).toBe(-400);
    expect(clampMacros(day.remaining).kcal).toBe(0);
  });

  it('counts distinct meal slots, not log rows', () => {
    const day = buildDayNutrition({
      date: '2026-09-10',
      targets: null,
      logs: [makeFoodLog({ mealSlot: 'snack' }), makeFoodLog({ mealSlot: 'snack' })],
    });
    expect(day.mealsLogged).toBe(1);
  });

  it('zeroes remaining when there are no targets', () => {
    const day = buildDayNutrition({ date: '2026-09-10', targets: null, logs: [] });
    expect(day.targets).toBeNull();
    expect(day.remaining).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 });
  });

  it('resolves the active target row from the full history', () => {
    const older = makeTargets({ effectiveFrom: '2026-01-01', kcal: 2400 });
    const newer = makeTargets({ effectiveFrom: '2026-09-01', kcal: 2600 });
    const future = makeTargets({ effectiveFrom: '2026-12-01', kcal: 3000 });

    expect(activeTargetsFor('2026-09-10', [older, newer, future])).toBe(newer);
    expect(activeTargetsFor('2026-02-01', [older, newer, future])).toBe(older);
    expect(activeTargetsFor('2025-01-01', [older, newer, future])).toBeNull();

    const day = buildDayNutrition({
      date: '2026-09-10',
      logs: [],
      allTargets: [older, newer, future],
    });
    expect(day.targets?.kcal).toBe(2600);
  });
});

describe('Mifflin-St Jeor — DESIGN.md §5.6', () => {
  it('uses +5 for male and −161 for female', () => {
    const base = { weightKg: 80, heightCm: 180, ageYears: 30 };
    expect(mifflinStJeorBmr({ ...base, sex: 'male' })).toBe(1780);
    expect(mifflinStJeorBmr({ ...base, sex: 'female' })).toBe(1614);
  });

  it('uses the midpoint constant when sex is unspecified', () => {
    const base = { weightKg: 80, heightCm: 180, ageYears: 30 };
    expect(mifflinStJeorBmr({ ...base, sex: null })).toBe(1697);
    expect(mifflinStJeorBmr({ ...base, sex: 'prefer_not_to_say' })).toBe(1697);
  });
});

describe('computeInitialNutritionTargets — DESIGN.md §5.6', () => {
  const profile = makeProfile({
    sex: 'male',
    weightKg: 80,
    heightCm: 180,
    birthDate: '1996-09-10',
    activityLevel: 'moderate',
  });

  it('derives kcal from BMR × activity with no goal adjustment', () => {
    const result = computeInitialNutritionTargets({
      profile,
      goals: [makeGoal({ type: 'general', priority: 1 })],
      date: '2026-09-10',
    });

    const bmr = mifflinStJeorBmr({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 });
    expect(result.targets?.kcal).toBe(Math.round((bmr * ACTIVITY_MULTIPLIERS.moderate) / 10) * 10);
    expect(result.rationale.codes).toContain('MIFFLIN_ST_JEOR');
    expect(result.rationale.facts.ageYears).toBe(30);
  });

  it('cuts 20 % for fat loss and adds 10 % for hypertrophy', () => {
    const base = computeInitialNutritionTargets({
      profile,
      goals: [makeGoal({ type: 'general', priority: 1 })],
      date: '2026-09-10',
    }).targets as NonNullable<ReturnType<typeof computeInitialNutritionTargets>['targets']>;

    const cut = computeInitialNutritionTargets({
      profile,
      goals: [makeGoal({ type: 'fat_loss', priority: 1 })],
      date: '2026-09-10',
    }).targets;
    const bulk = computeInitialNutritionTargets({
      profile,
      goals: [makeGoal({ type: 'hypertrophy', priority: 1 })],
      date: '2026-09-10',
    }).targets;

    expect((cut as NonNullable<typeof cut>).kcal).toBeLessThan(base.kcal);
    expect((bulk as NonNullable<typeof bulk>).kcal).toBeGreaterThan(base.kcal);
    expect((cut as NonNullable<typeof cut>).kcal / base.kcal).toBeCloseTo(0.8, 2);
    expect((bulk as NonNullable<typeof bulk>).kcal / base.kcal).toBeCloseTo(1.1, 2);
  });

  it('sets protein at 1.8 g/kg, fat at 25 % of kcal and fiber at 14 g per 1000 kcal', () => {
    const result = computeInitialNutritionTargets({
      profile,
      goals: [makeGoal({ type: 'general', priority: 1 })],
      date: '2026-09-10',
    });
    const targets = result.targets as NonNullable<typeof result.targets>;

    expect(targets.proteinG).toBe(Math.round(80 * PROTEIN_G_PER_KG));
    expect(targets.fatG).toBe(Math.round((targets.kcal * 0.25) / 9));
    expect(targets.fiberG).toBe(Math.round((targets.kcal / 1000) * FIBER_G_PER_1000_KCAL));
    // Carbs take whatever kcal is left.
    expect(targets.proteinG * 4 + targets.carbsG * 4 + targets.fatG * 9).toBeCloseTo(
      targets.kcal,
      -1,
    );
    expect(targets.source).toBe('computed');
    expect(targets.effectiveFrom).toBe('2026-09-10');
  });

  it('honours goal priority', () => {
    const result = computeInitialNutritionTargets({
      profile,
      goals: [
        makeGoal({ type: 'hypertrophy', priority: 3 }),
        makeGoal({ type: 'fat_loss', priority: 1 }),
      ],
      date: '2026-09-10',
    });
    expect(result.rationale.codes).toContain('GOAL_FAT_LOSS');
  });

  it('falls back to a documented default age with no birth date', () => {
    const result = computeInitialNutritionTargets({
      profile: makeProfile({ ...profile, birthDate: null }),
      goals: [],
      date: '2026-09-10',
    });
    expect(result.rationale.facts.ageYears).toBe(DEFAULT_AGE_YEARS);
    expect(result.rationale.facts.ageSource).toBe('default');
    expect(result.rationale.codes).toContain('GOAL_NONE');
  });

  it('refuses to guess without height and weight', () => {
    const result = computeInitialNutritionTargets({
      profile: makeProfile({ weightKg: null }),
      goals: [],
      date: '2026-09-10',
    });
    expect(result.targets).toBeNull();
    expect(result.rationale.codes).toEqual(['PROFILE_INCOMPLETE']);
  });
});

describe('progressAgainstTarget', () => {
  it('returns a ratio, or null with no target', () => {
    expect(progressAgainstTarget(75, 150)).toBe(0.5);
    expect(progressAgainstTarget(200, 150)).toBeCloseTo(1.3333, 3);
    expect(progressAgainstTarget(75, null)).toBeNull();
    expect(progressAgainstTarget(75, 0)).toBeNull();
  });
});
