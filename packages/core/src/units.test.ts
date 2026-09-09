import { describe, expect, it } from 'vitest';

import {
  BAND_LADDER_KG,
  CM_PER_IN,
  DEFAULT_LOAD_INCREMENT_KG,
  KETTLEBELL_LADDER_KG,
  KG_PER_LB,
  displayLoggedLoad,
  formatBodyWeight,
  formatLoad,
  formatLoggedLoad,
  formatNumber,
  fromInput,
  loggedLoadStepKg,
  nextLadderStep,
  previousLadderStep,
  resolveLoadIncrementKg,
  roundLoadKgToAchievable,
  roundTo,
  roundToIncrement,
  toDisplay,
  unitLabel,
} from './units';

const LB = (pounds: number): number => pounds * KG_PER_LB;

describe('roundTo / roundToIncrement', () => {
  it('kills float noise', () => {
    expect(roundTo(0.1 + 0.2, 2)).toBe(0.3);
    expect(roundTo(-0.1 - 0.2, 2)).toBe(-0.3);
  });

  it('snaps to the nearest multiple of the increment', () => {
    expect(roundToIncrement(61.2, 2.5)).toBe(60);
    expect(roundToIncrement(61.5, 2.5)).toBe(62.5);
    expect(roundToIncrement(61.2, 0)).toBe(61.2);
  });
});

describe('toDisplay — DESIGN.md §5.10', () => {
  it('shows body weight to 0.1 in both systems', () => {
    expect(toDisplay(80.44, 'weight', 'metric')).toBe(80.4);
    expect(toDisplay(LB(176.4), 'weight', 'imperial')).toBe(176.4);
  });

  it('shows length in cm or inches', () => {
    expect(toDisplay(178, 'length', 'metric')).toBe(178);
    expect(toDisplay(2 * CM_PER_IN, 'length', 'imperial')).toBe(2);
  });

  it('rounds load to the increment the user can actually load', () => {
    expect(toDisplay(61.6, 'load', 'metric', { incrementKg: 2.5 })).toBe(62.5);
    expect(toDisplay(LB(24), 'load', 'imperial', { incrementKg: LB(5) })).toBe(25);
  });

  it('falls back to a sensible step with no increment', () => {
    expect(toDisplay(61.3, 'load', 'metric')).toBe(61.5);
    expect(toDisplay(LB(21.6), 'load', 'imperial')).toBe(22.5);
  });
});

describe('fromInput', () => {
  it('converts what the user typed to canonical metric', () => {
    expect(fromInput(80, 'weight', 'metric')).toBe(80);
    expect(fromInput(100, 'load', 'imperial')).toBeCloseTo(45.359237, 5);
    expect(fromInput(70, 'length', 'imperial')).toBeCloseTo(177.8, 5);
  });

  it('round-trips through toDisplay', () => {
    const stored = fromInput(185, 'load', 'imperial');
    expect(toDisplay(stored, 'load', 'imperial', { incrementKg: LB(5) })).toBe(185);
  });
});

describe('load increment table — DESIGN.md §5.1', () => {
  it('uses the metric defaults per category', () => {
    expect(resolveLoadIncrementKg({ category: 'barbell', unitSystem: 'metric' })).toBe(2.5);
    expect(resolveLoadIncrementKg({ category: 'dumbbell', unitSystem: 'metric' })).toBe(2);
    expect(resolveLoadIncrementKg({ category: 'machine', unitSystem: 'metric' })).toBe(5);
    expect(DEFAULT_LOAD_INCREMENT_KG.barbell).toBe(2.5);
  });

  it('uses 5 lb / 5 lb / 10 lb in imperial profiles, stored in kg', () => {
    expect(resolveLoadIncrementKg({ category: 'barbell', unitSystem: 'imperial' })).toBeCloseTo(
      LB(5),
      6,
    );
    expect(resolveLoadIncrementKg({ category: 'dumbbell', unitSystem: 'imperial' })).toBeCloseTo(
      LB(5),
      6,
    );
    expect(resolveLoadIncrementKg({ category: 'machine', unitSystem: 'imperial' })).toBeCloseTo(
      LB(10),
      6,
    );
  });

  it('walks the kettlebell ladder rather than adding a fixed step', () => {
    expect(
      resolveLoadIncrementKg({ category: 'kettlebell', unitSystem: 'metric', currentLoadKg: 16 }),
    ).toBe(4);
    expect(
      resolveLoadIncrementKg({ category: 'kettlebell', unitSystem: 'metric', currentLoadKg: 8 }),
    ).toBe(2);
  });

  it('walks the band ladder', () => {
    expect(
      resolveLoadIncrementKg({ category: 'band', unitSystem: 'metric', currentLoadKg: 35 }),
    ).toBe(10);
  });

  it('lets an equipment row override the category default', () => {
    expect(
      resolveLoadIncrementKg({ category: 'barbell', unitSystem: 'metric', overrideKg: 1.25 }),
    ).toBe(1.25);
  });

  it('falls back when the category is unknown', () => {
    expect(resolveLoadIncrementKg({ category: null, unitSystem: 'metric' })).toBe(2.5);
    expect(resolveLoadIncrementKg({ category: null, unitSystem: 'imperial' })).toBeCloseTo(
      LB(5),
      6,
    );
    expect(resolveLoadIncrementKg({ category: 'bodyweight', unitSystem: 'metric' })).toBe(2.5);
  });
});

