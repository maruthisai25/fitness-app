import { afterEach, describe, expect, it } from 'vitest';

import { COACH_TOOL_NAMES, createCoachTools } from './tools';
import {
  createAiTestEnv,
  logSession,
  runTool,
  toolFor,
  TEST_TODAY,
  type AiTestEnv,
} from './testFixtures';

let env: AiTestEnv | null = null;

async function setup(): Promise<AiTestEnv> {
  env = await createAiTestEnv();
  return env;
}

afterEach(async () => {
  await env?.close();
  env = null;
});

describe('the tool set', () => {
  it('exposes every tool DESIGN.md §6.3 lists, in a fixed order', async () => {
    const tools = createCoachTools((await setup()).deps);
    expect(tools.map((tool) => tool.name)).toEqual([...COACH_TOOL_NAMES]);
  });

  it('tells the model what each tool must not do', async () => {
    const tools = createCoachTools((await setup()).deps);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(80);
      expect(tool.description).toMatch(/Do NOT|do NOT|never|Never/);
    }
  });
});

describe('propose_workout', () => {
  it('fills loads and rep targets from the progression engine, not the model', async () => {
    const scope = await setup();
    // Three sets at the top of a 6–10 range at RPE 8 → one increment up.
    await logSession(scope, {
      exerciseId: scope.exercises.bench.id,
      date: '2026-09-03',
      loadKg: 60,
      reps: [10, 10, 10],
      rpe: 8,
    });

    const result = await runTool(toolFor(scope, 'propose_workout'), {
      title: 'Upper body push',
      plannedDurationMin: 45,
      summary: 'Bench is due a jump and the row keeps pulling volume up.',
      focus: ['chest', 'back'],
      exercises: [
        { exerciseId: scope.exercises.bench.id, order: 0, targetSets: 3, restSec: 150 },
        { exerciseId: scope.exercises.row.id, order: 1, targetSets: 3, restSec: 120 },
      ],
    });

    expect(result.ok).toBe(true);
    const exercises = result.exercises as { exerciseId: string; loadKg: number | null; display: string; action: string }[];
    const bench = exercises.find((entry) => entry.exerciseId === scope.exercises.bench.id);
    expect(bench?.action).toBe('increase_load');
    expect(bench?.loadKg).toBe(62.5);
    expect(bench?.display).toBe('62.5 kg');

    const stored = await scope.db.repos.workouts.getWithExercises(result.workoutId as string);
    expect(stored?.status).toBe('planned');
    expect(stored?.source).toBe('ai');
    expect(stored?.date).toBe(TEST_TODAY);
    const storedBench = stored?.exercises.find(
      (entry) => entry.exerciseId === scope.exercises.bench.id,
    );
    expect(storedBench?.targetLoadKg).toBe(62.5);
    expect(storedBench?.targetRepMin).toBe(6);
    expect(storedBench?.progressionDecision?.rationale.codes).toContain('PROGRESS_LOAD');
    expect(stored?.rationale?.codes).toContain('COACH_PROPOSED');
  });

  it('never accepts a model-supplied load or rep target', async () => {
    const scope = await setup();
    const tool = toolFor(scope, 'propose_workout');
    const withLoad = {
      title: 'Upper body push',
      plannedDurationMin: 45,
      summary: 'Trying to set the load myself.',
      exercises: [
        {
          exerciseId: scope.exercises.bench.id,
          order: 0,
          targetSets: 3,
          restSec: 150,
          targetLoadKg: 100,
        },
      ],
    };
    expect(() => tool.parse(withLoad)).toThrow();
    expect(() =>
      tool.parse({
        ...withLoad,
        exercises: [
          { exerciseId: scope.exercises.bench.id, order: 0, targetSets: 3, restSec: 150, targetRepMax: 3 },
        ],
      }),
    ).toThrow();
    // The schema has no field for either, so nothing was written.
    expect(await scope.db.repos.workouts.listRange({ from: '2026-01-01', to: '2026-12-31' })).toEqual([]);
  });

  it('applies a lighter override through the engine and demands a reason', async () => {
    const scope = await setup();
    await logSession(scope, {
      exerciseId: scope.exercises.bench.id,
      date: '2026-09-03',
      loadKg: 60,
      reps: [10, 10, 10],
      rpe: 8,
    });

    const missingReason = await runTool(toolFor(scope, 'propose_workout'), {
      title: 'Easy push',
      plannedDurationMin: 30,
      summary: 'Backing off after a bad night.',
      exercises: [
        { exerciseId: scope.exercises.bench.id, order: 0, targetSets: 3, restSec: 150, override: 'lighter' },
      ],
    });
    expect(missingReason.ok).toBe(false);
    expect(String(missingReason.error)).toContain('needs a reason');

    const result = await runTool(toolFor(scope, 'propose_workout'), {
      title: 'Easy push',
      plannedDurationMin: 30,
      summary: 'Backing off after a bad night.',
      exercises: [
        {
          exerciseId: scope.exercises.bench.id,
          order: 0,
          targetSets: 3,
          restSec: 150,
          override: 'lighter',
          overrideReason: 'They slept four hours and asked for something easier.',
        },
      ],
    });
    const exercises = result.exercises as { loadKg: number; action: string }[];
    expect(exercises[0].action).toBe('decrease_load');
    expect(exercises[0].loadKg).toBe(57.5);
  });

  it('holds the load and drops a set while a safety event is open', async () => {
    const scope = await setup();
    await logSession(scope, {
      exerciseId: scope.exercises.bench.id,
      date: '2026-09-03',
      loadKg: 60,
      reps: [10, 10, 10],
      rpe: 8,
    });
    await runTool(toolFor(scope, 'report_safety'), {
      kind: 'pain',
      text: 'Sharp pain in the right shoulder at the bottom of the press',
    });

    const result = await runTool(toolFor(scope, 'propose_workout'), {
      title: 'Careful push',
      plannedDurationMin: 30,
      summary: 'Keeping today conservative while the shoulder settles.',
      exercises: [
        { exerciseId: scope.exercises.bench.id, order: 0, targetSets: 3, restSec: 150 },
      ],
    });

    expect(result.safetyActive).toBe(true);
    expect(result.readinessModifier).toBe('safety');
    const exercises = result.exercises as { loadKg: number; targetSets: number; action: string }[];
    expect(exercises[0].loadKg).toBe(60);
    expect(exercises[0].targetSets).toBe(2);
    expect(result.rationale).toMatchObject({ codes: expect.arrayContaining(['SAFETY_ACTIVE']) });
  });

  it('refuses an unknown exercise id and a repeated one', async () => {
    const scope = await setup();
    const missing = await runTool(toolFor(scope, 'propose_workout'), {
      title: 'Push',
      plannedDurationMin: 30,
      summary: 'A session using an id that does not exist.',
      exercises: [{ exerciseId: 'ex_not_real', order: 0, targetSets: 3, restSec: 120 }],
    });
    expect(missing.ok).toBe(false);
    expect(String(missing.error)).toContain('ex_not_real');

    const duplicate = await runTool(toolFor(scope, 'propose_workout'), {
      title: 'Push',
      plannedDurationMin: 30,
      summary: 'A session listing the same lift twice.',
      exercises: [
        { exerciseId: scope.exercises.bench.id, order: 0, targetSets: 3, restSec: 120 },
        { exerciseId: scope.exercises.bench.id, order: 1, targetSets: 2, restSec: 120 },
      ],
    });
    expect(duplicate.ok).toBe(false);
    expect(String(duplicate.error)).toContain('twice');
  });
});

