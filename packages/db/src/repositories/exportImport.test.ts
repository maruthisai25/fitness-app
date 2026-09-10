import type { ExportBundle, WorkoutPlan } from '@vigor/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '../testing';
import { EXPORT_SCHEMA_VERSION, UnsupportedBundleError } from './exportImport';

let source: TestDatabase;

beforeEach(async () => {
  source = await createTestDatabase({ start: '2026-05-01T06:00:00.000Z' });
});

afterEach(async () => {
  await source.close();
});

/** Touches every table `ExportTables` carries, so the round-trip is meaningful. */
async function seedEverything(db: TestDatabase): Promise<void> {
  const repos = db.repos;

  await repos.profile.save({
    displayName: 'Test athlete',
    unitSystem: 'imperial',
    foodRegion: 'IN',
    heightCm: 178,
    weightKg: 74.5,
  });
  await repos.goals.create({ type: 'hypertrophy', priority: 1, targetNote: 'Add upper mass' });
  await repos.equipment.create({ name: 'Adjustable dumbbells', category: 'dumbbell' });
  await repos.targets.create({
    effectiveFrom: '2026-05-01',
    kcal: 2600,
    proteinG: 165,
    carbsG: 280,
    fatG: 75,
    fiberG: 36,
    source: 'computed',
  });
  await repos.settings.setMany({
    onboardingComplete: true,
    weekStartsOn: 1,
    reminderTimes: { workout: '07:30', mealLog: null, protein: '18:30', weeklyReview: null },
    apiKeyRef: 'secure-store://anthropic',
    insightsLastRunOn: '2026-05-01',
    weeklyReviewDay: 0,
    lastReviewViewedWeek: '2026-04-20',
    serverSideFallback: false,
  });

  const press = await repos.exercises.create({
    name: 'Dumbbell bench press',
    slug: 'dumbbell-bench-press',
    movementPattern: 'horizontal_push',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'front delts'],
    equipment: ['dumbbell'],
    instructions: 'Press both dumbbells from chest to lockout.',
    cues: ['ribs down', 'elbows at 45 degrees'],
  });
  const pushUp = await repos.exercises.create({
    name: 'Push-up',
    slug: 'push-up',
    movementPattern: 'horizontal_push',
    primaryMuscles: ['chest'],
    equipment: ['bodyweight'],
    loadType: 'bodyweight',
  });
  await repos.exercises.addRelation({
    fromId: press.id,
    toId: pushUp.id,
    kind: 'regression',
    note: 'Same pattern with no load.',
  });

  const readiness = await repos.readiness.upsertForDate('2026-05-02', {
    sleepHours: 7.5,
    sleepQuality: 4,
    energy: 4,
    soreness: 2,
    fatigue: 2,
    stress: 2,
    score: 78,
  });

  const plan: WorkoutPlan = {
    date: '2026-05-02',
    title: 'Upper A',
    focus: ['chest'],
    plannedDurationMin: 40,
    source: 'ai',
    readinessId: readiness.id,
    notes: null,
    rationale: {
      codes: ['PROGRESS_LOAD'],
      facts: { increment: 2 },
      summary: 'Load goes up by one increment.',
    },
    exercises: [
      {
        exerciseId: press.id,
        order: 0,
        targetSets: 2,
        targetRepMin: 8,
        targetRepMax: 12,
        targetLoadKg: 22,
        restSec: 90,
        tempo: '2-0-1',
        substitutedFromExerciseId: null,
        progressionDecision: null,
        notes: null,
      },
    ],
  };
  const workout = await repos.workouts.createPlanned(plan);
  const [slot] = await repos.workouts.listExercises(workout.id);
  for (const set of slot!.sets) {
    await repos.sets.record(set.id, { actualReps: 12, actualLoadKg: 22, rpe: 8 });
  }
  await repos.workouts.finish(workout.id);
  await repos.records.create({
    exerciseId: press.id,
    kind: 'e1rm',
    value: 30.8,
    loadKg: 22,
    reps: 12,
    setId: slot!.sets[0]!.id,
    date: '2026-05-02',
  });

  await repos.body.upsertMetric({
    date: '2026-05-02',
    weightKg: 74.5,
    waistCm: 82,
    measurements: { chestCm: 102, armCm: 36 },
  });
  await repos.body.addPhoto({
    date: '2026-05-02',
    view: 'front',
    fileRef: 'photos/2026-05-02.jpg',
  });

  const log = await repos.nutrition.createLog({
    date: '2026-05-02',
    mealSlot: 'lunch',
    rawText: '200g chicken, two rotis, cottage cheese',
    source: 'ai',
    items: [
      {
        name: 'chicken breast',
        quantity: 200,
        unit: 'g',
        kcal: 330,
        proteinG: 62,
        carbsG: 0,
        fatG: 7,
        fiberG: 0,
        confidence: 0.86,
        savedMealId: null,
      },
    ],
  });
  expect(log.items).toHaveLength(1);

  await repos.savedMeals.create({
    name: 'Chicken rice bowl',
    items: [
      {
        name: 'chicken and rice',
        quantity: 1,
        unit: 'bowl',
        kcal: 650,
        proteinG: 60,
        carbsG: 70,
        fatG: 12,
        fiberG: 4,
        confidence: 1,
        savedMealId: null,
      },
    ],
  });
  await repos.inventory.add({ name: 'Paneer', quantity: 200, unit: 'g', useBy: '2026-05-04' });
  await repos.recipes.create({
    title: 'Paneer bhurji',
    ingredients: [{ name: 'paneer', quantity: 200, unit: 'g', note: null }],
    steps: ['Crumble the paneer.', 'Cook with onion and tomato.'],
    perServing: { kcal: 420, proteinG: 30, carbsG: 12, fatG: 28, fiberG: 3 },
    tags: ['high-protein', 'vegetarian'],
  });
  await repos.mealPlans.create({
    startDate: '2026-05-03',
    plan: [
      {
        date: '2026-05-03',
        meals: [],
        totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
      },
    ],
  });

  await repos.memories.create({
    kind: 'preference',
    domain: 'training',
    text: 'Prefers dumbbells over barbells.',
    source: 'coach',
    evidence: [{ table: 'workouts', id: workout.id, note: null }],
  });
  await repos.insights.create({
    detector: 'PUSH_PULL_BALANCE',
    period: { from: '2026-04-05', to: '2026-05-02' },
    headline: 'Pulling volume is ahead of pushing.',
    detail: 'Four-week set ratio is 1.6.',
    severity: 'notice',
  });
  await repos.reviews.upsert({
    weekStart: '2026-04-27',
    training: {
      workoutsCompleted: 4,
      workoutsPlanned: 5,
      completionRate: 0.8,
      totalSets: 62,
      totalVolumeKg: 18400,
      volumeByMuscleGroup: [{ muscle: 'chest', sets: 12, volumeKg: 3400 }],
      personalRecords: [],
      missedSessions: 1,
      averageRpe: 8.1,
      averageDurationMin: 42,
    },
    nutrition: {
      daysLogged: 6,
      averageKcal: 2480,
      averageProteinG: 158,
      averageCarbsG: 262,
      averageFatG: 71,
      averageFiberG: 29,
      targetHitRate: { kcal: 0.7, proteinG: 0.6, carbsG: 0.8, fatG: 0.9, fiberG: 0.4 },
      missedTargets: ['fiberG'],
    },
  });

  const conversation = await repos.conversations.create({ title: 'What should I do today?' });
  await repos.conversations.appendMessage(conversation.id, {
    role: 'user',
    content: [{ type: 'text', text: 'What should I train today?' }],
  });
  await repos.conversations.appendMessage(conversation.id, {
    role: 'assistant',
    content: [{ type: 'text', text: 'Upper A, and the dumbbell press goes up to 22 kg.' }],
    model: 'claude-opus-5',
    usage: {
      inputTokens: 4100,
      outputTokens: 260,
      cacheCreationInputTokens: 1800,
      cacheReadInputTokens: 2100,
    },
  });

  await repos.aiJobs.enqueue({ kind: 'weekly_review', payload: { weekStart: '2026-04-27' } });
  await repos.safety.create({
    date: '2026-05-02',
    kind: 'pain',
    text: 'Sharp twinge in the left shoulder on the second set.',
    source: 'session',
  });
}

