/**
 * Live streaming state for one coach turn, per conversation — DESIGN.md §7.1
 * "streaming assistant text, tool activity chips".
 *
 * `runCoachTurn` already persists every row as it goes (DESIGN.md §6.2), so
 * this store only holds what has not landed in `messages` yet: the text still
 * arriving, tool activity in flight, and the turn's outcome (a refusal, an
 * error, or the memories it just remembered). Once the turn finishes and the
 * message list refetches, the persisted history takes over and this clears.
 *
 * Same shape as `session/store.ts`'s Zustand draft store, keyed by
 * conversation instead of by set id.
 */
import { create } from 'zustand';
import type { AiError, CoachRefusal } from '@vigor/ai';

export interface StreamToolActivity {
  toolUseId: string;
  name: string;
  input: unknown;
  status: 'running' | 'ok' | 'error';
  content: string | null;
}

export interface RememberedChipView {
  id: string;
  text: string;
  confidence: number;
}

export interface ConversationStreamState {
  sending: boolean;
  /** The user's own message, shown immediately, before the turn round-trips. */
  pendingUserText: string;
  text: string;
  thinking: string;
  tools: StreamToolActivity[];
  refusal: CoachRefusal | null;
  error: AiError | null;
  remembered: RememberedChipView[];
}

const EMPTY_STATE: ConversationStreamState = {
  sending: false,
  pendingUserText: '',
  text: '',
  thinking: '',
  tools: [],
  refusal: null,
  error: null,
  remembered: [],
};

interface CoachStreamStore {
  byConversation: Record<string, ConversationStreamState>;
  begin: (conversationId: string, userText: string) => void;
  appendText: (conversationId: string, chunk: string) => void;
  appendThinking: (conversationId: string, chunk: string) => void;
  toolStart: (conversationId: string, toolUseId: string, name: string, input: unknown) => void;
  toolResult: (conversationId: string, toolUseId: string, ok: boolean, content: string) => void;
  setRefusal: (conversationId: string, refusal: CoachRefusal | null) => void;
  setError: (conversationId: string, error: AiError | null) => void;
  setRemembered: (conversationId: string, chips: RememberedChipView[]) => void;
  finish: (conversationId: string) => void;
}

function update(
  state: CoachStreamStore,
  conversationId: string,
  patch: Partial<ConversationStreamState>,
): Pick<CoachStreamStore, 'byConversation'> {
  const current = state.byConversation[conversationId] ?? EMPTY_STATE;
  return {
    byConversation: { ...state.byConversation, [conversationId]: { ...current, ...patch } },
  };
}

export const useCoachStream = create<CoachStreamStore>((set) => ({
  byConversation: {},
  begin: (conversationId, userText) =>
    set((state) => update(state, conversationId, { ...EMPTY_STATE, sending: true, pendingUserText: userText })),
  appendText: (conversationId, chunk) =>
    set((state) => {
      const current = state.byConversation[conversationId] ?? EMPTY_STATE;
      return update(state, conversationId, { text: current.text + chunk });
    }),
  appendThinking: (conversationId, chunk) =>
    set((state) => {
      const current = state.byConversation[conversationId] ?? EMPTY_STATE;
      return update(state, conversationId, { thinking: current.thinking + chunk });
    }),
  toolStart: (conversationId, toolUseId, name, input) =>
    set((state) => {
      const current = state.byConversation[conversationId] ?? EMPTY_STATE;
      const tools: StreamToolActivity[] = [
        ...current.tools,
        { toolUseId, name, input, status: 'running', content: null },
      ];
      return update(state, conversationId, { tools });
    }),
  toolResult: (conversationId, toolUseId, ok, content) =>
    set((state) => {
      const current = state.byConversation[conversationId] ?? EMPTY_STATE;
      const tools = current.tools.map((tool) =>
        tool.toolUseId === toolUseId ? { ...tool, status: ok ? ('ok' as const) : ('error' as const), content } : tool,
      );
      return update(state, conversationId, { tools });
    }),
  setRefusal: (conversationId, refusal) => set((state) => update(state, conversationId, { refusal })),
  setError: (conversationId, error) => set((state) => update(state, conversationId, { error, sending: false })),
  setRemembered: (conversationId, remembered) => set((state) => update(state, conversationId, { remembered })),
  finish: (conversationId) => set((state) => update(state, conversationId, { sending: false })),
}));

export function useConversationStream(conversationId: string): ConversationStreamState {
  return useCoachStream((state) => state.byConversation[conversationId] ?? EMPTY_STATE);
}