describe('report_safety', () => {
  it('writes the event and flips the safety state', async () => {
    const scope = await setup();
    expect(await scope.db.repos.safety.isActive()).toBe(false);

    const result = await runTool(toolFor(scope, 'report_safety'), {
      kind: 'dizziness',
      text: 'I got dizzy standing up after the last set',
      note: 'Third set of squats',
    });

    expect(result.ok).toBe(true);
    expect(result.safetyActive).toBe(true);
    const open = await scope.db.repos.safety.listOpen();
    expect(open).toHaveLength(1);
    expect(open[0].kind).toBe('dizziness');
    expect(open[0].source).toBe('chat');
    expect(open[0].date).toBe(TEST_TODAY);
    expect(open[0].text).toContain('dizzy standing up');
    expect(await scope.db.repos.safety.isActive()).toBe(true);
  });
});

describe('remember and forget', () => {
  it('writes a coach memory and soft-deletes it with an audit reason', async () => {
    const scope = await setup();
    const remembered = await runTool(toolFor(scope, 'remember'), {
      kind: 'constraint',
      domain: 'training',
      text: 'Can only train before 07:00 on weekdays',
      confidence: 0.9,
      evidence: [{ table: 'workouts', id: 'w-1', note: 'Every logged session starts at 06:10' }],
    });
    expect(remembered.ok).toBe(true);

    const active = await scope.db.repos.memories.listActive();
    expect(active).toHaveLength(1);
    expect(active[0].source).toBe('coach');
    expect(active[0].evidence[0].table).toBe('workouts');

    const forgotten = await runTool(toolFor(scope, 'forget'), {
      memoryId: remembered.memoryId,
      reason: 'They changed jobs and train in the evening now',
    });
    expect(forgotten.ok).toBe(true);
    expect(await scope.db.repos.memories.listActive()).toEqual([]);
    const audit = await scope.db.repos.memories.listForgotten();
    expect(audit[0].reason).toContain('changed jobs');
  });

  it('refuses to forget a memory that does not exist', async () => {
    const scope = await setup();
    const result = await runTool(toolFor(scope, 'forget'), { memoryId: 'mem-nope' });
    expect(result.ok).toBe(false);
  });
});