describe('export.bundle', () => {
  it('captures every table and never carries the API key handle', async () => {
    await seedEverything(source);

    const bundle = await source.repos.export.bundle();

    expect(bundle.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(bundle.unitSystem).toBe('imperial');
    expect(bundle.tables.profile).toHaveLength(1);
    expect(bundle.tables.workouts).toHaveLength(1);
    expect(bundle.tables.sets).toHaveLength(2);
    expect(bundle.tables.messages).toHaveLength(2);
    expect(bundle.tables.exerciseRelations).toHaveLength(1);

    // DESIGN.md §8 — the key handle is stripped, the rest of settings survives.
    const keys = bundle.tables.settings.map((entry) => entry.key);
    expect(keys).not.toContain('apiKeyRef');
    expect(keys).toContain('onboardingComplete');
    expect(JSON.stringify(bundle)).not.toContain('secure-store://anthropic');
  });

  it('round-trips every settings key except the API key handle', async () => {
    await seedEverything(source);
    const before = await source.repos.settings.getAll();

    const bundle = await source.repos.export.bundle();
    const exported = bundle.tables.settings.map((entry) => entry.key);
    // The phase 4–6 keys travel with the bundle …
    expect(exported).toEqual(
      expect.arrayContaining([
        'insightsLastRunOn',
        'weeklyReviewDay',
        'lastReviewViewedWeek',
        'serverSideFallback',
      ]),
    );
    // … and the SecureStore handle does not (DESIGN.md §8).
    expect(exported).not.toContain('apiKeyRef');

    const target = await createTestDatabase();
    await target.repos.export.restore(bundle);
    const after = await target.repos.settings.getAll();

    expect(after.insightsLastRunOn).toBe('2026-05-01');
    expect(after.weeklyReviewDay).toBe(0);
    expect(after.lastReviewViewedWeek).toBe('2026-04-20');
    expect(after.serverSideFallback).toBe(false);
    // Everything else is identical; only the key handle is back at its default.
    expect(after).toEqual({ ...before, apiKeyRef: null });
    await target.close();
  });

  it('carries photo bytes the caller supplies', async () => {
    await seedEverything(source);
    const bundle = await source.repos.export.bundle({
      photos: [{ fileRef: 'photos/2026-05-02.jpg', base64: 'AAAA' }],
      appVersion: '1.2.3',
      exportedAt: '2026-05-03T00:00:00.000Z',
    });

    expect(bundle.photos).toEqual([{ fileRef: 'photos/2026-05-02.jpg', base64: 'AAAA' }]);
    expect(bundle.appVersion).toBe('1.2.3');
    expect(bundle.exportedAt).toBe('2026-05-03T00:00:00.000Z');
  });
});

describe('export.restore', () => {
  it('round-trips into a fresh database', async () => {
    await seedEverything(source);
    const bundle = await source.repos.export.bundle();

    const target = await createTestDatabase();
    const result = await target.repos.export.restore(bundle);
    expect(result.mode).toBe('replace');
    expect(result.inserted.workouts).toBe(1);
    expect(result.inserted.sets).toBe(2);

    const restored = await target.repos.export.bundle();
    expect(restored.tables).toEqual(bundle.tables);

    // The restored database is usable, not just row-equal.
    const day = await target.repos.nutrition.getDay('2026-05-02');
    expect(day.consumed.proteinG).toBe(62);
    expect(day.targets?.kcal).toBe(2600);

    const exercises = await target.repos.exercises.list();
    const press = exercises.find((row) => row.slug === 'dumbbell-bench-press');
    expect(press).toBeDefined();
    const history = await target.repos.workouts.getExerciseHistory(press!.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.sets).toHaveLength(2);

    await target.close();
  });

  it('replaces existing rows rather than appending to them', async () => {
    await seedEverything(source);
    const bundle = await source.repos.export.bundle();

    const target = await createTestDatabase();
    await target.repos.profile.save({ displayName: 'Someone else' });
    await target.repos.goals.create({ type: 'fat_loss' });

    await target.repos.export.restore(bundle);

    const profile = await target.repos.profile.get();
    expect(profile?.displayName).toBe('Test athlete');
    const goals = await target.repos.goals.list();
    expect(goals).toHaveLength(1);
    expect(goals[0]?.type).toBe('hypertrophy');

    await target.close();
  });

  it('merges without touching rows the database already has', async () => {
    await seedEverything(source);
    const bundle = await source.repos.export.bundle();

    const target = await createTestDatabase();
    const local = await target.repos.goals.create({ type: 'consistency', targetNote: 'local' });

    const result = await target.repos.export.restore(bundle, { mode: 'merge' });
    expect(result.mode).toBe('merge');

    const goals = await target.repos.goals.list();
    expect(goals.map((goal) => goal.type).sort()).toEqual(['consistency', 'hypertrophy']);
    expect(goals.find((goal) => goal.id === local.id)?.targetNote).toBe('local');

    // Re-merging the same bundle is a no-op.
    const second = await target.repos.export.restore(bundle, { mode: 'merge' });
    expect(second.inserted.goals).toBe(0);
    expect(await target.repos.goals.list()).toHaveLength(2);

    await target.close();
  });

  it('imports a version 1 bundle, filling in insights.dismissedAt', async () => {
    await seedEverything(source);
    const current = await source.repos.export.bundle();

    // A v1 backup, taken before migration 0001 added the column: the field is
    // not `null` in those files, it is simply absent.
    const v1 = {
      ...current,
      schemaVersion: 1,
      tables: {
        ...current.tables,
        insights: current.tables.insights.map((row) => {
          const { dismissedAt: _dropped, ...rest } = row;
          return rest;
        }),
      },
    } as unknown as ExportBundle;
    expect(v1.tables.insights[0]).not.toHaveProperty('dismissedAt');

    const target = await createTestDatabase();
    const result = await target.repos.export.restore(v1);
    expect(result.inserted.insights).toBe(current.tables.insights.length);

    const restored = await target.repos.insights.listOpen();
    expect(restored).toHaveLength(1);
    expect(restored[0]?.detector).toBe('PUSH_PULL_BALANCE');
    expect(restored[0]?.dismissedAt).toBeNull();

    // Everything else in the bundle survives the upgrade untouched.
    const rebundled = await target.repos.export.bundle();
    expect(rebundled.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(rebundled.tables).toEqual(current.tables);

    await target.close();
  });

  it('refuses a bundle from an unknown schema version', async () => {
    const bundle = await source.repos.export.bundle();
    const future: ExportBundle = { ...bundle, schemaVersion: EXPORT_SCHEMA_VERSION + 1 };

    await expect(source.repos.export.restore(future)).rejects.toBeInstanceOf(
      UnsupportedBundleError,
    );
  });

  it('refuses a bundle that does not match the core schema', async () => {
    const bundle = await source.repos.export.bundle();
    const broken = {
      ...bundle,
      tables: { ...bundle.tables, goals: [{ id: 'x' }] },
    } as unknown as ExportBundle;

    await expect(source.repos.export.restore(broken)).rejects.toThrow();
  });
});
