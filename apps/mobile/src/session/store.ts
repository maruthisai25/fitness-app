/**
 * In-progress set entry for session mode — DESIGN.md §7.2.
 *
 * "Session mode keeps in-progress set entry in a Zustand store and flushes to
 * `sets` on every confirmation so a crash loses nothing." Nothing durable
 * lives here: the moment the user confirms a set, `sets.record` owns it and
 * the draft is dropped.
 */
import { create } from 'zustand';

import type { Id } from '@vigor/core';

/** What the user has typed for one set but not yet confirmed. */
export interface SetDraftInput {
  /** Reps, seconds or metres, as typed — the load type decides the label. */
  reps: string;
  /** Load in the profile's display units, as typed. */
  load: string;
  /** 6–10 in half steps, or null while unrated. */
  rpe: number | null;
  notes: string;
}

export const EMPTY_SET_INPUT: SetDraftInput = { reps: '', load: '', rpe: null, notes: '' };

interface SessionDraftState {
  /** The workout these drafts belong to; switching sessions clears them. */
  workoutId: Id | null;
  inputs: Record<Id, SetDraftInput>;
  /** Which exercise the full-screen flow is showing. */
  exerciseIndex: number;
  begin: (workoutId: Id) => void;
  setInput: (setId: Id, patch: Partial<SetDraftInput>) => void;
  clearInput: (setId: Id) => void;
  setExerciseIndex: (index: number) => void;
  reset: () => void;
}

export const useSessionDraft = create<SessionDraftState>((set) => ({
  workoutId: null,
  inputs: {},
  exerciseIndex: 0,
  begin: (workoutId) =>
    set((state) =>
      state.workoutId === workoutId
        ? state
        : { workoutId, inputs: {}, exerciseIndex: 0 },
    ),
  setInput: (setId, patch) =>
    set((state) => ({
      inputs: {
        ...state.inputs,
        [setId]: { ...EMPTY_SET_INPUT, ...state.inputs[setId], ...patch },
      },
    })),
  clearInput: (setId) =>
    set((state) => {
      const { [setId]: _removed, ...rest } = state.inputs;
      return { inputs: rest };
    }),
  setExerciseIndex: (exerciseIndex) => set({ exerciseIndex }),
  reset: () => set({ workoutId: null, inputs: {}, exerciseIndex: 0 }),
}));

/** The draft for one set, or an empty one — safe to read during render. */
export function useSetDraft(setId: Id): SetDraftInput {
  return useSessionDraft((state) => state.inputs[setId] ?? EMPTY_SET_INPUT);
}
