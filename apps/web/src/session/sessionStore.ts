/**
 * Session mode's in-progress state — DESIGN.md §7.2: "Session mode keeps
 * in-progress set entry in a Zustand store and flushes to `sets` on every
 * confirmation so a crash loses nothing."
 *
 * Nothing durable lives here. The store holds the text in the boxes, which set
 * is being edited and when the rest timer ends; every confirmed value is
 * written straight to the database by `sets.record`.
 */

import type { Id } from '@vigor/core';
import { create } from 'zustand';

/** Exactly what the user has typed for one set, before it is confirmed. */
export interface SetDraft {
  /** Reps, seconds or metres depending on the exercise's load type. */
  reps: string;
  /** Load in display units — converted to kg by `loadFromText` on confirm. */
  load: string;
  rpe: number | null;
  notes: string;
}

export const EMPTY_DRAFT: SetDraft = { reps: '', load: '', rpe: null, notes: '' };

interface SessionState {
  workoutId: Id | null;
  /** Index into `workout.exercises` — one exercise at a time. */
  activeIndex: number;
  drafts: Record<Id, SetDraft>;
  /** Epoch millis the rest timer ends at, or null when no timer is running. */
  restEndsAt: number | null;
  restTotalSec: number;

  begin: (workoutId: Id) => void;
  setActiveIndex: (index: number) => void;
  patchDraft: (setId: Id, patch: Partial<SetDraft>) => void;
  seedDraft: (setId: Id, draft: SetDraft) => void;
  clearDraft: (setId: Id) => void;
  startRest: (seconds: number, now?: number) => void;
  stopRest: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  workoutId: null,
  activeIndex: 0,
  drafts: {},
  restEndsAt: null,
  restTotalSec: 0,

  begin: (workoutId) =>
    set((state) =>
      state.workoutId === workoutId
        ? state
        : { workoutId, activeIndex: 0, drafts: {}, restEndsAt: null, restTotalSec: 0 },
    ),
  setActiveIndex: (index) => set({ activeIndex: Math.max(0, index), restEndsAt: null }),
  patchDraft: (setId, patch) =>
    set((state) => ({
      drafts: { ...state.drafts, [setId]: { ...(state.drafts[setId] ?? EMPTY_DRAFT), ...patch } },
    })),
  seedDraft: (setId, draft) =>
    set((state) => (state.drafts[setId] ? state : { drafts: { ...state.drafts, [setId]: draft } })),
  clearDraft: (setId) =>
    set((state) => {
      const { [setId]: _removed, ...rest } = state.drafts;
      return { drafts: rest };
    }),
  startRest: (seconds, now = Date.now()) =>
    set({ restEndsAt: now + Math.max(0, seconds) * 1000, restTotalSec: Math.max(0, seconds) }),
  stopRest: () => set({ restEndsAt: null }),
  reset: () =>
    set({ workoutId: null, activeIndex: 0, drafts: {}, restEndsAt: null, restTotalSec: 0 }),
}));

/** The draft for one set, or the empty draft when nothing has been typed. */
export function draftFor(drafts: Record<Id, SetDraft>, setId: Id): SetDraft {
  return drafts[setId] ?? EMPTY_DRAFT;
}
