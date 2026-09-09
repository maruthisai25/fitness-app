import type { EquipmentCategory, MovementPattern } from '@vigor/core';
import { describe, expect, it } from 'vitest';

import { getExercise, loadSeed, neighbors, validate } from './index';

const MOVEMENT_PATTERNS: MovementPattern[] = [
  'squat',
  'hinge',
  'lunge',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'carry',
  'core',
  'isolation',
  'cardio',
  'mobility',
];

const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'band',
  'machine',
  'cable',
  'bodyweight',
  'cardio',
  'other',
];

describe('loadSeed', () => {
  it('loads at least 200 exercises and 300 relations', () => {
    const seed = loadSeed();
    expect(seed.exercises.length).toBeGreaterThanOrEqual(200);
    expect(seed.relations.length).toBeGreaterThanOrEqual(300);
  });

  it('is cached across calls (same reference)', () => {
    expect(loadSeed()).toBe(loadSeed());
  });
});

describe('validate', () => {
  it('reports the seed as valid', () => {
    const result = validate();
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('finds no duplicate slugs', () => {
    const { exercises } = loadSeed();
    const slugs = exercises.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('finds no duplicate ids', () => {
    const { exercises } = loadSeed();
    const ids = exercises.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every relation references an existing exercise id on both ends', () => {
    const { exercises, relations } = loadSeed();
    const ids = new Set(exercises.map((e) => e.id));
    for (const rel of relations) {
      expect(ids.has(rel.fromId)).toBe(true);
      expect(ids.has(rel.toId)).toBe(true);
    }
  });

  it('covers every movement pattern at least 8 times', () => {
    const { exercises } = loadSeed();
    for (const pattern of MOVEMENT_PATTERNS) {
      const count = exercises.filter((e) => e.movementPattern === pattern).length;
      expect(count, `pattern ${pattern}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('covers every equipment category at least 8 times', () => {
    const { exercises } = loadSeed();
    for (const category of EQUIPMENT_CATEGORIES) {
      const count = exercises.filter((e) => e.equipment.includes(category)).length;
      expect(count, `equipment ${category}`).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('getExercise', () => {
  it('finds a known seed exercise by id', () => {
    const squat = getExercise('ex_barbell_back_squat');
    expect(squat?.name).toBe('Barbell Back Squat');
    expect(squat?.movementPattern).toBe('squat');
  });

  it('returns undefined for an unknown id', () => {
    expect(getExercise('ex_does_not_exist')).toBeUndefined();
  });
});

describe('neighbors', () => {
  it('walks the push-up progression chain', () => {
    const progressions = neighbors('ex_push_up', 'progression');
    expect(progressions.map((e) => e.id)).toContain('ex_decline_push_up');
  });

  it('walks the push-up regression chain the other way', () => {
    const regressions = neighbors('ex_push_up', 'regression');
    expect(regressions.map((e) => e.id)).toContain('ex_incline_push_up');
  });

  it('returns substitution alternatives for a barbell lift with no equipment', () => {
    const subs = neighbors('ex_barbell_back_squat', 'substitution');
    expect(subs.map((e) => e.id)).toContain('ex_goblet_squat');
  });

  it('returns every relation kind when no kind filter is given', () => {
    const all = neighbors('ex_push_up');
    const withKind = [
      ...neighbors('ex_push_up', 'progression'),
      ...neighbors('ex_push_up', 'regression'),
      ...neighbors('ex_push_up', 'variation'),
      ...neighbors('ex_push_up', 'substitution'),
    ];
    expect(all.length).toBe(withKind.length);
  });

  it('returns an empty array for an exercise with no relations', () => {
    // every seeded exercise should have at least one relation, so assert on
    // a made-up id instead of asserting the seed's own shape here.
    expect(neighbors('ex_does_not_exist')).toEqual([]);
  });
});
