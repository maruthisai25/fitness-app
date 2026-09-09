/**
 * Memory, profile and safety tools — DESIGN.md §6.3, §6.5, §8.
 *
 * `report_safety` is the one tool that changes what every other part of the app
 * is allowed to do: the row it writes makes `safety.isActive()` true, which
 * flips the readiness modifier to `safety` in `context.ts`, makes the
 * progression engine hold the load and drop a set (DESIGN.md §5.1 rule 1), and
 * raises the banner in both shells.
 */

import { type EvidenceRef } from '@vigor/core';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import type { CoachDeps } from '../deps';
import { fail, idInput, localDateInput, ok } from './shared';

const evidenceInput = z.strictObject({
  table: z.string().min(2).max(40).describe('Table the evidence row lives in, e.g. sets or exercises'),
  id: idInput,
  note: z.string().max(200).nullish(),
});

export function rememberTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'remember',
    description:
      'Store a durable fact about this person: a preference, a dislike, a constraint, an injury, a habit you ' +
      'have observed, or a note about a goal. Everything you store is visible and deletable in You → Memories, ' +
      'so write it as one plain sentence in their own terms. Do NOT store a passing mood, a one-off schedule ' +
      'change, anything they framed as hypothetical, or a number the engines own. Do NOT store the same fact ' +
      'twice — if it is already in the context block, leave it. Attach `evidence` rows whenever a log entry is ' +
      'what convinced you.',
    inputSchema: z.strictObject({
      kind: z.enum(['preference', 'dislike', 'constraint', 'injury', 'behavior', 'fact', 'goal_note']),
      domain: z.enum(['training', 'nutrition', 'general']),
      text: z.string().min(4).max(280),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('1.0 only when they said it outright; lower when you inferred it'),
      evidence: z.array(evidenceInput).max(6).optional(),
      expiresAt: z
        .string()
        .min(10)
        .max(40)
        .nullish()
        .describe('ISO timestamp for something temporary, e.g. a six-week injury'),
    }),
    run: async (input) => {
      const evidence: EvidenceRef[] = (input.evidence ?? []).map((row) => ({
        table: row.table,
        id: row.id,
        note: row.note ?? null,
      }));
      const memory = await deps.repos.memories.create({
        kind: input.kind,
        domain: input.domain,
        text: input.text.trim(),
        source: 'coach',
        confidence: input.confidence ?? 0.8,
        evidence,
        active: true,
        expiresAt: input.expiresAt ?? null,
      });
      return ok({
        memoryId: memory.id,
        kind: memory.kind,
        domain: memory.domain,
        text: memory.text,
        confidence: memory.confidence,
      });
    },
  });
}

export function forgetTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'forget',
    description:
      'Soft-delete one memory when the person asks you to drop it or tells you it is wrong. The row stays for ' +
      'the audit list in You → Memories but stops reaching you. Do NOT forget a memory on your own initiative, ' +
      'and do NOT forget a safety event or an injury unless they explicitly say it has resolved.',
    inputSchema: z.strictObject({
      memoryId: idInput,
      reason: z.string().min(3).max(200).optional().describe('What they said, so the audit list makes sense'),
    }),
    run: async ({ memoryId, reason }) => {
      const memory = await deps.repos.memories.get(memoryId);
      if (memory == null) return fail(`No memory with id ${memoryId}.`);
      await deps.repos.memories.forget(memoryId, reason);
      return ok({ memoryId, forgot: memory.text });
    },
  });
}