describe('substitute_exercise', () => {
  it('applies the engine\'s top pick and re-runs progression for it', async () => {
    const scope = await setup();
    const proposed = await runTool(toolFor(scope, 'propose_workout'), {
      title: 'Push',
      plannedDurationMin: 40,
      summary: 'Straightforward pressing session.',
      exercises: [{ exerciseId: scope.exercises.bench.id, order: 0, targetSets: 3, restSec: 150 }],
    });
    const stored = await scope.db.repos.workouts.getWithExercises(proposed.workoutId as string);
    const row = stored?.exercises[0];

    const result = await runTool(toolFor(scope, 'substitute_exercise'), {
      workoutExerciseId: row?.id,
      reason: 'equipment_unavailable',
    });

    expect(result.ok).toBe(true);
    const applied = result.applied as { exerciseId: string; name: string };
    expect(applied.exerciseId).toBe(scope.exercises.dbBench.id);

    const after = await scope.db.repos.workouts.getExercise(row?.id ?? '');
    expect(after?.exerciseId).toBe(scope.exercises.dbBench.id);
    expect(after?.substitutedFromExerciseId).toBe(scope.exercises.bench.id);
    expect(after?.progressionDecision).not.toBeNull();
  });
});

describe('history and search', () => {
  it('returns logged sets with both the canonical load and a display string', async () => {
    const scope = await setup();
    await logSession(scope, {
      exerciseId: scope.exercises.squat.id,
      date: '2026-09-05',
      loadKg: 90,
      reps: [5, 5, 4],
      rpe: 9,
    });

    const result = await runTool(toolFor(scope, 'get_exercise_history'), {
      exerciseId: scope.exercises.squat.id,
    });
    const sessions = result.sessions as { sets: { loadKg: number; display: string; rpe: number }[] }[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sets[0].loadKg).toBe(90);
    expect(sessions[0].sets[0].display).toBe('90 kg');
  });

  it('marks whether the user actually owns the equipment a result needs', async () => {
    const scope = await setup();
    const result = await runTool(toolFor(scope, 'search_exercises'), {
      pattern: 'horizontal_push',
    });
    const exercises = result.exercises as { name: string; userHasEquipment: boolean }[];
    expect(exercises.length).toBeGreaterThan(0);
    expect(exercises.every((entry) => entry.userHasEquipment)).toBe(true);
  });
});