describe('ladders', () => {
  it('finds the next and previous rung', () => {
    expect(nextLadderStep(KETTLEBELL_LADDER_KG, 12)).toBe(16);
    expect(previousLadderStep(KETTLEBELL_LADDER_KG, 16)).toBe(12);
    expect(previousLadderStep(BAND_LADDER_KG, 5)).toBe(5);
  });

  it('keeps the last gap past the top of the ladder', () => {
    expect(nextLadderStep(KETTLEBELL_LADDER_KG, 48)).toBe(52);
  });
});

describe('imperial rounding helper', () => {
  it('keeps 25 lb exactly 25 lb through a metric round trip', () => {
    const raw = LB(20) + LB(5);
    const snapped = roundLoadKgToAchievable(raw, 'imperial', LB(5));
    expect(toDisplay(snapped, 'load', 'imperial', { incrementKg: LB(5) })).toBe(25);
  });

  it('snaps an awkward kg value to the plate step', () => {
    expect(roundLoadKgToAchievable(61.3, 'metric', 2.5)).toBe(62.5);
  });

  it('uses a default step when the increment is missing', () => {
    expect(roundLoadKgToAchievable(61.3, 'metric', 0)).toBe(61.5);
    expect(toDisplay(roundLoadKgToAchievable(LB(21.6), 'imperial', 0), 'load', 'imperial')).toBe(
      22.5,
    );
  });
});

describe('formatting', () => {
  it('labels units per system', () => {
    expect(unitLabel('load', 'metric')).toBe('kg');
    expect(unitLabel('load', 'imperial')).toBe('lb');
    expect(unitLabel('length', 'metric')).toBe('cm');
    expect(unitLabel('length', 'imperial')).toBe('in');
  });

  it('formats numbers without trailing zeros', () => {
    expect(formatNumber(25)).toBe('25');
    expect(formatNumber(2.5)).toBe('2.5');
  });

  it('formats load and body weight for rationale summaries', () => {
    expect(formatLoad(LB(25), 'imperial', LB(5))).toBe('25 lb');
    expect(formatLoad(60, 'metric', 2.5)).toBe('60 kg');
    expect(formatBodyWeight(80.44, 'metric')).toBe('80.4 kg');
  });
});

describe('a logged load round-trips — DESIGN.md §5.10', () => {
  it('reads back exactly what an imperial user typed, not the progression step', () => {
    for (const typed of [22.5, 27.5, 52.5, 137.5, 45, 12.5]) {
      const stored = fromInput(typed, 'load', 'imperial');
      expect(displayLoggedLoad(stored, 'imperial')).toBe(typed);
      // The 5 lb progression increment would have snapped these to 20/25/50/135.
      expect(formatLoggedLoad(stored, 'imperial')).toBe(`${formatNumber(typed)} lb`);
    }
  });

  it('reads back exactly what a metric user typed', () => {
    for (const typed of [61, 62.5, 22.5, 100.1]) {
      const stored = fromInput(typed, 'load', 'metric');
      expect(displayLoggedLoad(stored, 'metric')).toBe(typed);
    }
  });

  it('still snaps a prescribed load to something loadable', () => {
    // The engines' own output keeps the §5.10 plate rounding.
    expect(toDisplay(LB(22.5), 'load', 'imperial', { incrementKg: LB(5) })).toBe(25);
    expect(displayLoggedLoad(LB(22.5), 'imperial')).toBe(22.5);
  });

  it('uses a finer step than the plate default', () => {
    expect(loggedLoadStepKg('metric')).toBe(0.1);
    expect(loggedLoadStepKg('imperial')).toBeCloseTo(0.5 * KG_PER_LB, 6);
  });
});