export function updateProfileTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'update_profile',
    description:
      'Change profile fields the person has just told you about — body weight, height, preferred session ' +
      'length, where they train, their unit system, their food region. Do NOT change a field they did not ' +
      'mention, do NOT convert units yourself (heights are centimetres and weights are kilograms here, ' +
      'always), and do NOT use this for goals or equipment.',
    inputSchema: z.strictObject({
      displayName: z.string().min(1).max(60).optional(),
      heightCm: z.number().min(80).max(260).nullish(),
      weightKg: z.number().min(25).max(400).nullish(),
      fitnessLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
      trainingExperienceMonths: z.number().int().min(0).max(1200).optional(),
      preferredDurationMin: z.number().int().min(10).max(240).optional(),
      preferredStyles: z.array(z.string().min(2).max(30)).max(8).optional(),
      trainingLocation: z.enum(['home', 'gym', 'outdoor', 'hotel', 'other']).optional(),
      unitSystem: z.enum(['metric', 'imperial']).optional(),
      foodRegion: z.string().min(2).max(16).optional().describe('ISO country code such as IN, or "generic"'),
      activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).optional(),
      notes: z.string().max(500).nullish(),
    }),
    run: async (input) => {
      const patch = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(patch).length === 0) return fail('Nothing to change.');
      const profile = await deps.repos.profile.update(patch);
      return ok({ changed: Object.keys(patch).sort(), profile });
    },
  });
}

export function updateTargetsTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'update_targets',
    description:
      'Write a new effective-dated nutrition target row when the person asks for different numbers. Send all ' +
      'five macros: partial rows make the daily ring meaningless. Do NOT invent targets they did not ask for — ' +
      'if they want you to work them out, say what you would base them on and let them confirm first — and do ' +
      'NOT edit history: this always adds a new row from `effectiveFrom` onward.',
    inputSchema: z.strictObject({
      effectiveFrom: localDateInput.optional().describe('Defaults to today'),
      kcal: z.number().int().min(800).max(8000),
      proteinG: z.number().int().min(0).max(500),
      carbsG: z.number().int().min(0).max(1200),
      fatG: z.number().int().min(0).max(500),
      fiberG: z.number().int().min(0).max(200),
    }),
    run: async (input) => {
      const targets = await deps.repos.targets.create({
        effectiveFrom: input.effectiveFrom ?? deps.clock.today(),
        kcal: input.kcal,
        proteinG: input.proteinG,
        carbsG: input.carbsG,
        fatG: input.fatG,
        fiberG: input.fiberG,
        source: 'user',
      });
      return ok({ targetsId: targets.id, effectiveFrom: targets.effectiveFrom, targets });
    },
  });
}

export function reportSafetyTool(deps: CoachDeps) {
  return betaZodTool({
    name: 'report_safety',
    description:
      'Record pain, a possible injury, dizziness, a symptom or unusual fatigue. Call it the moment the person ' +
      'mentions one, before you answer anything else. It flips the safety state, which holds every load and ' +
      'takes a set off until they clear the event in You → Safety. Do NOT diagnose, do NOT suggest treatment, ' +
      'and do NOT resolve or downplay an event yourself — only the person can clear one. Quote what they said ' +
      'in `text` rather than paraphrasing it into something milder.',
    inputSchema: z.strictObject({
      kind: z.enum(['pain', 'injury', 'dizziness', 'symptom', 'excessive_fatigue']),
      text: z.string().min(3).max(400).describe("What they said, in their words"),
      date: localDateInput.optional().describe('Defaults to today'),
      note: z.string().max(300).nullish().describe('Where it hurt, which movement, anything they added'),
    }),
    run: async (input) => {
      const event = await deps.repos.safety.create({
        kind: input.kind,
        text: input.text,
        source: 'chat',
        date: input.date ?? deps.clock.today(),
        note: input.note ?? null,
        resolvedAt: null,
      });
      const open = await deps.repos.safety.listOpen();
      return ok({
        safetyEventId: event.id,
        kind: event.kind,
        date: event.date,
        safetyActive: open.length > 0,
        openEvents: open.length,
        effect:
          'Loads are held and one set comes off every exercise until this is cleared in You → Safety. ' +
          'Tell them that, and tell them to see a professional for anything sharp, spreading or chest-related.',
      });
    },
  });
}
