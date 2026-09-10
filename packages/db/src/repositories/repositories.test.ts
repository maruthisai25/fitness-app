/**
 * Create / read / update coverage for every repository that does not have a
 * dedicated file (workouts, nutrition, memories and export/import do).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '../testing';
import { DEFAULT_LOAD_INCREMENT_KG } from './equipment';
import { DEFAULT_SETTINGS } from './settings';
import { RowNotFoundError } from './support';

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase({ start: '2026-04-01T07:00:00.000Z' });
});

afterEach(async () => {
  await db.close();
});

describe('profile', () => {
  it('starts empty, fills defaults on save and patches on update', async () => {
    expect(await db.repos.profile.get()).toBeNull();

    const saved = await db.repos.profile.save({ displayName: 'Onboarding user' });
    expect(saved.fitnessLevel).toBe('beginner');
    expect(saved.unitSystem).toBe('metric');
    expect(saved.foodRegion).toBe('generic');
    expect(saved.preferredStyles).toEqual([]);

    const updated = await db.repos.profile.update({ unitSystem: 'imperial', heightCm: 180 });
    expect(updated.id).toBe(saved.id);
    expect(updated.unitSystem).toBe('imperial');
    expect(updated.heightCm).toBe(180);
    expect(updated.displayName).toBe('Onboarding user');
    expect(updated.updatedAt > saved.updatedAt).toBe(true);

    expect(await db.repos.profile.get()).toEqual(updated);
  });

  it('stays a single row across repeated saves', async () => {
    await db.repos.profile.save({ displayName: 'First' });
    const second = await db.repos.profile.save({ displayName: 'Second', weightKg: 70 });

    const current = await db.repos.profile.get();
    expect(current).toEqual(second);
    expect(current?.displayName).toBe('Second');
  });
});

describe('goals', () => {
  it('creates active by default and hides deactivated goals from listActive', async () => {
    const strength = await db.repos.goals.create({ type: 'strength', priority: 1 });
    const mobility = await db.repos.goals.create({ type: 'mobility', priority: 2 });
    expect(strength.active).toBe(true);

    expect((await db.repos.goals.listActive()).map((goal) => goal.type)).toEqual([
      'strength',
      'mobility',
    ]);

    const paused = await db.repos.goals.setActive(mobility.id, false);
    expect(paused.active).toBe(false);
    expect((await db.repos.goals.listActive()).map((goal) => goal.type)).toEqual(['strength']);
    expect(await db.repos.goals.list({ includeInactive: true })).toHaveLength(2);

    const renamed = await db.repos.goals.update(strength.id, { targetNote: 'Bench 100 kg' });
    expect(renamed.targetNote).toBe('Bench 100 kg');
    expect(await db.repos.goals.get(strength.id)).toEqual(renamed);
  });
});

describe('equipment', () => {
  it('applies the DESIGN.md §5.1 default increment per category', async () => {
    const barbell = await db.repos.equipment.create({ name: 'Barbell', category: 'barbell' });
    const band = await db.repos.equipment.create({ name: 'Loop band', category: 'band' });
    const custom = await db.repos.equipment.create({
      name: 'Micro plates',
      category: 'barbell',
      loadIncrementKg: 0.5,
    });

    expect(barbell.loadIncrementKg).toBe(DEFAULT_LOAD_INCREMENT_KG.barbell);
    expect(band.loadIncrementKg).toBeNull();
    expect(custom.loadIncrementKg).toBe(0.5);

    const away = await db.repos.equipment.setAvailable(barbell.id, false);
    expect(away.available).toBe(false);
    expect((await db.repos.equipment.listAvailable()).map((row) => row.name)).toEqual([
      'Loop band',
      'Micro plates',
    ]);
    expect(await db.repos.equipment.getMany([barbell.id, band.id])).toHaveLength(2);
  });
});

describe('targets', () => {
  it('returns the effective-dated row in force on a given day', async () => {
    await db.repos.targets.create({
      effectiveFrom: '2026-01-01',
      kcal: 2200,
      proteinG: 150,
      carbsG: 220,
      fatG: 65,
      fiberG: 31,
    });
    const cut = await db.repos.targets.create({
      effectiveFrom: '2026-04-01',
      kcal: 1900,
      proteinG: 160,
      carbsG: 160,
      fatG: 55,
      fiberG: 27,
      source: 'computed',
    });

    expect((await db.repos.targets.getActive('2026-03-31'))?.kcal).toBe(2200);
    expect((await db.repos.targets.getActive('2026-04-01'))?.kcal).toBe(1900);
    expect(await db.repos.targets.getActive('2025-12-31')).toBeNull();

    const corrected = await db.repos.targets.update(cut.id, { proteinG: 170 });
    expect(corrected.proteinG).toBe(170);
    expect(corrected.source).toBe('computed');
    expect((await db.repos.targets.list())[0]?.id).toBe(cut.id);
  });
});

describe('settings', () => {
  it('reads DESIGN.md §6.1 defaults before anything is written', async () => {
    expect(await db.repos.settings.getAll()).toEqual(DEFAULT_SETTINGS);
    expect(await db.repos.settings.get('coachModel')).toBe('claude-opus-5');
    expect(await db.repos.settings.get('fastModel')).toBe('claude-haiku-4-5');
  });

  it('round-trips typed values through the key/value table', async () => {
    await db.repos.settings.set('notificationsEnabled', true);
    await db.repos.settings.set('reminderTimes', {
      workout: '07:00',
      missedWorkout: '08:00',
      mealLog: '13:00',
      protein: '18:00',
      weeklyReview: null,
      measurement: null,
    });
    const all = await db.repos.settings.setMany({ weekStartsOn: 0, onboardingComplete: true });

    expect(all.notificationsEnabled).toBe(true);
    expect(all.reminderTimes.workout).toBe('07:00');
    expect(all.reminderTimes.missedWorkout).toBe('08:00');
    expect(all.reminderTimes.weeklyReview).toBeNull();
    expect(all.weekStartsOn).toBe(0);
    expect(all.onboardingComplete).toBe(true);
    expect(all.coachModel).toBe(DEFAULT_SETTINGS.coachModel);

    await db.repos.settings.reset('weekStartsOn');
    expect(await db.repos.settings.get('weekStartsOn')).toBe(DEFAULT_SETTINGS.weekStartsOn);
  });

  it('keeps the times a settings row written before the §24 slots existed carries', async () => {
    // Exactly what a `reminderTimes` row looked like before `missedWorkout` and
    // `measurement` were added. Losing the user's four chosen times over two
    // new keys would be the worst possible upgrade.
    await db.repos.settings.putEntries([
      {
        key: 'reminderTimes',
        value: JSON.stringify({
          workout: '07:00',
          mealLog: '13:00',
          protein: '18:00',
          weeklyReview: '19:00',
        }),
      },
    ]);

    const times = await db.repos.settings.get('reminderTimes');
    expect(times.workout).toBe('07:00');
    expect(times.mealLog).toBe('13:00');
    expect(times.protein).toBe('18:00');
    expect(times.weeklyReview).toBe('19:00');
    expect(times.missedWorkout).toBeNull();
    expect(times.measurement).toBeNull();
  });

  it('rejects a value that does not match the settings schema', async () => {
    await expect(db.repos.settings.set('weekStartsOn', 9 as unknown as 0)).rejects.toThrow();
  });

  it('falls back to the default when a stored value is corrupt', async () => {
    await db.repos.settings.putEntries([{ key: 'notificationsEnabled', value: 'not json' }]);
    expect(await db.repos.settings.get('notificationsEnabled')).toBe(false);
    expect((await db.repos.settings.getAll()).notificationsEnabled).toBe(false);
  });

  it('refuses unknown keys on a raw write', async () => {
    await expect(
      db.repos.settings.putEntries([{ key: 'somethingElse', value: '1' }]),
    ).rejects.toThrow(/unknown key/);
  });
});

describe('exercises', () => {
  it('creates with library defaults, reads by slug and updates', async () => {
    const created = await db.repos.exercises.create({
      name: 'Goblet squat',
      slug: 'goblet-squat',
      movementPattern: 'squat',
      primaryMuscles: ['quads', 'glutes'],
      equipment: ['kettlebell'],
    });

    expect(created.isCustom).toBe(true);
    expect(created.difficulty).toBe(3);
    expect(created.defaultRepRange).toEqual({ min: 8, max: 12 });
    expect(created.archived).toBe(false);

    expect(await db.repos.exercises.getBySlug('goblet-squat')).toEqual(created);

    const updated = await db.repos.exercises.update(created.id, {
      difficulty: 2,
      cues: ['elbows inside the knees'],
    });
    expect(updated.difficulty).toBe(2);
    expect(updated.cues).toEqual(['elbows inside the knees']);

    const archived = await db.repos.exercises.setArchived(created.id, true);
    expect(archived.archived).toBe(true);
    expect(await db.repos.exercises.list()).toEqual([]);
    expect(await db.repos.exercises.list({ includeArchived: true })).toHaveLength(1);
  });

  it('searches by pattern, muscle, equipment and name', async () => {
    await db.repos.exercises.createMany([
      {
        name: 'Barbell row',
        slug: 'barbell-row',
        movementPattern: 'horizontal_pull',
        primaryMuscles: ['lats'],
        secondaryMuscles: ['biceps'],
        equipment: ['barbell'],
      },
      {
        name: 'Chin-up',
        slug: 'chin-up',
        movementPattern: 'vertical_pull',
        primaryMuscles: ['lats'],
        secondaryMuscles: ['biceps'],
        equipment: ['bodyweight'],
      },
      {
        name: 'Overhead press',
        slug: 'overhead-press',
        movementPattern: 'vertical_push',
        primaryMuscles: ['shoulders'],
        equipment: ['barbell'],
      },
    ]);

    expect(
      (await db.repos.exercises.search({ pattern: 'vertical_pull' })).map((e) => e.slug),
    ).toEqual(['chin-up']);
    expect((await db.repos.exercises.search({ muscle: 'lats' })).map((e) => e.slug)).toEqual([
      'barbell-row',
      'chin-up',
    ]);
    expect((await db.repos.exercises.search({ muscle: 'biceps' })).map((e) => e.slug)).toEqual([
      'barbell-row',
      'chin-up',
    ]);
    expect(
      (await db.repos.exercises.search({ equipment: ['barbell'] })).map((e) => e.slug),
    ).toEqual(['barbell-row', 'overhead-press']);
    expect((await db.repos.exercises.search({ query: 'press' })).map((e) => e.slug)).toEqual([
      'overhead-press',
    ]);
  });

  it('skips slugs it already has on a bulk seed', async () => {
    const base = {
      name: 'Plank',
      slug: 'plank',
      movementPattern: 'core' as const,
    };
    expect(await db.repos.exercises.createMany([base])).toHaveLength(1);
    expect(await db.repos.exercises.createMany([base])).toHaveLength(0);
    expect(await db.repos.exercises.list()).toHaveLength(1);
  });

  it('stores and reads the substitution graph', async () => {
    const [press, pushUp] = await db.repos.exercises.createMany([
      { name: 'Bench press', slug: 'bench-press', movementPattern: 'horizontal_push' },
      { name: 'Push-up', slug: 'push-up', movementPattern: 'horizontal_push' },
    ]);

    await db.repos.exercises.addRelation({
      fromId: press!.id,
      toId: pushUp!.id,
      kind: 'regression',
      note: 'No equipment.',
    });

    const related = await db.repos.exercises.getRelated(press!.id, 'regression');
    expect(related.map((row) => row.slug)).toEqual(['push-up']);
    expect(await db.repos.exercises.getRelated(press!.id, 'progression')).toEqual([]);

    // Re-adding the same edge updates the note instead of duplicating it.
    await db.repos.exercises.addRelation({
      fromId: press!.id,
      toId: pushUp!.id,
      kind: 'regression',
      note: 'Same pattern, bodyweight.',
    });
    const edges = await db.repos.exercises.listRelations(press!.id);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.note).toBe('Same pattern, bodyweight.');

    await db.repos.exercises.removeRelation(press!.id, pushUp!.id, 'regression');
    expect(await db.repos.exercises.listRelations(press!.id)).toEqual([]);
  });
});

describe('records', () => {
  it('creates, reads the best of a kind and updates', async () => {
    const [exercise] = await db.repos.exercises.createMany([
      { name: 'Front squat', slug: 'front-squat', movementPattern: 'squat' },
    ]);

    await db.repos.records.create({
      exerciseId: exercise!.id,
      kind: 'e1rm',
      value: 100,
      loadKg: 80,
      reps: 8,
      date: '2026-03-01',
    });
    const newer = await db.repos.records.create({
      exerciseId: exercise!.id,
      kind: 'e1rm',
      value: 110,
      loadKg: 85,
      reps: 9,
      date: '2026-03-15',
    });
    await db.repos.records.create({
      exerciseId: exercise!.id,
      kind: 'max_load',
      value: 95,
      loadKg: 95,
      reps: 1,
      date: '2026-03-20',
    });

    expect((await db.repos.records.getBest(exercise!.id, 'e1rm'))?.value).toBe(110);
    expect((await db.repos.records.getBest(exercise!.id, 'max_load'))?.value).toBe(95);
    expect(await db.repos.records.listForExercise(exercise!.id, { kind: 'e1rm' })).toHaveLength(2);
    expect((await db.repos.records.listForExercise(exercise!.id))[0]?.kind).toBe('max_load');

    const corrected = await db.repos.records.update(newer.id, { value: 112 });
    expect(corrected.value).toBe(112);
    expect(await db.repos.records.get(newer.id)).toEqual(corrected);
    expect(await db.repos.records.listRange({ from: '2026-03-10', to: '2026-03-16' })).toHaveLength(
      1,
    );
  });
});

describe('readiness', () => {
  it('keeps one row per day and merges partial check-ins', async () => {
    const morning = await db.repos.readiness.upsertForDate('2026-04-02', {
      sleepHours: 6.5,
      sleepQuality: 3,
    });
    expect(morning.painReported).toBe(false);
    expect(morning.energy).toBeNull();

    const later = await db.repos.readiness.upsertForDate('2026-04-02', { energy: 4, fatigue: 2 });
    expect(later.id).toBe(morning.id);
    expect(later.sleepHours).toBe(6.5);
    expect(later.energy).toBe(4);

    const scored = await db.repos.readiness.setScore(later.id, 71);
    expect(scored.score).toBe(71);
    expect(await db.repos.readiness.getByDate('2026-04-02')).toEqual(scored);

    await db.repos.readiness.upsertForDate('2026-04-03', { painReported: true, painNote: 'knee' });
    expect((await db.repos.readiness.latest())?.date).toBe('2026-04-03');
    expect((await db.repos.readiness.latest('2026-04-02'))?.date).toBe('2026-04-02');
    expect(
      await db.repos.readiness.listRange({ from: '2026-04-01', to: '2026-04-30' }),
    ).toHaveLength(2);
  });
});

describe('body', () => {
  it('keeps one metric row per day and updates it', async () => {
    const first = await db.repos.body.upsertMetric({ date: '2026-04-05', weightKg: 75.4 });
    expect(first.measurements).toEqual({});

    const merged = await db.repos.body.upsertMetric({
      date: '2026-04-05',
      waistCm: 83,
      measurements: { chestCm: 101 },
    });
    expect(merged.id).toBe(first.id);
    expect(merged.weightKg).toBe(75.4);
    expect(merged.measurements).toEqual({ chestCm: 101 });

    const corrected = await db.repos.body.updateMetric(first.id, { weightKg: 75.2 });
    expect(corrected.weightKg).toBe(75.2);
    expect((await db.repos.body.latestMetric())?.id).toBe(first.id);
    expect(await db.repos.body.getMetricByDate('2026-04-05')).toEqual(corrected);
  });

  it('stores photos by date and view', async () => {
    await db.repos.body.addPhoto({
      date: '2026-04-05',
      view: 'front',
      fileRef: 'photos/2026-04-05-front.jpg',
    });
    const side = await db.repos.body.addPhoto({
      date: '2026-04-05',
      view: 'side',
      fileRef: 'photos/2026-04-05-side.jpg',
    });

    expect(await db.repos.body.listPhotos()).toHaveLength(2);
    expect((await db.repos.body.listPhotos({ view: 'side' }))[0]?.id).toBe(side.id);

    const noted = await db.repos.body.updatePhoto(side.id, { note: 'morning, fasted' });
    expect(noted.note).toBe('morning, fasted');

    await db.repos.body.removePhoto(side.id);
    expect(await db.repos.body.listPhotos()).toHaveLength(1);
  });
});

describe('savedMeals', () => {
  it('derives macros from items and counts how often it is logged', async () => {
    const meal = await db.repos.savedMeals.create({
      name: 'Chicken rice bowl',
      items: [
        {
          name: 'chicken',
          quantity: 200,
          unit: 'g',
          kcal: 330,
          proteinG: 62,
          carbsG: 0,
          fatG: 7,
          fiberG: 0,
          confidence: 1,
          savedMealId: null,
        },
        {
          name: 'rice',
          quantity: 200,
          unit: 'g',
          kcal: 260,
          proteinG: 5,
          carbsG: 56,
          fatG: 1,
          fiberG: 2,
          confidence: 1,
          savedMealId: null,
        },
      ],
    });

    expect(meal.kcal).toBe(590);
    expect(meal.proteinG).toBe(67);
    expect(meal.timesLogged).toBe(0);
    expect(meal.lastLoggedAt).toBeNull();

    const logged = await db.repos.savedMeals.markLogged(meal.id);
    expect(logged.timesLogged).toBe(1);
    expect(logged.lastLoggedAt).not.toBeNull();

    const rebuilt = await db.repos.savedMeals.update(meal.id, {
      items: [
        {
          name: 'chicken',
          quantity: 250,
          unit: 'g',
          kcal: 410,
          proteinG: 78,
          carbsG: 0,
          fatG: 9,
          fiberG: 0,
          confidence: 1,
          savedMealId: null,
        },
      ],
    });
    expect(rebuilt.kcal).toBe(410);
    expect(rebuilt.proteinG).toBe(78);
    expect(rebuilt.timesLogged).toBe(1);
    expect(await db.repos.savedMeals.getByName('Chicken rice bowl')).toEqual(rebuilt);
  });
});

describe('inventory', () => {
  it('adds, updates and lists items that need using up', async () => {
    const paneer = await db.repos.inventory.add({
      name: 'Paneer',
      quantity: 200,
      unit: 'g',
      useBy: '2026-04-08',
    });
    await db.repos.inventory.addMany([
      { name: 'Rice', quantity: 1, unit: 'kg' },
      { name: 'Spinach', quantity: 150, unit: 'g', useBy: '2026-04-06', category: 'produce' },
    ]);

    expect(paneer.category).toBeNull();
    expect(await db.repos.inventory.list()).toHaveLength(3);
    expect((await db.repos.inventory.list({ category: 'produce' })).map((i) => i.name)).toEqual([
      'Spinach',
    ]);
    expect((await db.repos.inventory.listExpiringBy('2026-04-07')).map((i) => i.name)).toEqual([
      'Spinach',
    ]);

    const used = await db.repos.inventory.update(paneer.id, { quantity: 100 });
    expect(used.quantity).toBe(100);
    expect(await db.repos.inventory.getByName('Paneer')).toEqual(used);

    await db.repos.inventory.removeMany([paneer.id]);
    expect(await db.repos.inventory.list()).toHaveLength(2);
  });
});

describe('recipes', () => {
  it('creates with defaults, saves and counts how often it is made', async () => {
    const recipe = await db.repos.recipes.create({
      title: 'Paneer bhurji',
      ingredients: [{ name: 'paneer', quantity: 200, unit: 'g', note: null }],
      steps: ['Crumble.', 'Cook.'],
      perServing: { kcal: 420, proteinG: 30, carbsG: 12, fatG: 28, fiberG: 3 },
      tags: ['high-protein', 'vegetarian'],
    });

    expect(recipe.source).toBe('ai');
    expect(recipe.saved).toBe(false);
    expect(recipe.timesMade).toBe(0);
    expect(recipe.servings).toBe(1);

    const saved = await db.repos.recipes.setSaved(recipe.id, true);
    expect(saved.saved).toBe(true);

    const made = await db.repos.recipes.markMade(recipe.id);
    expect(made.timesMade).toBe(1);
    expect(made.lastMadeAt).not.toBeNull();

    expect(await db.repos.recipes.list({ savedOnly: true })).toHaveLength(1);
    expect((await db.repos.recipes.list({ tag: 'vegetarian' })).map((r) => r.title)).toEqual([
      'Paneer bhurji',
    ]);
    expect(await db.repos.recipes.list({ tag: 'vegan' })).toEqual([]);
  });
});

describe('mealPlans', () => {
  it('derives the day count and finds the plan covering a date', async () => {
    const emptyTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
    const plan = await db.repos.mealPlans.create({
      startDate: '2026-04-06',
      plan: [
        { date: '2026-04-06', meals: [], totals: emptyTotals },
        { date: '2026-04-07', meals: [], totals: emptyTotals },
        { date: '2026-04-08', meals: [], totals: emptyTotals },
      ],
    });

    expect(plan.days).toBe(3);
    expect(plan.constraints.dietary).toEqual([]);

    expect((await db.repos.mealPlans.getForDate('2026-04-07'))?.id).toBe(plan.id);
    expect((await db.repos.mealPlans.getForDate('2026-04-08'))?.id).toBe(plan.id);
    expect(await db.repos.mealPlans.getForDate('2026-04-09')).toBeNull();
    expect(await db.repos.mealPlans.getForDate('2026-04-05')).toBeNull();
    expect((await db.repos.mealPlans.getDayFor('2026-04-07'))?.date).toBe('2026-04-07');

    const updated = await db.repos.mealPlans.update(plan.id, {
      constraints: {
        kcalPerDay: 2200,
        proteinGPerDay: 160,
        dietary: ['vegetarian'],
        excludeIngredients: [],
        maxCookMinutes: 30,
        useInventoryFirst: true,
      },
    });
    expect(updated.constraints.dietary).toEqual(['vegetarian']);
  });
});

describe('insights', () => {
  it('creates a batch, lists the open ones and dismisses', async () => {
    const period = { from: '2026-03-01', to: '2026-03-28' };
    const created = await db.repos.insights.createMany([
      { detector: 'PUSH_PULL_BALANCE', period, headline: 'Pulling is ahead of pushing.' },
      {
        detector: 'PROTEIN_GAP_BY_DAY',
        period,
        headline: 'Protein dips at weekends.',
        severity: 'warning',
      },
    ]);
    expect(created).toHaveLength(2);
    expect(created[0]?.severity).toBe('info');
    expect(created[0]?.dismissed).toBe(false);

    expect(await db.repos.insights.listOpen()).toHaveLength(2);

    const dismissed = await db.repos.insights.dismiss(created[0]!.id);
    expect(dismissed.dismissed).toBe(true);
    expect(await db.repos.insights.listOpen()).toHaveLength(1);
    expect(await db.repos.insights.list({ includeDismissed: true })).toHaveLength(2);
    expect(await db.repos.insights.list({ detector: 'PROTEIN_GAP_BY_DAY' })).toHaveLength(1);

    await db.repos.insights.removeByDetector('PROTEIN_GAP_BY_DAY');
    expect(await db.repos.insights.list({ includeDismissed: true })).toHaveLength(1);
  });
});

describe('reviews', () => {
  const training = {
    workoutsCompleted: 4,
    workoutsPlanned: 5,
    completionRate: 0.8,
    totalSets: 60,
    totalVolumeKg: 17000,
    volumeByMuscleGroup: [{ muscle: 'back', sets: 14, volumeKg: 4200 }],
    personalRecords: [],
    missedSessions: 1,
    averageRpe: 8,
    averageDurationMin: 44,
  };
  const nutrition = {
    daysLogged: 7,
    averageKcal: 2450,
    averageProteinG: 145,
    averageCarbsG: 250,
    averageFatG: 72,
    averageFiberG: 28,
    targetHitRate: { kcal: 0.7, proteinG: 0.5, carbsG: 0.9, fatG: 0.9, fiberG: 0.3 },
    missedTargets: ['proteinG', 'fiberG'],
  };

  it('stores stats first and lets the coach fill the prose later', async () => {
    const review = await db.repos.reviews.upsert({
      weekStart: '2026-03-30',
      training,
      nutrition,
    });

    expect(review.summary).toBeNull();
    expect(review.recommendation).toBeNull();
    expect(review.training.totalVolumeKg).toBe(17000);

    const withProse = await db.repos.reviews.setSummary(review.id, {
      summary: 'You completed 4 of 5 sessions and averaged 145 g of protein.',
      recommendation: 'Hold lower-body volume and add one pulling set next week.',
    });
    expect(withProse.summary).toContain('4 of 5');
    expect(await db.repos.reviews.getByWeek('2026-03-30')).toEqual(withProse);
  });

  it('refreshes stats in place and keeps the prose', async () => {
    const first = await db.repos.reviews.upsert({ weekStart: '2026-03-30', training, nutrition });
    await db.repos.reviews.setSummary(first.id, {
      summary: 'Good week.',
      recommendation: 'Keep going.',
    });

    const second = await db.repos.reviews.upsert({
      weekStart: '2026-03-30',
      training: { ...training, workoutsCompleted: 5, completionRate: 1 },
      nutrition,
    });

    expect(second.id).toBe(first.id);
    expect(second.training.workoutsCompleted).toBe(5);
    expect(second.summary).toBe('Good week.');
    expect(await db.repos.reviews.list()).toHaveLength(1);
  });
});

describe('conversations', () => {
  it('appends turns and moves the conversation to the top of the list', async () => {
    const first = await db.repos.conversations.create({ title: 'Older chat' });
    const second = await db.repos.conversations.create({ title: 'Newer chat' });

    await db.repos.conversations.appendMessage(first.id, {
      role: 'user',
      content: [{ type: 'text', text: 'What did I do last time?' }],
    });
    const reply = await db.repos.conversations.appendMessage(first.id, {
      role: 'assistant',
      content: [{ type: 'text', text: 'Upper A, three sets of eight.' }],
      model: 'claude-opus-5',
      usage: {
        inputTokens: 3200,
        outputTokens: 180,
        cacheCreationInputTokens: null,
        cacheReadInputTokens: 2800,
      },
    });

    expect(reply.usage?.cacheReadInputTokens).toBe(2800);
    expect(await db.repos.conversations.getMessage(reply.id)).toEqual(reply);

    const listed = await db.repos.conversations.list();
    expect(listed.map((row) => row.id)).toEqual([first.id, second.id]);
    expect((await db.repos.conversations.latest())?.id).toBe(first.id);

    const messages = await db.repos.conversations.listMessages(first.id);
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(await db.repos.conversations.listMessages(first.id, { limit: 1 })).toEqual([reply]);

    const renamed = await db.repos.conversations.rename(first.id, 'Last session recap');
    expect(renamed.title).toBe('Last session recap');

    await db.repos.conversations.setArchived(first.id, true);
    expect(await db.repos.conversations.list()).toHaveLength(1);
    expect(await db.repos.conversations.list({ includeArchived: true })).toHaveLength(2);

    await db.repos.conversations.remove(first.id);
    expect(await db.repos.conversations.listMessages(first.id)).toEqual([]);
  });
});

describe('aiJobs', () => {
  it('runs a job through the queue lifecycle', async () => {
    const job = await db.repos.aiJobs.enqueue({
      kind: 'estimate_food',
      payload: { foodLogId: 'log-1', text: 'two rotis' },
    });

    expect(job.status).toBe('queued');
    expect(job.attempts).toBe(0);
    expect(job.payload).toEqual({ foodLogId: 'log-1', text: 'two rotis' });
    expect(await db.repos.aiJobs.listQueued()).toHaveLength(1);

    const running = await db.repos.aiJobs.markRunning(job.id);
    expect(running.status).toBe('running');
    expect(running.attempts).toBe(1);

    const failed = await db.repos.aiJobs.markFailed(job.id, 'offline');
    expect(failed.status).toBe('failed');
    expect(failed.lastError).toBe('offline');

    await db.repos.aiJobs.requeue(job.id);
    await db.repos.aiJobs.markRunning(job.id);
    const done = await db.repos.aiJobs.markDone(job.id, 'log-1');
    expect(done.status).toBe('done');
    expect(done.attempts).toBe(2);
    expect(done.resultRef).toBe('log-1');
    expect(done.lastError).toBeNull();
    expect(await db.repos.aiJobs.listQueued()).toEqual([]);
  });

  it('is idempotent by id', async () => {
    const first = await db.repos.aiJobs.enqueue({
      id: 'weekly-review-2026-03-30',
      kind: 'weekly_review',
      payload: { weekStart: '2026-03-30' },
    });
    const second = await db.repos.aiJobs.enqueue({
      id: 'weekly-review-2026-03-30',
      kind: 'weekly_review',
      payload: { weekStart: '2026-03-30' },
    });

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(await db.repos.aiJobs.list()).toHaveLength(1);
  });

  it('prunes finished jobs older than a cutoff', async () => {
    const kept = await db.repos.aiJobs.enqueue({ kind: 'recipe', payload: {} });
    const stale = await db.repos.aiJobs.enqueue({ kind: 'recipe', payload: {} });
    await db.repos.aiJobs.markDone(stale.id);

    expect(await db.repos.aiJobs.pruneDone('2030-01-01T00:00:00.000Z')).toBe(1);
    expect((await db.repos.aiJobs.list()).map((job) => job.id)).toEqual([kept.id]);
  });
});

describe('safety', () => {
  it('flips safety state on and off again', async () => {
    expect(await db.repos.safety.isActive()).toBe(false);

    const event = await db.repos.safety.create({
      kind: 'pain',
      text: 'Sharp pain in the left shoulder during pressing.',
      source: 'chat',
    });

    expect(event.date).toBe('2026-04-01');
    expect(event.resolvedAt).toBeNull();
    expect(await db.repos.safety.isActive()).toBe(true);
    expect(await db.repos.safety.listOpen()).toHaveLength(1);

    const resolved = await db.repos.safety.resolve(event.id, 'Saw a physio; cleared to press.');
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.note).toBe('Saw a physio; cleared to press.');
    expect(await db.repos.safety.isActive()).toBe(false);
    expect(await db.repos.safety.listOpen()).toEqual([]);
    expect(await db.repos.safety.list({ includeResolved: true })).toHaveLength(1);

    const reopened = await db.repos.safety.reopen(event.id);
    expect(reopened.resolvedAt).toBeNull();
    expect(await db.repos.safety.isActive()).toBe(true);
  });

  it('raises a typed error for an unknown event', async () => {
    await expect(db.repos.safety.resolve('missing')).rejects.toBeInstanceOf(RowNotFoundError);
  });
});