describe('log_food', () => {
  it('writes the log and its items and reports the day state from the engine', async () => {
    const scope = await setup();
    await scope.db.repos.targets.create({
      effectiveFrom: '2026-09-01',
      kcal: 2600,
      proteinG: 150,
      carbsG: 280,
      fatG: 72,
      fiberG: 36,
    });

    const result = await runTool(toolFor(scope, 'log_food'), {
      mealSlot: 'lunch',
      rawText: 'two rotis, a bowl of rajma and some curd',
      items: [
        { name: 'Roti', quantity: 2, unit: 'roti', kcal: 240, proteinG: 8, carbsG: 46, fatG: 3, fiberG: 4, confidence: 0.8 },
        { name: 'Rajma', quantity: 1, unit: 'bowl', kcal: 260, proteinG: 14, carbsG: 40, fatG: 5, fiberG: 11, confidence: 0.7 },
        { name: 'Curd', quantity: 150, unit: 'g', kcal: 90, proteinG: 6, carbsG: 7, fatG: 4, fiberG: 0, confidence: 0.9 },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.itemCount).toBe(3);
    expect(result.hasTargets).toBe(true);
    expect(result.dayConsumed).toMatchObject({ kcal: 590, proteinG: 28 });
    expect(result.dayRemaining).toMatchObject({ kcal: 2010 });

    const day = await scope.db.repos.nutrition.getDay(TEST_TODAY);
    expect(day.logs).toHaveLength(1);
    expect(day.logs[0].items).toHaveLength(3);
    expect(day.logs[0].source).toBe('ai');
  });
});

describe('adjust_workout', () => {
  it('trims the session to fit a shorter slot', async () => {
    const scope = await setup();
    const proposed = await runTool(toolFor(scope, 'propose_workout'), {
      title: 'Full session',
      plannedDurationMin: 60,
      summary: 'A normal upper-lower day.',
      exercises: [
        { exerciseId: scope.exercises.squat.id, order: 0, targetSets: 4, restSec: 180 },
        { exerciseId: scope.exercises.bench.id, order: 1, targetSets: 4, restSec: 150 },
        { exerciseId: scope.exercises.row.id, order: 2, targetSets: 4, restSec: 150 },
      ],
    });

    const result = await runTool(toolFor(scope, 'adjust_workout'), {
      workoutId: proposed.workoutId,
      durationMin: 20,
    });

    expect(result.ok).toBe(true);
    const after = await scope.db.repos.workouts.getWithExercises(proposed.workoutId as string);
    expect(after?.exercises.length).toBeLessThan(3);
    expect(after?.plannedDurationMin).toBe(20);
  });

  it('lightens every remaining lift through the engine when asked', async () => {
    const scope = await setup();
    await logSession(scope, {
      exerciseId: scope.exercises.bench.id,
      date: '2026-09-03',
      loadKg: 60,
      reps: [10, 10, 10],
      rpe: 8,
    });
    const proposed = await runTool(toolFor(scope, 'propose_workout'), {
      title: 'Push',
      plannedDurationMin: 40,
      summary: 'Bench is due a jump today.',
      exercises: [{ exerciseId: scope.exercises.bench.id, order: 0, targetSets: 3, restSec: 150 }],
    });

    const result = await runTool(toolFor(scope, 'adjust_workout'), {
      workoutId: proposed.workoutId,
      intensity: 'lighter',
      intensityReason: 'They said their elbow feels stiff today.',
    });

    const exercises = result.exercises as { loadKg: number; why: string }[];
    expect(exercises[0].loadKg).toBe(57.5);
    expect(exercises[0].why).toContain('coach asked');
  });
});
